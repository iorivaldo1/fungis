// ==========================================
// QIX (.qix) 索引解析器定义 (提取版)
// ==========================================

function parseQixNode(view, offset) {
    const node = {};
    node.length = view.getUint32(offset, true); offset += 4;
    node.bbox_xmin = view.getFloat64(offset, true); offset += 8;
    node.bbox_ymin = view.getFloat64(offset, true); offset += 8;
    node.bbox_xmax = view.getFloat64(offset, true); offset += 8;
    node.bbox_ymax = view.getFloat64(offset, true); offset += 8;
    node.num_shapes = view.getUint32(offset, true); offset += 4;
    
    node.shape_ids = [];
    for (let i = 0; i < node.num_shapes; i++) {
        node.shape_ids.push(view.getUint32(offset, true));
        offset += 4;
    }
    
    node.num_subnodes = view.getUint32(offset, true); offset += 4;
    
    node.children = [];
    for (let i = 0; i < node.num_subnodes; i++) {
        const result = parseQixNode(view, offset);
        node.children.push(result.node);
        offset = result.nextOffset;
    }
    
    return { node, nextOffset: offset };
}

export function parseQix(uint8Array) {
    try {
        const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
        let offset = 0;
        
        const header = {};
        header.magic = new TextDecoder().decode(uint8Array.slice(offset, offset + 3)); offset += 3;
        header.version = view.getUint8(offset); offset += 1;
        header.endian_flag = view.getUint32(offset, true); offset += 4;
        header.total_shapes = view.getUint32(offset, true); offset += 4;
        header.max_depth = view.getUint32(offset, true); offset += 4;
        
        const rootNodeResult = parseQixNode(view, offset);
        
        return {
            header,
            root_node: rootNodeResult.node
        };
    } catch (err) {
        console.error("QIX 解析错误:", err);
        return null;
    }
}
