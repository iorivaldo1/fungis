// ==========================================
// ESRI Shapefile SBN (.sbn) 空间二进制索引解析器
// ==========================================

/**
 * 0..255 归一化网格坐标转换为真实地理坐标
 */
export function binToCoord(binVal, minVal, maxVal) {
    return minVal + (binVal / 255.0) * (maxVal - minVal);
}

/**
 * 真实地理坐标转换为 0..255 归一化网格坐标
 */
export function coordToBin(val, minVal, maxVal) {
    if (maxVal === minVal) return 0;
    const b = Math.round(((val - minVal) / (maxVal - minVal)) * 255.0);
    return Math.max(0, Math.min(255, b));
}

/**
 * 解析 SBN ArrayBuffer
 * @param {ArrayBuffer|Uint8Array} buffer 
 * @returns {Object} SBN 解析结果模型
 */
export function parseSbn(buffer) {
    try {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let offset = 0;

        // 1. 解析固定 100 字节 Header (全为 Big-Endian)
        const fileCode = view.getUint32(offset, false); offset += 4;
        const signature = view.getInt32(offset, false); offset += 4;
        offset += 16; // reserved1
        const fileLengthWords = view.getUint32(offset, false); offset += 4;
        const version = view.getUint32(offset, false); offset += 4;

        const xmin = view.getFloat64(offset, false); offset += 8;
        const ymin = view.getFloat64(offset, false); offset += 8;
        const xmax = view.getFloat64(offset, false); offset += 8;
        const ymax = view.getFloat64(offset, false); offset += 8;

        const zmin = view.getFloat64(offset, false); offset += 8;
        const zmax = view.getFloat64(offset, false); offset += 8;
        const mmin = view.getFloat64(offset, false); offset += 8;
        const mmax = view.getFloat64(offset, false); offset += 8;
        offset += 4; // reserved2 (offset reaches 100)

        const header = {
            fileCode, signature, fileLengthWords, version,
            bounds: { xmin, ymin, xmax, ymax },
            zRange: { zmin, zmax },
            mRange: { mmin, mmax }
        };

        // 2. 解析 DirectoryNode #1 (根节点, 偏移 100)
        const rootNodeId = view.getUint32(offset, false); offset += 4;
        const rootSizeWords = view.getUint32(offset, false); offset += 4;
        const rootPayloadBytes = rootSizeWords * 2;

        const binDescriptors = [];
        const numPairs = Math.floor(rootPayloadBytes / 8);
        for (let i = 0; i < numPairs; i++) {
            const targetNodeIndex = view.getUint32(offset, false); offset += 4;
            const featureCount = view.getUint32(offset, false); offset += 4;
            binDescriptors.push({
                slotIndex: i,
                targetNodeIndex,
                isNullNode: targetNodeIndex === 0xFFFFFFFF || targetNodeIndex === 4294967295,
                featureCount
            });
        }

        // 3. 解析后续 SpatialNode 节点列表
        const spatialNodes = [];
        const spatialNodeMap = new Map();

        while (offset < view.byteLength) {
            const nodeId = view.getUint32(offset, false); offset += 4;
            const nodeSizeWords = view.getUint32(offset, false); offset += 4;
            const payloadBytes = nodeSizeWords * 2;

            const numEntries = Math.floor(payloadBytes / 8);
            const entries = [];

            for (let i = 0; i < numEntries; i++) {
                const x_bmin = bytes[offset];
                const y_bmin = bytes[offset + 1];
                const x_bmax = bytes[offset + 2];
                const y_bmax = bytes[offset + 3];
                const featureId = view.getUint32(offset + 4, false); // 1-based shape ID
                offset += 8;

                const real_xmin = binToCoord(x_bmin, xmin, xmax);
                const real_ymin = binToCoord(y_bmin, ymin, ymax);
                const real_xmax = binToCoord(x_bmax, xmin, xmax);
                const real_ymax = binToCoord(y_bmax, ymin, ymax);

                entries.push({
                    featureId,
                    binBBox: { xmin: x_bmin, ymin: y_bmin, xmax: x_bmax, ymax: y_bmax },
                    realBBox: { xmin: real_xmin, ymin: real_ymin, xmax: real_xmax, ymax: real_ymax }
                });
            }

            // 处理余下对齐字节（如果有）
            const processedBytes = numEntries * 8;
            if (payloadBytes > processedBytes) {
                offset += (payloadBytes - processedBytes);
            }

            // 计算节点总包围盒包络
            let nodeBBox = null;
            if (entries.length > 0) {
                let n_xmin = Infinity, n_ymin = Infinity, n_xmax = -Infinity, n_ymax = -Infinity;
                entries.forEach(e => {
                    if (e.realBBox.xmin < n_xmin) n_xmin = e.realBBox.xmin;
                    if (e.realBBox.ymin < n_ymin) n_ymin = e.realBBox.ymin;
                    if (e.realBBox.xmax > n_xmax) n_xmax = e.realBBox.xmax;
                    if (e.realBBox.ymax > n_ymax) n_ymax = e.realBBox.ymax;
                });
                nodeBBox = { xmin: n_xmin, ymin: n_ymin, xmax: n_xmax, ymax: n_ymax };
            } else {
                nodeBBox = { ...header.bounds };
            }

            const nodeObj = {
                nodeId,
                entries,
                nodeBBox
            };

            spatialNodes.push(nodeObj);
            spatialNodeMap.set(nodeId, nodeObj);
        }

        // 4. 重构逻辑二叉堆树结构 (Complete Binary Heap Structure)
        // 寻址公式: 父槽位 k -> 左子槽位 2k + 1, 右子槽位 2k + 2
        function buildTreeFromSlots(slotIdx, pathStr = 'Root', nodeSpatialBounds = header.bounds) {
            if (slotIdx >= binDescriptors.length) return null;

            const desc = binDescriptors[slotIdx];
            if (!desc || desc.isNullNode) {
                return {
                    slotIdx,
                    isNull: true,
                    path: pathStr,
                    targetNodeIndex: 0xFFFFFFFF,
                    featureCount: 0,
                    nodeBBox: nodeSpatialBounds,
                    entries: [],
                    children: []
                };
            }

            const spatialNode = spatialNodeMap.get(desc.targetNodeIndex);

            // 计算该节点所代表的空间切分区域 (Spatial Partition Bounds)
            let child1Bounds = { ...nodeSpatialBounds };
            let child2Bounds = { ...nodeSpatialBounds };
            const xMid = (nodeSpatialBounds.xmin + nodeSpatialBounds.xmax) / 2;
            const yMid = (nodeSpatialBounds.ymin + nodeSpatialBounds.ymax) / 2;

            const depth = Math.floor(Math.log2(slotIdx + 1));
            if (depth % 2 === 0) {
                // 偶数深度 (Level 0, Level 2, Level 4...): 沿 X 轴中线二分
                // Slot 2k+1 (Child 1): 东/右半区 (xmin = xMid)
                // Slot 2k+2 (Child 2): 西/左半区 (xmax = xMid)
                child1Bounds = { xmin: xMid, ymin: nodeSpatialBounds.ymin, xmax: nodeSpatialBounds.xmax, ymax: nodeSpatialBounds.ymax };
                child2Bounds = { xmin: nodeSpatialBounds.xmin, ymin: nodeSpatialBounds.ymin, xmax: xMid, ymax: nodeSpatialBounds.ymax };
            } else {
                // 奇数深度 (Level 1, Level 3, Level 5...): 沿 Y 轴中线二分
                // Slot 2k+1 (Child 1): 北/上半区 (ymin = yMid)
                // Slot 2k+2 (Child 2): 南/下半区 (ymax = yMid)
                child1Bounds = { xmin: nodeSpatialBounds.xmin, ymin: yMid, xmax: nodeSpatialBounds.xmax, ymax: nodeSpatialBounds.ymax };
                child2Bounds = { xmin: nodeSpatialBounds.xmin, ymin: nodeSpatialBounds.ymin, xmax: nodeSpatialBounds.xmax, ymax: yMid };
            }

            const leftChild = buildTreeFromSlots(2 * slotIdx + 1, pathStr + '.Child1', child1Bounds);
            const rightChild = buildTreeFromSlots(2 * slotIdx + 2, pathStr + '.Child2', child2Bounds);

            const children = [];
            if (leftChild) children.push(leftChild);
            if (rightChild) children.push(rightChild);

            // 根节点 Slot 0 必然直接为 Header 100 字节读取出的全图坐标范围 header.bounds
            const currentBBox = (slotIdx === 0) ? { ...header.bounds } : nodeSpatialBounds;

            return {
                slotIdx,
                isNull: false,
                path: pathStr,
                targetNodeIndex: desc.targetNodeIndex,
                featureCount: desc.featureCount,
                nodeBBox: currentBBox,
                entries: spatialNode ? spatialNode.entries : [],
                children
            };
        }

        const logicalTreeRoot = buildTreeFromSlots(0, 'Root');

        return {
            header,
            binDescriptors,
            spatialNodes,
            spatialNodeMap,
            logicalTreeRoot
        };
    } catch (err) {
        console.error("ESRI SBN 文件解析错误:", err);
        return null;
    }
}
