/**
 * PGRBRouter - 前端零拷贝二进制图路由引擎 (PGRB Format)
 * 包含 IndexedDB 离线持久化缓存、O(1) 网格空间索引与 0-GC 内存复用
 */

export class FlatBinaryMinHeap {
    constructor(capacity = 65536) {
        this.capacity = capacity;
        this.nodes = new Uint32Array(capacity);
        this.dists = new Float32Array(capacity);
        this.size = 0;
    }

    clear() {
        this.size = 0;
    }

    isEmpty() {
        return this.size === 0;
    }

    push(node, dist) {
        if (this.size >= this.capacity) {
            const newCap = this.capacity * 2;
            const newNodes = new Uint32Array(newCap);
            const newDists = new Float32Array(newCap);
            newNodes.set(this.nodes);
            newDists.set(this.dists);
            this.nodes = newNodes;
            this.dists = newDists;
            this.capacity = newCap;
        }

        let i = this.size++;
        this.nodes[i] = node;
        this.dists[i] = dist;

        // Up-heap
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.dists[i] >= this.dists[p]) break;

            const tn = this.nodes[i], td = this.dists[i];
            this.nodes[i] = this.nodes[p]; this.dists[i] = this.dists[p];
            this.nodes[p] = tn; this.dists[p] = td;
            i = p;
        }
    }

    pop() {
        if (this.size === 0) return null;
        const topNode = this.nodes[0];
        const topDist = this.dists[0];

        this.size--;
        if (this.size > 0) {
            this.nodes[0] = this.nodes[this.size];
            this.dists[0] = this.dists[this.size];

            let i = 0;
            while (true) {
                let smallest = i;
                const left = (i << 1) + 1;
                const right = left + 1;

                if (left < this.size && this.dists[left] < this.dists[smallest]) smallest = left;
                if (right < this.size && this.dists[right] < this.dists[smallest]) smallest = right;

                if (smallest === i) break;

                const tn = this.nodes[i], td = this.dists[i];
                this.nodes[i] = this.nodes[smallest]; this.dists[i] = this.dists[smallest];
                this.nodes[smallest] = tn; this.dists[smallest] = td;
                i = smallest;
            }
        }
        return { node: topNode, dist: topDist };
    }
}

export class PGRBRouter {
    constructor() {
        this.isLoaded = false;
        this.networkId = null;
        this.nodeCount = 0;
        this.edgeCount = 0;
        this.pointCount = 0;
        this.bbox = { minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 };

        // Zero-Copy TypedArray 视图
        this._nodeOffsets = null;     // Uint32Array [N + 1]
        this._edgesTarget = null;     // Uint32Array [M]
        this._edgesCost = null;       // Float32Array [M]
        this._edgesReverseCost = null;// Float32Array [M]
        this._edgesCoordStart = null; // Uint32Array [M]
        this._coordPool = null;       // Int32Array [P * 2]  (lngScaled, latScaled)
        this._idMap = null;           // BigInt64Array [N]

        // 节点导出坐标快速查找表
        this._nodeFirstCoordIdx = null; // Int32Array [N]
        this._pq = new FlatBinaryMinHeap(65536);

        // 内存重用缓冲区 (0-GC)
        this._distBuf = null;
        this._prevBuf = null;

        // 2D 空间网格索引 (Spatial Grid Index)
        this._gridCols = 128;
        this._gridRows = 128;
        this._gridBuckets = null; // Array of Uint32Array
        this._minLngS = 0;
        this._minLatS = 0;
        this._cellWidthS = 1;
        this._cellHeightS = 1;
    }

    // ==========================================
    // IndexedDB 离线持久化缓存模块
    // ==========================================

