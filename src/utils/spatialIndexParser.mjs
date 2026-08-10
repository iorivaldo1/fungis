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

export function parseGist(uint8Array) {
    try {
        const PAGE_SIZE = 8192;
        const numPages = Math.floor(uint8Array.length / PAGE_SIZE);
        const pages = [];
        
        const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

        for (let pageIdx = 0; pageIdx < numPages; pageIdx++) {
            const pageStart = pageIdx * PAGE_SIZE;
            
            // 1. 解析 PageHeaderData (24 字节)
            const pd_lower = view.getUint16(pageStart + 12, true);
            const pd_upper = view.getUint16(pageStart + 14, true);
            const pd_special = view.getUint16(pageStart + 16, true);
            
            const header = {
                pd_lower,
                pd_upper,
                pd_special
            };

            // 2. 提取尾部 GISTPageOpaqueData (16 字节)
            const opaqueFlags = view.getUint16(pageStart + pd_special + 12, true);
            const gist_page_id = view.getUint16(pageStart + pd_special + 14, true);
            
            const parsedFlags = {
                F_LEAF: (opaqueFlags & 0x01) !== 0,
                F_DELETED: (opaqueFlags & 0x02) !== 0,
                F_TUPLES_DELETED: (opaqueFlags & 0x04) !== 0,
                F_HAS_GARBAGE: (opaqueFlags & 0x08) !== 0,
                F_FOLLOW_RIGHT: (opaqueFlags & 0x10) !== 0
            };

            // 3. 解析行指针 (Line Pointers) 与数据 Tuple
            const lpCount = Math.max(0, Math.floor((pd_lower - 24) / 4));
            const tuples = [];

            for (let i = 0; i < lpCount; i++) {
                const lpVal = view.getUint32(pageStart + 24 + i * 4, true);
                
                const lp_off = lpVal & 0x7FFF;
                const lp_flags = (lpVal >> 15) & 0x3;
                const lp_len = lpVal >>> 17;

                if (lp_flags === 1 && lp_off > 0 && lp_len >= 16) {
                    const tupleStart = pageStart + lp_off;
                    const ip_blkid_hi = view.getUint16(tupleStart + 0, true);
                    const ip_blkid_lo = view.getUint16(tupleStart + 2, true);
                    const ip_posid = view.getUint16(tupleStart + 4, true);
                    const t_info = view.getUint16(tupleStart + 6, true);
                    const target_block = (ip_blkid_hi << 16) | ip_blkid_lo;

                    let x_min = 0, x_max = 0, y_min = 0, y_max = 0;
                    if (lp_len >= 24) {
                        x_min = view.getFloat32(tupleStart + 8, true);
                        x_max = view.getFloat32(tupleStart + 12, true);
                        y_min = view.getFloat32(tupleStart + 16, true);
                        y_max = view.getFloat32(tupleStart + 20, true);
                    } else {
                        x_min = view.getFloat32(tupleStart + 8, true);
                        y_min = view.getFloat32(tupleStart + 12, true);
                        x_max = x_min;
                        y_max = y_min;
                    }

                    tuples.push({
                        item_index: i,
                        offset: lp_off,
                        length: lp_len,
                        target_block: target_block,
                        data: {
                            ip_blkid_hi,
                            ip_blkid_lo,
                            ip_posid,
                            t_info,
                            x_min,
                            x_max,
                            y_min,
                            y_max
                        }
                    });
                }
            }

            pages.push({
                pageIndex: pageIdx,
                header: header,
                flags: parsedFlags,
                isLeaf: parsedFlags.F_LEAF,
                opaqueData: { flags: opaqueFlags, gist_page_id },
                tuples: tuples
            });
        }

        return pages;
    } catch (err) {
        console.error("GIST 解析错误:", err);
        return null;
    }
}

