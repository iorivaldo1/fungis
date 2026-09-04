/**
 * PGRBRouter - 前端零拷贝二进制图路由引擎 (PGRB Format)
 * Phase 2 增强版：包含 IndexedDB 离线持久化缓存、O(1) 网格空间索引与 0-GC 内存复用
 */

class FlatBinaryMinHeap {
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

class PGRBRouter {
    constructor() {
        this.isLoaded = false;
        this.networkId = null;
        this.version = 1;
        this.nodeCount = 0;
        this.edgeCount = 0;
        this.pointCount = 0;
        this.bbox = { minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 };

        // 矢量边界数据 (v2 扩展特性)
        this.boundaryPointCount = 0;
        this.boundaryRings = null;  // Array<Array<[lng, lat]>>
        this.boundaryCoords = null; // Int32Array [lngS, latS, ...]

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

        // PGRB 离线图元数据 (Metadata: 版本时间戳与持久化状态)
        this.buildTime = null;
        this.savedAt = null;
        this.metadata = null;

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
                store.delete(`pgrb_v20_${networkId}`);
                store.delete(`pgrb_v15_${networkId}`);
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
     * 高级智能加载策略：支持服务端版本时间戳 (buildTime) 校验
     * 若服务端提供了 buildTime 且与本地缓存不一致，自动清除旧缓存并拉取最新图；
     * 若版本一致，直接从 IndexedDB 秒开；未命中则下载并持久化。
     */
    async loadNetwork(networkId, baseUrl, serverBuildTime = null) {
        this.networkId = networkId;
        const cacheKey = `pgrb_v20_${networkId}`;

        // 1. 尝试从 IndexedDB 读取
        const cachedItem = await this.loadFromIndexedDB(cacheKey);
        if (cachedItem) {
            let cachedBuffer = null;
            let cachedBuildTime = null;
            let cachedSavedAt = null;

            if (cachedItem instanceof ArrayBuffer) {
                cachedBuffer = cachedItem;
            } else if (cachedItem && cachedItem.buffer instanceof ArrayBuffer) {
                cachedBuffer = cachedItem.buffer;
                cachedBuildTime = cachedItem.buildTime || null;
                cachedSavedAt = cachedItem.savedAt || null;
            }

            // 版本一致性比对：若服务端提供了有效 buildTime，且本地缓存中存有不同的 buildTime，则判定版本过期
            const isVersionMatch = !serverBuildTime || !cachedBuildTime || (cachedBuildTime === serverBuildTime);

            if (cachedBuffer && isVersionMatch) {
                console.log(`[PGRB] ⚡ 离线缓存命中！直接从 IndexedDB 加载路网【${networkId}】(构建版本: ${cachedBuildTime || '历史版本'}, 体积: ${(cachedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
                this.buildTime = cachedBuildTime;
                this.savedAt = cachedSavedAt;
                this.metadata = { networkId, buildTime: cachedBuildTime, savedAt: cachedSavedAt };
                this.parseArrayBuffer(cachedBuffer);
                // 智能防呆：若缓存中未包含多边形矢量边界（boundaryPointCount === 0），自动废弃并强制重新从后端同步最新图
                if (this.boundaryPointCount > 0 || !networkId.startsWith('xzq_')) {
                    return true;
                }
                console.warn(`[PGRB] ⚠️ 发现本地缓存缺少多边形矢量边界，自动清除本地缓存并重新从后端拉取完整矢量图...`);
                await PGRBRouter.clearCache(networkId);
            } else if (cachedBuffer && !isVersionMatch) {
                console.warn(`[PGRB] 🔄 检测到服务端路网已更新！本地缓存版本: [${cachedBuildTime}], 服务端最新版本: [${serverBuildTime}]，自动更新本地离线图...`);
                await PGRBRouter.clearCache(networkId);
            }
        }

        // 2. 缓存未命中或版本过期，从后端下载
        return await this.loadFromUrl(baseUrl, networkId, cacheKey, serverBuildTime);
    }

    async loadFromUrl(baseUrl, networkId, cacheKey, serverBuildTime = null) {
        const timeParam = serverBuildTime ? `&_t=${encodeURIComponent(serverBuildTime)}` : `&_t=${Date.now()}`;
        const downloadUrl = `${baseUrl}/geo/route/graph/binary?networkId=${networkId}${timeParam}`;
        console.log(`[PGRB] 🌐 离线缓存未命中或已过期，从后端下载最新二进制图: ${downloadUrl}`);
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`下载 PGRB 失败 HTTP ${response.status}: ${downloadUrl}`);
        }

        const buffer = await response.arrayBuffer();

        // 3. 解析二进制
        this.parseArrayBuffer(buffer);

        // 4. 异步保存到 IndexedDB（包含版本与时间戳元数据）
        if (cacheKey) {
            const cachePayload = {
                networkId: networkId,
                buildTime: serverBuildTime || new Date().toLocaleString(),
                savedAt: Date.now(),
                buffer: buffer
            };
            this.buildTime = cachePayload.buildTime;
            this.savedAt = cachePayload.savedAt;
            this.metadata = { networkId, buildTime: cachePayload.buildTime, savedAt: cachePayload.savedAt };
            this.saveToIndexedDB(cacheKey, cachePayload).then((success) => {
                if (success) {
                    console.log(`[PGRB] ✅ 路网【${networkId}】二进制图与版本元数据 (${cachePayload.buildTime}) 已持久化至 IndexedDB 离线数据库`);
                }
            });
        }
    }

    /**
     * 获取当前路网的 PGRB 离线元数据（包含版本构建时间戳、持久化时间、图拓扑基础指标等）
     */
    getMetadata() {
        return {
            networkId: this.networkId,
            buildTime: this.buildTime,
            savedAt: this.savedAt,
            version: this.version,
            nodeCount: this.nodeCount,
            edgeCount: this.edgeCount,
            pointCount: this.pointCount,
            boundaryPointCount: this.boundaryPointCount,
            bbox: this.bbox
        };
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

        const version = view.getUint16(4, true);
        const flags = view.getUint16(6, true);
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

        // 利用 idMapOffset 反向推算各数据段的精确字节偏移 (无需猜测填充)
        const coordPoolStart = idMapOffset - this.pointCount * 8;
        const edgesStart = coordPoolStart - this.edgeCount * 16;

        // NodeOffsets: 始终紧随 40B Header
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

        // 建立每个节点的坐标映射表 (保证出边节点与入边节点 100% 具备有效坐标)
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

        // === 诊断日志：统计节点坐标有效性 ===
        let validCount = 0;
        for (let i = 0; i < this.nodeCount; i++) {
            if (this._nodeFirstCoordIdx[i] >= 0) validCount++;
        }
        console.log(`[PGRB-DIAG] 节点坐标映射: ${validCount}/${this.nodeCount} 个节点拥有有效坐标`);
        console.log(`[PGRB-DIAG] BBox: lng=[${minLngS / 1e6}, ${maxLngS / 1e6}], lat=[${minLatS / 1e6}, ${maxLatS / 1e6}]`);
        console.log(`[PGRB-DIAG] idMapOffset=${idMapOffset}, coordPool.length=${this._coordPool.length}, pointCount=${this.pointCount}`);

        // 打印前 5 个有坐标节点的详情
        let sampleCount = 0;
        for (let i = 0; i < this.nodeCount && sampleCount < 5; i++) {
            const cIdx = this._nodeFirstCoordIdx[i];
            if (cIdx >= 0) {
                const lng = this._coordPool[cIdx * 2] / 1e6;
                const lat = this._coordPool[cIdx * 2 + 1] / 1e6;
                const origId = this._idMap[i].toString();
                console.log(`[PGRB-DIAG]   节点[${i}] origID=${origId} coordIdx=${cIdx} => (${lng}, ${lat})`);
                sampleCount++;
            }
        }

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

        this.version = version;

        // 构建 2D 空间网格索引 (Spatial Grid Index)
        this._buildSpatialGridIndex(minLngS, minLatS, maxLngS, maxLatS);

        // 解析 v2 矢量边界扩展段
        if (version >= 2) {
            this._parseBoundaryV2(buffer, view, idMapOffset);
        } else {
            this.boundaryPointCount = 0;
            this.boundaryRings = null;
            this.boundaryCoords = null;
        }

        this.isLoaded = true;
        console.log(`[PGRB v${version}] 解码完成! 节点: ${this.nodeCount}, 原始边: ${this.edgeCount}, 全有向弧段: ${dirEdgeCount}, 坐标点: ${this.pointCount}${this.boundaryPointCount > 0 ? `, 边界点: ${this.boundaryPointCount}` : ''} ⚡`);
    }

    /**
     * 解析 v2 二进制流末尾的 BoundaryPool 矢量边界段
     */
    _parseBoundaryV2(buffer, view, idMapOffset) {
        const boundaryOffset = idMapOffset + this.nodeCount * 8;
        if (buffer.byteLength < boundaryOffset + 8) {
            this.boundaryPointCount = 0;
            this.boundaryRings = null;
            this.boundaryCoords = null;
            return;
        }

        this.boundaryPointCount = view.getUint32(boundaryOffset, true);
        const ringCount = view.getUint32(boundaryOffset + 4, true);

        if (this.boundaryPointCount === 0 || ringCount === 0) {
            this.boundaryRings = null;
            this.boundaryCoords = null;
            return;
        }

        const ringSizes = [];
        let curOffset = boundaryOffset + 8;
        for (let r = 0; r < ringCount; r++) {
            ringSizes.push(view.getUint32(curOffset, true));
            curOffset += 4;
        }

        const coordsInt32 = new Int32Array(buffer, curOffset, this.boundaryPointCount * 2);
        this.boundaryCoords = coordsInt32;

        this.boundaryRings = [];
        let ptIdx = 0;
        for (let r = 0; r < ringCount; r++) {
            const rSize = ringSizes[r];
            const ring = [];
            for (let k = 0; k < rSize; k++) {
                const lng = coordsInt32[(ptIdx + k) * 2] / 1e6;
                const lat = coordsInt32[(ptIdx + k) * 2 + 1] / 1e6;
                ring.push([lng, lat]);
            }
            this.boundaryRings.push(ring);
            ptIdx += rSize;
        }

        console.log(`[PGRB v2] 🗺️ 成功解析矢量边界: ${ringCount} 个多边形环, 共 ${this.boundaryPointCount} 个顶点`);
    }

    /**
     * 获取适合 Leaflet L.polygon 直接消费的 [lat, lng] 坐标数组
     */
    getBoundaryLatLngs() {
        if (!this.boundaryRings || this.boundaryRings.length === 0) {
            if (this.bbox) {
                return [[
                    [this.bbox.minLat, this.bbox.minLng],
                    [this.bbox.maxLat, this.bbox.minLng],
                    [this.bbox.maxLat, this.bbox.maxLng],
                    [this.bbox.minLat, this.bbox.maxLng]
                ]];
            }
            return [];
        }
        if (this.boundaryRings.length === 1) {
            return this.boundaryRings[0].map(pt => [pt[1], pt[0]]);
        }
        return this.boundaryRings.map(ring => ring.map(pt => [pt[1], pt[0]]));
    }

    /**
     * 获取标准 GeoJSON 格式的多边形对象
     */
    getBoundaryGeoJSON() {
        if (!this.boundaryRings || this.boundaryRings.length === 0) {
            if (this.bbox) {
                return {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [this.bbox.minLng, this.bbox.minLat],
                            [this.bbox.minLng, this.bbox.maxLat],
                            [this.bbox.maxLng, this.bbox.maxLat],
                            [this.bbox.maxLng, this.bbox.minLat],
                            [this.bbox.minLng, this.bbox.minLat]
                        ]]
                    },
                    properties: {}
                };
            }
            return null;
        }
        if (this.boundaryRings.length === 1) {
            return {
                type: "Feature",
                geometry: {
                    type: "Polygon",
                    coordinates: this.boundaryRings
                },
                properties: {}
            };
        }
        return {
            type: "Feature",
            geometry: {
                type: "MultiPolygon",
                coordinates: this.boundaryRings.map(ring => [ring])
            },
            properties: {}
        };
    }

    /**
     * 射线法（Ray-Casting）快速判断坐标点 [lng, lat] 是否落在当前路网边界多边形内
     */
    isPointInBoundary(lng, lat) {
        if (this.boundaryRings && this.boundaryRings.length > 0) {
            const pt = [lng, lat];
            for (const ring of this.boundaryRings) {
                if (this._isPointInPolygonRing(pt, ring)) {
                    return true;
                }
            }
            return false;
        }
        if (this.bbox) {
            return (lng >= this.bbox.minLng && lng <= this.bbox.maxLng &&
                    lat >= this.bbox.minLat && lat <= this.bbox.maxLat);
        }
        return true;
    }

    _isPointInPolygonRing(pt, ring) {
        const x = pt[0], y = pt[1];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
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

        // 将每条边的包围盒映射到对应的空间网格桶中 (保证不论源节点多远，途径网格均能索引到该边)
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

    /**
     * 高精度全图弧段级吸附匹配 (基于最近几何弧段定位至最近拓扑节点)
     */
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

        // 复用全局 Float32Array / Int32Array 缓冲区 (0-GC)
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
            const { node: u, dist: fDist } = pq.pop();

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

    /**
     * 带节点/弧段屏蔽掩码的 A* / Dijkstra 最短路计算 (用于 Yen 偏离分支探索)
     * @param {number} startIdx 起点
     * @param {number} endIdx 终点
     * @param {boolean} directed 是否有向
     * @param {Set<number>|null} disabledNodes 临时屏蔽的节点集合
     * @param {Set<string>|null} disabledEdges 临时屏蔽的弧段集合 (格式: "u->v")
     */
    dijkstraWithMask(startIdx, endIdx, directed = true, disabledNodes = null, disabledEdges = null) {
        if (!this.isLoaded || startIdx < 0 || endIdx < 0 || startIdx >= this.nodeCount || endIdx >= this.nodeCount) {
            return { path: [], distance: 0 };
        }

        if (startIdx === endIdx) {
            return { path: [startIdx], distance: 0 };
        }

        if (disabledNodes && (disabledNodes.has(startIdx) || disabledNodes.has(endIdx))) {
            return { path: [], distance: 0 };
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
            const { node: u, dist: fDist } = pq.pop();

            if (u === endIdx) break;
            if (dist[u] === Infinity) break;

            const edgeStart = this._dirNodeOffsets ? this._dirNodeOffsets[u] : this._nodeOffsets[u];
            const edgeEnd = this._dirNodeOffsets ? this._dirNodeOffsets[u + 1] : this._nodeOffsets[u + 1];

            for (let i = edgeStart; i < edgeEnd; i++) {
                const target = this._dirTarget ? this._dirTarget[i] : this._edgesTarget[i];

                if (disabledNodes && disabledNodes.has(target)) continue;
                if (disabledEdges && disabledEdges.has(`${u}->${target}`)) continue;

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

    _getEdgeCostBetween(u, v, directed = true) {
        const edgeStart = this._dirNodeOffsets ? this._dirNodeOffsets[u] : this._nodeOffsets[u];
        const edgeEnd = this._dirNodeOffsets ? this._dirNodeOffsets[u + 1] : this._nodeOffsets[u + 1];
        for (let i = edgeStart; i < edgeEnd; i++) {
            if (this._dirTarget[i] === v) {
                const cost = directed ? (this._dirCost ? this._dirCost[i] : this._edgesCost[i]) : (this._dirLen ? this._dirLen[i] : 100);
                if (cost >= 0) return cost;
            }
        }
        return -1;
    }

    _calculatePathOverlapRate(pathA, pathB) {
        if (!pathA || !pathB || pathA.length < 2 || pathB.length < 2) return 0;
        const setA = new Set();
        for (let i = 0; i < pathA.length - 1; i++) {
            setA.add(`${pathA[i]}-${pathA[i + 1]}`);
        }
        let common = 0;
        for (let j = 0; j < pathB.length - 1; j++) {
            if (setA.has(`${pathB[j]}-${pathB[j + 1]}`)) {
                common++;
            }
        }
        return common / Math.max(1, Math.min(pathA.length - 1, pathB.length - 1));
    }

    /**
     * Yen 算法核心实现 (K-Shortest Loopless Paths)
     * @param {number} startIdx 起点节点索引
     * @param {number} endIdx 终点节点索引
     * @param {number} K 备选路线数量 (默认 3)
     * @param {boolean} directed 是否有向图
     * @param {object} options 选项: { maxOverlapRate: 0.85, returnHeapPaths: false }
     * @returns {Array<{path: number[], distance: number, spurNode?: number}>}
     */
    yenKSP(startIdx, endIdx, K = 3, directed = true, options = {}) {
        if (!this.isLoaded || startIdx < 0 || endIdx < 0 || startIdx >= this.nodeCount || endIdx >= this.nodeCount) {
            return [];
        }

        const A = []; // 已确定的前 K 条最短路径
        const B = []; // 候选路径堆/池

        const pathKey = (p) => p.join('-');
        const existingPathKeys = new Set();

        // 1. 计算第 1 条全局最短路径 A[0]
        const firstRes = this.dijkstra(startIdx, endIdx, directed);
        if (!firstRes.path || firstRes.path.length === 0) {
            return [];
        }

        A.push({ path: firstRes.path, distance: firstRes.distance });
        existingPathKeys.add(pathKey(firstRes.path));

        const popBestCandidate = () => {
            if (B.length === 0) return null;
            let bestIdx = 0;
            for (let i = 1; i < B.length; i++) {
                if (B[i].distance < B[bestIdx].distance) {
                    bestIdx = i;
                }
            }
            return B.splice(bestIdx, 1)[0];
        };

        // 2. 迭代探索第 k 条最短路径 (k 从 1 到 K - 1)
        for (let k = 1; k < K; k++) {
            const prevPath = A[k - 1].path;

            // 遍历前一条路径上的每个点作为偏离点
            for (let i = 0; i < prevPath.length - 1; i++) {
                const spurNode = prevPath[i];
                const rootPath = prevPath.slice(0, i + 1);

                const disabledEdges = new Set();
                const disabledNodes = new Set();

                // 规则 1：在所有已有路径 A 中，若前缀与当前 rootPath 相同，则屏蔽其在 spurNode 处的下一条边
                for (const aRoute of A) {
                    const p = aRoute.path;
                    if (p.length > i && rootPath.every((node, idx) => node === p[idx])) {
                        disabledEdges.add(`${p[i]}->${p[i + 1]}`);
                        if (!directed) {
                            disabledEdges.add(`${p[i + 1]}->${p[i]}`);
                        }
                    }
                }

                // 规则 2：将 rootPath 中除 spurNode 之外的所有节点屏蔽，保证不产生回路
                for (let r = 0; r < i; r++) {
                    disabledNodes.add(rootPath[r]);
                }

                // 计算从 spurNode 到 endIdx 的偏离路径
                const spurRes = this.dijkstraWithMask(spurNode, endIdx, directed, disabledNodes, disabledEdges);

                if (spurRes.path && spurRes.path.length > 0) {
                    const totalPath = rootPath.slice(0, i).concat(spurRes.path);
                    const key = pathKey(totalPath);

                    if (!existingPathKeys.has(key)) {
                        existingPathKeys.add(key);

                        let totalDistance = 0;
                        let validPath = true;
                        for (let seg = 0; seg < totalPath.length - 1; seg++) {
                            const u = totalPath[seg];
                            const v = totalPath[seg + 1];
                            const edgeDist = this._getEdgeCostBetween(u, v, directed);
                            if (edgeDist < 0) {
                                validPath = false;
                                break;
                            }
                            totalDistance += edgeDist;
                        }

                        if (validPath) {
                            B.push({
                                path: totalPath,
                                distance: totalDistance,
                                spurNode: spurNode
                            });
                        }
                    }
                }
            }

            if (B.length === 0) {
                break;
            }

            const nextBest = popBestCandidate();
            if (nextBest) {
                A.push(nextBest);
            }
        }

        // 3. 相似度重合率过滤 (可选)
        if (options.maxOverlapRate && options.maxOverlapRate < 1.0 && A.length > 1) {
            const filteredA = [A[0]];
            for (let i = 1; i < A.length; i++) {
                const cand = A[i];
                let isDiverseEnough = true;
                for (const ref of filteredA) {
                    const overlap = this._calculatePathOverlapRate(cand.path, ref.path);
                    if (overlap > options.maxOverlapRate) {
                        isDiverseEnough = false;
                        break;
                    }
                }
                if (isDiverseEnough) {
                    filteredA.push(cand);
                }
            }
            return filteredA;
        }

        return A;
    }

    getNodeCoordinate(nodeIdx) {
        if (!this.isLoaded || nodeIdx < 0 || nodeIdx >= this.nodeCount) return null;
        const cIdx = this._nodeFirstCoordIdx[nodeIdx];
        if (cIdx >= 0) {
            return [this._coordPool[cIdx * 2] / 1e6, this._coordPool[cIdx * 2 + 1] / 1e6];
        }
        return null;
    }

    getOriginalNodeId(idx) {
        if (!this.isLoaded || idx < 0 || idx >= this.nodeCount) return null;
        return this._idMap[idx].toString();
    }

    /**
     * 高精度弧段垂足吸附计算（基于米制等距投影变换 + 2D 空间网格桶 O(1) 极速筛选）
     */
    snapToNearestEdge(lng, lat) {
        if (!this.isLoaded || this.edgeCount === 0) return null;

        const lngS = Math.round(lng * 1e6);
        const latS = Math.round(lat * 1e6);

        // 动态米制缩放比例 cos(lat)
        const radLat = (lat * Math.PI) / 180;
        const cosLat = Math.cos(radLat);

        // 利用 2D 空间网格桶筛选 7x7 邻域内的候选弧段 (将 N 扫降至 10 级别)
        let candidateEdges = null;
        if (this._gridBuckets && this._cellWidthS > 0 && this._cellHeightS > 0) {
            let centerCol = Math.floor((lngS - this._minLngS) / this._cellWidthS);
            let centerRow = Math.floor((latS - this._minLatS) / this._cellHeightS);

            centerCol = Math.max(0, Math.min(this._gridCols - 1, centerCol));
            centerRow = Math.max(0, Math.min(this._gridRows - 1, centerRow));

            const edgeSet = new Set();
            const searchRadius = 3; // 7x7 邻居桶

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

                    // 估算形点在该边中的整体比例位移 (0.0 ~ 1.0)
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
     * 测试起点弧段双向端点与终点弧段双向端点的所有可行路径组合，取全局总距离最小者（包含两端残段长度）
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
            // 若不能同边直达（如单行道禁止逆行），不要返回假 path，继续向下走候选节点 Dijkstra 搜索绕行！
        }

        // 构建起点候选节点（考虑单行道通行方向）
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

        // 构建终点候选节点
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

    /**
     * 高精度吸附并使用 Yen 偏离路径算法计算 K 条无环最短备选路径 (包含几何切片合成与增量统计)
     * @param {number} startLng 起点经度
     * @param {number} startLat 起点纬度
     * @param {number} endLng 终点经度
     * @param {number} endLat 终点纬度
     * @param {number} K 备选路线数量 (默认 3)
     * @param {boolean} directed 是否考虑单行道
     * @param {object} options 选项: { maxOverlapRate: 0.85 }
     */
    planYenRoutesWithSnap(startLng, startLat, endLng, endLat, K = 3, directed = true, options = {}) {
        if (!this.isLoaded) {
            return { code: 400, msg: "路网尚未加载完成", data: { routes: [] } };
        }

        const startSnap = this.snapToNearestEdge(startLng, startLat);
        const endSnap = this.snapToNearestEdge(endLng, endLat);

        if (!startSnap || !endSnap) {
            return { code: 404, msg: "未找到有效的吸附道路", data: { routes: [] } };
        }

        // 同一条边情况
        if (startSnap.edgeIdx === endSnap.edgeIdx) {
            const sameCoords = this.getSameEdgeCoords(startSnap, endSnap, directed);
            if (sameCoords && sameCoords.length >= 2) {
                const dist = Math.abs(startSnap.t - endSnap.t) * startSnap.length;
                return {
                    code: 200,
                    data: {
                        kCount: 1,
                        routes: [{
                            pathId: 1,
                            title: "推荐路线 (同段直达)",
                            path: [startSnap.u, startSnap.v],
                            totalDistance: dist,
                            deltaDistance: 0,
                            startNode: this.getOriginalNodeId(startSnap.u),
                            endNode: this.getOriginalNodeId(startSnap.v),
                            nodeCount: 2,
                            spurNode: null,
                            spurCoord: null,
                            geometry: {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: sameCoords },
                                    properties: { seq: 0, pathId: 1 }
                                }]
                            },
                            coords: sameCoords,
                            color: '#38bdf8'
                        }],
                        startSnap,
                        endSnap
                    }
                };
            }
        }

        // 构建起点候选节点（考虑单行道通行方向）
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

        // 构建终点候选节点
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

        // 挑选基础最短路径对应的起终点节点对
        let bestPair = null;
        let minBaseDist = Infinity;

        for (const sCand of startCandidates) {
            for (const eCand of endCandidates) {
                const res = this.dijkstra(sCand.node, eCand.node, directed);
                if (res && res.path && res.path.length > 0) {
                    const totalDist = sCand.partialCost + res.distance + eCand.partialCost;
                    if (totalDist < minBaseDist) {
                        minBaseDist = totalDist;
                        bestPair = { sCand, eCand, baseRes: res };
                    }
                }
            }
        }

        if (!bestPair) {
            const sNode = startSnap.bestNode;
            const eNode = endSnap.bestNode;
            const res = this.dijkstra(sNode, eNode, directed);
            if (res && res.path && res.path.length > 0) {
                bestPair = {
                    sCand: { node: sNode, partialCost: 0 },
                    eCand: { node: eNode, partialCost: 0 },
                    baseRes: res
                };
            } else {
                return { code: 404, msg: "起点与终点之间未找到连通路径", data: { routes: [] } };
            }
        }

        const sNode = bestPair.sCand.node;
        const eNode = bestPair.eCand.node;
        const startPartialCost = bestPair.sCand.partialCost;
        const endPartialCost = bestPair.eCand.partialCost;

        // 执行 Yen 核心 KSP 算法
        const kspPaths = this.yenKSP(sNode, eNode, K, directed, options);

        if (!kspPaths || kspPaths.length === 0) {
            return { code: 404, msg: "起点与终点之间未找到可行路径 (Yen)", data: { routes: [] } };
        }

        const colorPalette = ['#38bdf8', '#f59e0b', '#a855f7', '#10b981', '#ec4899', '#06b6d4', '#84cc16'];
        const titlePrefixes = ['推荐路线 (最优)', '备选方案 1', '备选方案 2', '备选方案 3', '备选方案 4'];

        const baseTotalDist = startPartialCost + kspPaths[0].distance + endPartialCost;

        const routes = [];
        for (let idx = 0; idx < kspPaths.length; idx++) {
            const item = kspPaths[idx];
            const routePath = item.path;
            const totalDist = startPartialCost + item.distance + endPartialCost;
            const deltaDist = idx === 0 ? 0 : Math.max(0, totalDist - baseTotalDist);

            const geojson = this.getPathGeoJSONWithSnap(routePath, startSnap, endSnap, directed);
            const coords = (geojson.type === 'FeatureCollection' && geojson.features && geojson.features[0])
                ? geojson.features[0].geometry.coordinates
                : (geojson.geometry ? geojson.geometry.coordinates : (geojson.coordinates || []));

            let spurCoord = null;
            if (item.spurNode != null) {
                spurCoord = this.getNodeCoordinate(item.spurNode);
            }

            const startOrigId = this.getOriginalNodeId(routePath[0]);
            const endOrigId = this.getOriginalNodeId(routePath[routePath.length - 1]);

            routes.push({
                pathId: idx + 1,
                title: titlePrefixes[idx] || `备选方案 ${idx}`,
                path: routePath,
                totalDistance: totalDist,
                deltaDistance: deltaDist,
                startNode: startOrigId,
                endNode: endOrigId,
                nodeCount: routePath.length,
                spurNode: item.spurNode != null ? this.getOriginalNodeId(item.spurNode) : null,
                spurCoord: spurCoord,
                geometry: geojson,
                coords: coords,
                color: colorPalette[idx % colorPalette.length]
            });
        }

        return {
            code: 200,
            data: {
                kCount: routes.length,
                routes: routes,
                startSnap,
                endSnap
            }
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
            // 从 proj 沿 start 边反向搜寻至 source 节点 u
            for (let i = segIdx; i >= 0; i--) {
                const pt = pts[i];
                if (Math.hypot(pt[0] - proj[0], pt[1] - proj[1]) > 1e-7) {
                    res.push(pt);
                }
            }
        } else {
            // 从 proj 沿 start 边正向搜寻至 target 节点 v
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
            // 从 source 节点 u 正向搜寻至 proj
            for (let i = 0; i <= segIdx; i++) {
                res.push(pts[i]);
            }
            if (Math.hypot(pts[segIdx][0] - proj[0], pts[segIdx][1] - proj[1]) > 1e-7) {
                res.push(proj);
            }
        } else {
            // 从 target 节点 v 反向搜寻至 proj
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

        // 有向图模式下的单行道合法通行检测
        if (directed) {
            if (isForward && startSnap.cost < 0) return null; // 正向通行被禁止
            if (!isForward && startSnap.revCost < 0) return null; // 反向通行被禁止
        }

        const segIdx1 = Math.min(startSnap.segIdx, pts.length - 2);
        const segIdx2 = Math.min(endSnap.segIdx, pts.length - 2);

        const res = [startSnap.projPoint];

        if (segIdx1 === segIdx2) {
            if (Math.hypot(endSnap.projPoint[0] - startSnap.projPoint[0], endSnap.projPoint[1] - startSnap.projPoint[1]) > 1e-7) {
                res.push(endSnap.projPoint);
            }
        } else if (isForward) {
            // 正向：t1 <= t2
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
            // 反向：t1 > t2
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

    /**
     * 100% 对标 PostGIS pgRouting 的全线段几何合成算法 (seg_start + dijkstra_edges + seg_end)
     */
    getPathGeoJSONWithSnap(path, startSnap, endSnap, directed = true) {
        if (!path || path.length === 0) return { type: "FeatureCollection", features: [] };

        // 0. 特殊处理：起点与终点落在同一条弧段上的直接切割线段
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

        // 1. seg_start：判断首个 Dijkstra 节点对是否在 startSnap.edgeIdx 上
        if (startSnap && path.length >= 2) {
            const firstEdgeIdx = this.findEdgeIdxBetween(path[0], path[1]);
            if (firstEdgeIdx === startSnap.edgeIdx) {
                const segStart = this.getStartSegCoords(startSnap, path[1]);
                for (const pt of segStart) {
                    if (finalCoords.length === 0 || Math.hypot(finalCoords[finalCoords.length - 1][0] - pt[0], finalCoords[finalCoords.length - 1][1] - pt[1]) > 1e-7) {
                        finalCoords.push(pt);
                    }
                }
                kStart = 1; // 跳过重复绘制的整条 startSnap 弧段
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

        // 2. seg_end 节点处理预判断
        let customEndSeg = null;
        if (endSnap && path.length >= 2) {
            const lastEdgeIdx = this.findEdgeIdxBetween(path[path.length - 2], path[path.length - 1]);
            if (lastEdgeIdx === endSnap.edgeIdx) {
                customEndSeg = this.getEndSegCoords(endSnap, path[path.length - 2]);
                kEnd = path.length - 2; // 跳过重复绘制的整条 endSnap 弧段
            } else {
                customEndSeg = this.getEndSegCoords(endSnap, path[path.length - 1]);
            }
        } else if (endSnap && path.length === 1) {
            customEndSeg = this.getEndSegCoords(endSnap, path[0]);
        }

        // 3. dijkstra_edges：中间全量 Dijkstra 路径的几何弧段线段
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

        // 4. 追加 seg_end 几何点
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

    getPathCoordinates(path) {
        if (!this.isLoaded || !path || path.length < 2) return [];

        const coordinates = [];

        for (let k = 0; k < path.length - 1; k++) {
            const u = path[k];
            const v = path[k + 1];

            // 1. 先尝试查找正向出边 u -> v
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

            // 2. 若正向边未查到，尝试查找反向出边 v -> u (即以 v 为源节点的边)
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
                const cStart = this._edgesCoordStart[matchedEdgeIdx];
                const cEnd = (matchedEdgeIdx + 1 < this.edgeCount)
                    ? this._edgesCoordStart[matchedEdgeIdx + 1]
                    : (this.pointCount);

                const edgeCoords = [];
                for (let p = cStart; p < cEnd; p++) {
                    const lng = this._coordPool[p * 2] / 1e6;
                    const lat = this._coordPool[p * 2 + 1] / 1e6;
                    edgeCoords.push([lng, lat]);
                }

                // 如果沿反向边行走，需翻转该折线的点序
                if (isReverse) {
                    edgeCoords.reverse();
                }

                if (coordinates.length > 0 && edgeCoords.length > 0) {
                    edgeCoords.shift();
                }
                coordinates.push(...edgeCoords);
            }
        }
        return coordinates;
    }
}

if (typeof window !== 'undefined') {
    window.PGRBRouter = PGRBRouter;
}

export { PGRBRouter };
export default PGRBRouter;