    static openDB() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('IndexedDB not supported'));
            }
            const request = indexedDB.open('PGRB_Cache_DB', 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('graphs')) {
                    db.createObjectStore('graphs');
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async loadFromIndexedDB(key) {
        try {
            const db = await PGRBRouter.openDB();
            return new Promise((resolve) => {
                const tx = db.transaction('graphs', 'readonly');
                const store = tx.objectStore('graphs');
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            console.warn('[PGRB] 读取 IndexedDB 离线缓存异常:', e);
            return null;
        }
    }

    async saveToIndexedDB(key, buffer) {
        try {
            const db = await PGRBRouter.openDB();
            return new Promise((resolve) => {
                const tx = db.transaction('graphs', 'readwrite');
                const store = tx.objectStore('graphs');
                const req = store.put(buffer, key);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        } catch (e) {
            console.warn('[PGRB] 写入 IndexedDB 离线缓存异常:', e);
            return false;
        }
    }

    static async clearCache(networkId = null) {
        try {
            const db = await PGRBRouter.openDB();
            const tx = db.transaction('graphs', 'readwrite');
            const store = tx.objectStore('graphs');
            if (networkId) {
                store.delete(`pgrb_${networkId}`);
                console.log(`[PGRB] 已清理路网 【${networkId}】 的 IndexedDB 离线缓存`);
            } else {
                store.clear();
                console.log(`[PGRB] 已清空全部 IndexedDB 离线缓存`);
            }
        } catch (e) {
            console.error('[PGRB] 清理 IndexedDB 缓存异常:', e);
        }
    }

    /**
     * 高级智能加载策略：优先从 IndexedDB 读取 → 未命中则 HTTP 下载并自动写入 IndexedDB
     */
    async loadNetwork(networkId, baseUrl) {
        this.networkId = networkId;
        const cacheKey = `pgrb_v15_${networkId}`;

        // 1. 尝试从 IndexedDB 读取
        const cachedBuffer = await this.loadFromIndexedDB(cacheKey);
        if (cachedBuffer) {
            console.log(`[PGRB] ⚡ 离线缓存命中！直接从 IndexedDB 加载路网【${networkId}】 (体积: ${(cachedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            this.parseArrayBuffer(cachedBuffer);
            return true;
        }

        // 2. 缓存未命中，从后端下载
        return await this.loadFromUrl(baseUrl, networkId, cacheKey);
    }

    async loadFromUrl(baseUrl, networkId, cacheKey) {
        const downloadUrl = `${baseUrl}/geo/route/graph/binary?networkId=${networkId}`;
        console.log(`[PGRB] 🌐 离线缓存未命中，从后端下载二进制图: ${downloadUrl}`);
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`下载 PGRB 失败 HTTP ${response.status}: ${downloadUrl}`);
        }

        const buffer = await response.arrayBuffer();

        // 3. 解析二进制
        this.parseArrayBuffer(buffer);

        // 4. 异步保存到 IndexedDB
        if (cacheKey) {
            this.saveToIndexedDB(cacheKey, buffer).then((success) => {
                if (success) {
                    console.log(`[PGRB] ✅ 路网【${networkId}】二进制图已持久化至 IndexedDB 离线数据库`);
                }
            });
        }
        return true;
    }

    // ==========================================
    // 二进制流解码与 2D 网格空间索引构建
    // ==========================================

    parseArrayBuffer(buffer) {
        const view = new DataView(buffer);

        const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        if (magic !== 'PGRB') {
            throw new Error(`非法的 PGRB 魔数标识: ${magic}`);
        }

        this.nodeCount = view.getUint32(8, true);
        this.edgeCount = view.getUint32(12, true);
        this.pointCount = view.getUint32(16, true);

        const minLngS = view.getInt32(20, true);
        const minLatS = view.getInt32(24, true);
        const maxLngS = view.getInt32(28, true);
        const maxLatS = view.getInt32(32, true);

        this.bbox = {
            minLng: minLngS / 1e6,
            minLat: minLatS / 1e6,
            maxLng: maxLngS / 1e6,
            maxLat: maxLatS / 1e6
        };
        const idMapOffset = view.getUint32(36, true);

        // 利用 idMapOffset 反向推算各数据段的精确字节偏移
        const coordPoolStart = idMapOffset - this.pointCount * 8;
        const edgesStart = coordPoolStart - this.edgeCount * 16;

        // NodeOffsets: 紧随 40B Header
        let offset = 40;
        this._nodeOffsets = new Uint32Array(buffer, offset, this.nodeCount + 1);

        // Edges: M * 16B (target: 4B, cost: 4B, reverseCost: 4B, coordStart: 4B)
        this._edgesTarget = new Uint32Array(this.edgeCount);
        this._edgesCost = new Float32Array(this.edgeCount);
        this._edgesReverseCost = new Float32Array(this.edgeCount);
        this._edgesCoordStart = new Uint32Array(this.edgeCount);

        for (let i = 0; i < this.edgeCount; i++) {
            const eOff = edgesStart + i * 16;
            this._edgesTarget[i] = view.getUint32(eOff, true);
            this._edgesCost[i] = view.getFloat32(eOff + 4, true);
            this._edgesReverseCost[i] = view.getFloat32(eOff + 8, true);
            this._edgesCoordStart[i] = view.getUint32(eOff + 12, true);
        }

        // CoordPool: P * 8B
        this._coordPool = new Int32Array(buffer, coordPoolStart, this.pointCount * 2);

        // IdMap: N * 8B (BigInt64)
        this._idMap = new BigInt64Array(this.nodeCount);
        for (let i = 0; i < this.nodeCount; i++) {
            this._idMap[i] = view.getBigInt64(idMapOffset + i * 8, true);
        }

        // 建立每个节点的坐标映射表
        this._nodeFirstCoordIdx = new Int32Array(this.nodeCount).fill(-1);
        for (let u = 0; u < this.nodeCount; u++) {
            const startEdge = this._nodeOffsets[u];
            const endEdge = this._nodeOffsets[u + 1];
            for (let i = startEdge; i < endEdge; i++) {
                const target = this._edgesTarget[i];
                const cStart = this._edgesCoordStart[i];
                const cEnd = (i + 1 < this.edgeCount) ? this._edgesCoordStart[i + 1] : this.pointCount;

                if (this._nodeFirstCoordIdx[u] === -1 && cStart < cEnd) {
                    this._nodeFirstCoordIdx[u] = cStart;
                }
                if (this._nodeFirstCoordIdx[target] === -1 && cEnd > cStart) {
                    this._nodeFirstCoordIdx[target] = cEnd - 1;
                }
            }
        }

        // 初始化 0-GC 算路重用缓冲区
        this._distBuf = new Float32Array(this.nodeCount);
        this._prevBuf = new Int32Array(this.nodeCount);

        // 构建 100% 完整的全有向图前向星结构 (包含双向道路的反向弧段)
        const allDirEdges = [];
        for (let u = 0; u < this.nodeCount; u++) {
            const startEdge = this._nodeOffsets[u];
            const endEdge = this._nodeOffsets[u + 1];
            for (let i = startEdge; i < endEdge; i++) {
                const v = this._edgesTarget[i];
                const cost = this._edgesCost[i];
                const revCost = this._edgesReverseCost[i];
                const edgeLen = (cost > 0) ? cost : ((revCost > 0) ? revCost : 100);

                // 正向弧段 (u -> v)
                allDirEdges.push({ from: u, to: v, cost: cost, len: edgeLen, rawIdx: i, isRev: false });
                // 反向弧段 (v -> u)
                allDirEdges.push({ from: v, to: u, cost: revCost, len: edgeLen, rawIdx: i, isRev: true });
            }
        }

        allDirEdges.sort((a, b) => a.from - b.from || a.to - b.to);

        const dirEdgeCount = allDirEdges.length;
        this._dirNodeOffsets = new Uint32Array(this.nodeCount + 1);
        this._dirTarget = new Uint32Array(dirEdgeCount);
        this._dirCost = new Float32Array(dirEdgeCount);
        this._dirLen = new Float32Array(dirEdgeCount);
        this._dirRawIdx = new Uint32Array(dirEdgeCount);
        this._dirIsRev = new Uint8Array(dirEdgeCount);

        let currSrc = 0;
        for (let i = 0; i < dirEdgeCount; i++) {
            const e = allDirEdges[i];
            while (currSrc < e.from) {
                currSrc++;
                this._dirNodeOffsets[currSrc] = i;
            }
            this._dirTarget[i] = e.to;
            this._dirCost[i] = e.cost;
            this._dirLen[i] = e.len;
            this._dirRawIdx[i] = e.rawIdx;
            this._dirIsRev[i] = e.isRev ? 1 : 0;
        }
        while (currSrc < this.nodeCount) {
            currSrc++;
            this._dirNodeOffsets[currSrc] = dirEdgeCount;
        }

        // 构建 2D 空间网格索引 (Spatial Grid Index)
        this._buildSpatialGridIndex(minLngS, minLatS, maxLngS, maxLatS);

        this.isLoaded = true;
        console.log(`[PGRB] 解码完成! 节点: ${this.nodeCount}, 原始边: ${this.edgeCount}, 全有向弧段: ${dirEdgeCount}, 坐标点: ${this.pointCount} ⚡`);
    }

    /**
     * 构建 128x128 空间网格桶索引 (基于边线段几何 BoundingBox 将 O(M) 搜索降低至 O(1))
     */
    _buildSpatialGridIndex(minLngS, minLatS, maxLngS, maxLatS) {
        this._minLngS = minLngS || 0;
        this._minLatS = minLatS || 0;
        const rangeLng = Math.max(1, (maxLngS - minLngS) || 1);
        const rangeLat = Math.max(1, (maxLatS - minLatS) || 1);
        this._cellWidthS = rangeLng / this._gridCols;
        this._cellHeightS = rangeLat / this._gridRows;

        const totalBuckets = this._gridCols * this._gridRows;
        const tempBuckets = new Array(totalBuckets);
        for (let b = 0; b < totalBuckets; b++) {
            tempBuckets[b] = [];
        }

        for (let e = 0; e < this.edgeCount; e++) {
            const cStart = this._edgesCoordStart[e];
            const cEnd = (e + 1 < this.edgeCount) ? this._edgesCoordStart[e + 1] : this.pointCount;
            if (cEnd - cStart < 2) continue;

            let eMinLng = Infinity, eMaxLng = -Infinity;
            let eMinLat = Infinity, eMaxLat = -Infinity;

            for (let p = cStart; p < cEnd; p++) {
                const px = this._coordPool[p * 2];
                const py = this._coordPool[p * 2 + 1];
                if (px < eMinLng) eMinLng = px;
                if (px > eMaxLng) eMaxLng = px;
                if (py < eMinLat) eMinLat = py;
                if (py > eMaxLat) eMaxLat = py;
            }

            let minCol = Math.floor((eMinLng - this._minLngS) / this._cellWidthS);
            let maxCol = Math.floor((eMaxLng - this._minLngS) / this._cellWidthS);
            let minRow = Math.floor((eMinLat - this._minLatS) / this._cellHeightS);
            let maxRow = Math.floor((eMaxLat - this._minLatS) / this._cellHeightS);

            minCol = Math.max(0, Math.min(this._gridCols - 1, minCol));
            maxCol = Math.max(0, Math.min(this._gridCols - 1, maxCol));
            minRow = Math.max(0, Math.min(this._gridRows - 1, minRow));
            maxRow = Math.max(0, Math.min(this._gridRows - 1, maxRow));

            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    tempBuckets[r * this._gridCols + c].push(e);
                }
            }
        }

        // 转化为定长 Uint32Array 零分配存储
        this._gridBuckets = new Array(totalBuckets);
        for (let b = 0; b < totalBuckets; b++) {
            this._gridBuckets[b] = new Uint32Array(tempBuckets[b]);
        }
    }

    findNearestNode(lng, lat) {
        if (!this.isLoaded || this.edgeCount === 0) return -1;
        const snap = this.snapToNearestEdge(lng, lat);
        if (snap) {
            return snap.bestNode;
        }
        return 0;
    }

    // ==========================================
    // 高速 A* / Dijkstra 算路 (0-GC 内存复用)
    // ==========================================

    dijkstra(startIdx, endIdx, directed = true) {
        if (!this.isLoaded || startIdx < 0 || endIdx < 0 || startIdx >= this.nodeCount || endIdx >= this.nodeCount) {
            return { path: [], distance: 0 };
        }

        if (startIdx === endIdx) {
            return { path: [startIdx], distance: 0 };
        }

        const dist = this._distBuf;
        const prev = this._prevBuf;
        dist.fill(Infinity);
        prev.fill(-1);
        dist[startIdx] = 0;

        const endCoordIdx = this._nodeFirstCoordIdx[endIdx];
        const endLngS = endCoordIdx >= 0 ? this._coordPool[endCoordIdx * 2] : 0;
        const endLatS = endCoordIdx >= 0 ? this._coordPool[endCoordIdx * 2 + 1] : 0;

        const pq = this._pq;
        pq.clear();

        const getH = (u) => {
            const cIdx = this._nodeFirstCoordIdx[u];
            if (cIdx < 0) return 0;
            const dx = (this._coordPool[cIdx * 2] - endLngS) * 0.09;
            const dy = (this._coordPool[cIdx * 2 + 1] - endLatS) * 0.11;
            return Math.sqrt(dx * dx + dy * dy);
        };

        pq.push(startIdx, getH(startIdx));

        while (!pq.isEmpty()) {
            const { node: u } = pq.pop();

            if (u === endIdx) break;

            const edgeStart = this._dirNodeOffsets ? this._dirNodeOffsets[u] : this._nodeOffsets[u];
            const edgeEnd = this._dirNodeOffsets ? this._dirNodeOffsets[u + 1] : this._nodeOffsets[u + 1];

            for (let i = edgeStart; i < edgeEnd; i++) {
                const target = this._dirTarget ? this._dirTarget[i] : this._edgesTarget[i];
                const cost = directed ? (this._dirCost ? this._dirCost[i] : this._edgesCost[i]) : (this._dirLen ? this._dirLen[i] : (this._edgesCost[i] > 0 ? this._edgesCost[i] : 100));

                if (cost >= 0) {
                    const alt = dist[u] + cost;
                    if (alt < dist[target]) {
                        dist[target] = alt;
                        prev[target] = u;
                        pq.push(target, alt + getH(target));
                    }
                }
            }
        }

        if (dist[endIdx] === Infinity) {
            return { path: [], distance: 0 };
        }

        const path = [];
        for (let curr = endIdx; curr !== -1; curr = prev[curr]) {
            path.push(curr);
        }
        path.reverse();

        return { path, distance: dist[endIdx] };
    }

    getOriginalNodeId(idx) {
        if (!this.isLoaded || idx < 0 || idx >= this.nodeCount) return null;
        return this._idMap[idx].toString();
    }

    /**
     * 高精度弧段垂足吸附计算
     */
    snapToNearestEdge(lng, lat) {
        if (!this.isLoaded || this.edgeCount === 0) return null;

        const lngS = Math.round(lng * 1e6);
        const latS = Math.round(lat * 1e6);

        const radLat = (lat * Math.PI) / 180;
        const cosLat = Math.cos(radLat);

        let candidateEdges = null;
        if (this._gridBuckets && this._cellWidthS > 0 && this._cellHeightS > 0) {
            let centerCol = Math.floor((lngS - this._minLngS) / this._cellWidthS);
            let centerRow = Math.floor((latS - this._minLatS) / this._cellHeightS);

            centerCol = Math.max(0, Math.min(this._gridCols - 1, centerCol));
            centerRow = Math.max(0, Math.min(this._gridRows - 1, centerRow));

            const edgeSet = new Set();
            const searchRadius = 3;

            for (let r = centerRow - searchRadius; r <= centerRow + searchRadius; r++) {
                if (r < 0 || r >= this._gridRows) continue;
                for (let c = centerCol - searchRadius; c <= centerCol + searchRadius; c++) {
                    if (c < 0 || c >= this._gridCols) continue;
                    const bIdx = r * this._gridCols + c;
                    const bucket = this._gridBuckets[bIdx];
                    if (bucket) {
                        for (let k = 0; k < bucket.length; k++) {
                            edgeSet.add(bucket[k]);
                        }
                    }
                }
            }

            if (edgeSet.size > 0) {
                candidateEdges = Array.from(edgeSet);
            }
        }

        let minDistSq = Infinity;
        let bestSnap = null;

        const edgesToScan = candidateEdges || null;
        const totalScan = edgesToScan ? edgesToScan.length : this.edgeCount;

        for (let idx = 0; idx < totalScan; idx++) {
            const e = edgesToScan ? edgesToScan[idx] : idx;
            const cStart = this._edgesCoordStart[e];
            const cEnd = (e + 1 < this.edgeCount) ? this._edgesCoordStart[e + 1] : this.pointCount;

            if (cEnd - cStart < 2) continue;

            const edgeLenMeters = Math.max(0.1, this._edgesCost[e] > 0 ? this._edgesCost[e] : (this._edgesReverseCost[e] > 0 ? this._edgesReverseCost[e] : 100));

            for (let p = cStart; p < cEnd - 1; p++) {
                const ax = this._coordPool[p * 2];
                const ay = this._coordPool[p * 2 + 1];
                const bx = this._coordPool[(p + 1) * 2];
                const by = this._coordPool[(p + 1) * 2 + 1];

                const abx = (bx - ax) * cosLat;
                const aby = by - ay;
                const apx = (lngS - ax) * cosLat;
                const apy = latS - ay;

                const abLenSq = abx * abx + aby * aby;
                let t = 0;
                if (abLenSq > 0) {
                    t = (apx * abx + apy * aby) / abLenSq;
                    t = Math.max(0, Math.min(1, t));
                }

                const projX = ax + t * (bx - ax);
                const projY = ay + t * (by - ay);

                const dx = (lngS - projX) * cosLat;
                const dy = latS - projY;
                const distSq = dx * dx + dy * dy;

                if (distSq < minDistSq) {
                    minDistSq = distSq;

                    const v = this._edgesTarget[e];
                    let u = 0;
                    let low = 0, high = this.nodeCount - 1;
                    while (low <= high) {
                        const mid = (low + high) >> 1;
                        const sEdge = this._nodeOffsets[mid];
                        const eEdge = this._nodeOffsets[mid + 1];
                        if (e >= sEdge && e < eEdge) {
                            u = mid;
                            break;
                        } else if (e < sEdge) {
                            high = mid - 1;
                        } else {
                            low = mid + 1;
                        }
                    }

                    const totalPointsInEdge = cEnd - cStart;
                    const approxFrac = Math.max(0, Math.min(1, (p - cStart + t) / (totalPointsInEdge - 1 || 1)));

                    bestSnap = {
                        edgeIdx: e,
                        segIdx: p - cStart,
                        t: approxFrac,
                        projPoint: [projX / 1e6, projY / 1e6],
                        u: u,
                        v: v,
                        length: edgeLenMeters,
                        bestNode: (approxFrac > 0.5) ? v : u,
                        cost: this._edgesCost[e],
                        revCost: this._edgesReverseCost[e]
                    };
                }
            }
        }

        return bestSnap;
    }

    /**
     * 对应 pgRouting 的最佳端点组合评估算法
     */
    planRouteWithSnap(startLng, startLat, endLng, endLat, directed = true) {
        if (!this.isLoaded) return { path: [], distance: 0, startSnap: null, endSnap: null };

        const startSnap = this.snapToNearestEdge(startLng, startLat);
        const endSnap = this.snapToNearestEdge(endLng, endLat);

        if (!startSnap || !endSnap) {
            return { path: [], distance: 0, startSnap: null, endSnap: null };
        }

        // 同一条边情况
        if (startSnap.edgeIdx === endSnap.edgeIdx) {
            const sameCoords = this.getSameEdgeCoords(startSnap, endSnap, directed);
            if (sameCoords && sameCoords.length >= 2) {
                return {
                    path: [startSnap.u, startSnap.v],
                    distance: Math.abs(startSnap.t - endSnap.t) * startSnap.length,
                    startSnap,
                    endSnap
                };
            }
        }

        // 起点候选节点
        const startCandidates = [];
        if (!directed || startSnap.revCost >= 0) {
            startCandidates.push({
                node: startSnap.u,
                partialCost: startSnap.t * startSnap.length
            });
        }
        if (!directed || startSnap.cost >= 0) {
            startCandidates.push({
                node: startSnap.v,
                partialCost: (1 - startSnap.t) * startSnap.length
            });
        }
        if (startCandidates.length === 0) {
            startCandidates.push({ node: startSnap.bestNode, partialCost: 0 });
        }

        // 终点候选节点
        const endCandidates = [];
        if (!directed || endSnap.cost >= 0) {
            endCandidates.push({
                node: endSnap.u,
                partialCost: endSnap.t * endSnap.length
            });
        }
        if (!directed || endSnap.revCost >= 0) {
            endCandidates.push({
                node: endSnap.v,
                partialCost: (1 - endSnap.t) * endSnap.length
            });
        }
        if (endCandidates.length === 0) {
            endCandidates.push({ node: endSnap.bestNode, partialCost: 0 });
        }

        let bestPath = [];
        let minTotalDist = Infinity;

        for (const sCand of startCandidates) {
            for (const eCand of endCandidates) {
                const res = this.dijkstra(sCand.node, eCand.node, directed);
                if (res && res.path && res.path.length > 0) {
                    const totalDist = sCand.partialCost + res.distance + eCand.partialCost;
                    if (totalDist < minTotalDist) {
                        minTotalDist = totalDist;
                        bestPath = res.path;
                    }
                }
            }
        }

        if (bestPath.length === 0) {
            const cpuRes = this.dijkstra(startSnap.bestNode, endSnap.bestNode, directed);
            bestPath = cpuRes.path;
            minTotalDist = cpuRes.distance;
        }

        return {
            path: bestPath,
            distance: minTotalDist,
            startSnap,
            endSnap
        };
    }

    getEdgeCoords(edgeIdx) {
        if (edgeIdx < 0 || edgeIdx >= this.edgeCount) return [];
        const cStart = this._edgesCoordStart[edgeIdx];
        const cEnd = (edgeIdx + 1 < this.edgeCount) ? this._edgesCoordStart[edgeIdx + 1] : this.pointCount;
        const res = [];
        for (let p = cStart; p < cEnd; p++) {
            res.push([this._coordPool[p * 2] / 1e6, this._coordPool[p * 2 + 1] / 1e6]);
        }
        return res;
    }

    getStartSegCoords(startSnap, targetNode) {
        if (!startSnap) return [];
        const pts = this.getEdgeCoords(startSnap.edgeIdx);
        if (pts.length < 2) return [startSnap.projPoint];

        const segIdx = Math.min(startSnap.segIdx, pts.length - 2);
        const proj = startSnap.projPoint;
        const res = [proj];

        if (targetNode === startSnap.u) {
            for (let i = segIdx; i >= 0; i--) {
                const pt = pts[i];
                if (Math.hypot(pt[0] - proj[0], pt[1] - proj[1]) > 1e-7) {
                    res.push(pt);
                }
            }
        } else {
            for (let i = segIdx + 1; i < pts.length; i++) {
                const pt = pts[i];
                if (Math.hypot(pt[0] - proj[0], pt[1] - proj[1]) > 1e-7) {
                    res.push(pt);
                }
            }
        }
        return res;
    }

    getEndSegCoords(endSnap, fromNode) {
        if (!endSnap) return [];
        const pts = this.getEdgeCoords(endSnap.edgeIdx);
        if (pts.length < 2) return [endSnap.projPoint];

        const segIdx = Math.min(endSnap.segIdx, pts.length - 2);
        const proj = endSnap.projPoint;
        const res = [];

        if (fromNode === endSnap.u) {
            for (let i = 0; i <= segIdx; i++) {
                res.push(pts[i]);
            }
            if (Math.hypot(pts[segIdx][0] - proj[0], pts[segIdx][1] - proj[1]) > 1e-7) {
                res.push(proj);
            }
        } else {
            for (let i = pts.length - 1; i >= segIdx + 1; i--) {
                res.push(pts[i]);
            }
            if (Math.hypot(pts[segIdx + 1][0] - proj[0], pts[segIdx + 1][1] - proj[1]) > 1e-7) {
                res.push(proj);
            }
        }
        return res;
    }

    getSameEdgeCoords(startSnap, endSnap, directed = true) {
        if (!startSnap || !endSnap || startSnap.edgeIdx !== endSnap.edgeIdx) return null;

        const pts = this.getEdgeCoords(startSnap.edgeIdx);
        if (pts.length < 2) {
            return [startSnap.projPoint, endSnap.projPoint];
        }

        const isForward = (startSnap.segIdx < endSnap.segIdx) ||
                          (startSnap.segIdx === endSnap.segIdx && startSnap.t <= endSnap.t);

        if (directed) {
            if (isForward && startSnap.cost < 0) return null;
            if (!isForward && startSnap.revCost < 0) return null;
        }

        const segIdx1 = Math.min(startSnap.segIdx, pts.length - 2);
        const segIdx2 = Math.min(endSnap.segIdx, pts.length - 2);

        const res = [startSnap.projPoint];

        if (segIdx1 === segIdx2) {
            if (Math.hypot(endSnap.projPoint[0] - startSnap.projPoint[0], endSnap.projPoint[1] - startSnap.projPoint[1]) > 1e-7) {
                res.push(endSnap.projPoint);
            }
        } else if (isForward) {
            for (let i = segIdx1 + 1; i <= segIdx2; i++) {
                const pt = pts[i];
                if (Math.hypot(pt[0] - res[res.length - 1][0], pt[1] - res[res.length - 1][1]) > 1e-7) {
                    res.push(pt);
                }
            }
            if (Math.hypot(endSnap.projPoint[0] - res[res.length - 1][0], endSnap.projPoint[1] - res[res.length - 1][1]) > 1e-7) {
                res.push(endSnap.projPoint);
            }
        } else {
            for (let i = segIdx1; i >= segIdx2 + 1; i--) {
                const pt = pts[i];
                if (Math.hypot(pt[0] - res[res.length - 1][0], pt[1] - res[res.length - 1][1]) > 1e-7) {
                    res.push(pt);
                }
            }
            if (Math.hypot(endSnap.projPoint[0] - res[res.length - 1][0], endSnap.projPoint[1] - res[res.length - 1][1]) > 1e-7) {
                res.push(endSnap.projPoint);
            }
        }

        return res;
    }

    findEdgeIdxBetween(u, v) {
        if (u < 0 || v < 0 || !this._nodeOffsets) return -1;
        const edgeStartU = this._nodeOffsets[u];
        const edgeEndU = this._nodeOffsets[u + 1];
        for (let i = edgeStartU; i < edgeEndU; i++) {
            if (this._edgesTarget[i] === v) return i;
        }
        const edgeStartV = this._nodeOffsets[v];
        const edgeEndV = this._nodeOffsets[v + 1];
        for (let j = edgeStartV; j < edgeEndV; j++) {
            if (this._edgesTarget[j] === u) return j;
        }
        return -1;
    }

    getPathGeoJSON(path) {
        return this.getPathGeoJSONWithSnap(path, null, null);
    }

    getPathGeoJSONWithSnap(path, startSnap, endSnap, directed = true) {
        if (!path || path.length === 0) return { type: "FeatureCollection", features: [] };

        if (startSnap && endSnap && startSnap.edgeIdx === endSnap.edgeIdx) {
            const sameCoords = this.getSameEdgeCoords(startSnap, endSnap, directed);
            if (sameCoords && sameCoords.length >= 2) {
                return {
                    type: "FeatureCollection",
                    features: [{
                        type: "Feature",
                        geometry: { type: "LineString", coordinates: sameCoords },
                        properties: { seq: 0 }
                    }]
                };
            }
        }

        const finalCoords = [];
        let kStart = 0;
        let kEnd = path.length - 1;

        if (startSnap && path.length >= 2) {
            const firstEdgeIdx = this.findEdgeIdxBetween(path[0], path[1]);
            if (firstEdgeIdx === startSnap.edgeIdx) {
                const segStart = this.getStartSegCoords(startSnap, path[1]);
                for (const pt of segStart) {
                    if (finalCoords.length === 0 || Math.hypot(finalCoords[finalCoords.length - 1][0] - pt[0], finalCoords[finalCoords.length - 1][1] - pt[1]) > 1e-7) {
                        finalCoords.push(pt);
                    }
                }
                kStart = 1;
            } else {
                const segStart = this.getStartSegCoords(startSnap, path[0]);
                for (const pt of segStart) {
                    if (finalCoords.length === 0 || Math.hypot(finalCoords[finalCoords.length - 1][0] - pt[0], finalCoords[finalCoords.length - 1][1] - pt[1]) > 1e-7) {
                        finalCoords.push(pt);
                    }
                }
            }
        } else if (startSnap && path.length === 1) {
            const segStart = this.getStartSegCoords(startSnap, path[0]);
            for (const pt of segStart) {
                if (finalCoords.length === 0 || Math.hypot(finalCoords[finalCoords.length - 1][0] - pt[0], finalCoords[finalCoords.length - 1][1] - pt[1]) > 1e-7) {
                    finalCoords.push(pt);
                }
            }
        }

        let customEndSeg = null;
        if (endSnap && path.length >= 2) {
            const lastEdgeIdx = this.findEdgeIdxBetween(path[path.length - 2], path[path.length - 1]);
            if (lastEdgeIdx === endSnap.edgeIdx) {
                customEndSeg = this.getEndSegCoords(endSnap, path[path.length - 2]);
                kEnd = path.length - 2;
            } else {
                customEndSeg = this.getEndSegCoords(endSnap, path[path.length - 1]);
            }
        } else if (endSnap && path.length === 1) {
            customEndSeg = this.getEndSegCoords(endSnap, path[0]);
        }

        for (let k = kStart; k < kEnd; k++) {
            const u = path[k];
            const v = path[k + 1];

            let matchedEdgeIdx = -1;
            let isReverse = false;

            const edgeStartU = this._nodeOffsets[u];
            const edgeEndU = this._nodeOffsets[u + 1];
            for (let i = edgeStartU; i < edgeEndU; i++) {
                if (this._edgesTarget[i] === v) {
                    matchedEdgeIdx = i;
                    isReverse = false;
                    break;
                }
            }
            if (matchedEdgeIdx === -1) {
                const edgeStartV = this._nodeOffsets[v];
                const edgeEndV = this._nodeOffsets[v + 1];
                for (let j = edgeStartV; j < edgeEndV; j++) {
                    if (this._edgesTarget[j] === u) {
                        matchedEdgeIdx = j;
                        isReverse = true;
                        break;
                    }
                }
            }

            if (matchedEdgeIdx !== -1) {
                const pts = this.getEdgeCoords(matchedEdgeIdx);
                if (isReverse) pts.reverse();

                for (const pt of pts) {
                    if (finalCoords.length === 0 || Math.hypot(finalCoords[finalCoords.length - 1][0] - pt[0], finalCoords[finalCoords.length - 1][1] - pt[1]) > 1e-7) {
                        finalCoords.push(pt);
                    }
                }
            }
        }

        if (customEndSeg) {
            for (const pt of customEndSeg) {
                if (finalCoords.length === 0 || Math.hypot(finalCoords[finalCoords.length - 1][0] - pt[0], finalCoords[finalCoords.length - 1][1] - pt[1]) > 1e-7) {
                    finalCoords.push(pt);
                }
            }
        }

        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: finalCoords
                    },
                    properties: { seq: 0 }
                }
            ]
        };
    }
}

if (typeof window !== 'undefined') {
    window.PGRBRouter = PGRBRouter;
}

export default PGRBRouter;
