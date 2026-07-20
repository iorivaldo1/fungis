// 存储覆盖物图层容器
let bbox_layer;

export function initBBoxLayer(map) {
    if (!bbox_layer) {
        // 为了兼容原生天地图没有 T.LayerGroup 的情况，做了数组降级处理
        bbox_layer = typeof T.LayerGroup !== "undefined" ? new T.LayerGroup() : [];
        if (typeof T.LayerGroup !== "undefined") {
            map.addOverLay(bbox_layer);
        }
    }
    return bbox_layer;
}

// 渲染 PG R树 (GIST) 的首个页面 bbox
export function draw_pg_rtree_bbox(map, pages) {
    if (!bbox_layer) {
        initBBoxLayer(map);
    }

    // 1. 渲染前先清空 bbox_layer 容器
    if (bbox_layer.clearLayers) {
        bbox_layer.clearLayers();
    } else {
        bbox_layer.forEach(p => map.removeOverLay(p));
        bbox_layer.length = 0;
    }

    if (!pages || pages.length === 0) return;
    
    const page0 = pages[0]; // 提取 page0
    if (!page0.tuples) return;

    // 2. 遍历 page0 中的所有 bbox 实体进行渲染
    page0.tuples.forEach((tuple) => {
        const b = tuple.data;
        // BBox 点序：左下, 右下, 右上, 左上
        const points = [
            new T.LngLat(b.x_min, b.y_min),
            new T.LngLat(b.x_max, b.y_min),
            new T.LngLat(b.x_max, b.y_max),
            new T.LngLat(b.x_min, b.y_max)
        ];

        const polygon = new T.Polygon(points, {
            color: "red",
            weight: 2,
            opacity: 0.8,
            fillColor: "rgba(255, 0, 0, 0.1)",
            fillOpacity: 0.3
        });

        // 将图形加入对应的容器中
        if (bbox_layer.addLayer) {
            bbox_layer.addLayer(polygon);
        } else {
            map.addOverLay(polygon);
            bbox_layer.push(polygon);
        }
    });
    
    console.log(`[渲染] 成功将 Page 0 的 ${page0.tuples.length} 个 BBox 渲染至地图`);
}

const nodePolygons = {}; // Map to store drawn polygons

// 渲染 QIX 单个节点 bbox
export function draw_single_node_bbox(map, node, depth, nodeId) {
    if (!bbox_layer) {
        initBBoxLayer(map);
    }
    
    // 如果已经画过了，就不再重复画
    if (nodePolygons[nodeId]) return;

    const points = [
        new T.LngLat(node.bbox_xmin, node.bbox_ymin),
        new T.LngLat(node.bbox_xmax, node.bbox_ymin),
        new T.LngLat(node.bbox_xmax, node.bbox_ymax),
        new T.LngLat(node.bbox_xmin, node.bbox_ymax)
    ];

    const colors = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33"];
    const color = colors[depth % colors.length];

    const polygon = new T.Polygon(points, {
        color: color,
        weight: 2,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.1
    });

    if (bbox_layer.addLayer) {
        bbox_layer.addLayer(polygon);
    } else {
        map.addOverLay(polygon);
        bbox_layer.push(polygon);
    }
    nodePolygons[nodeId] = polygon;
}

// 移除 QIX 单个节点 bbox
export function remove_single_node_bbox(map, nodeId) {
    const polygon = nodePolygons[nodeId];
    if (polygon) {
        if (bbox_layer.removeLayer) {
            bbox_layer.removeLayer(polygon);
        } else {
            map.removeOverLay(polygon);
            const index = bbox_layer.indexOf(polygon);
            if (index > -1) bbox_layer.splice(index, 1);
        }
        delete nodePolygons[nodeId];
    }
}

// 清除所有单独绘制的 QIX 节点 bbox
export function clear_all_single_node_bboxes(map) {
    if (bbox_layer) {
        if (bbox_layer.clearLayers) {
            bbox_layer.clearLayers();
        } else {
            bbox_layer.forEach(p => map.removeOverLay(p));
            bbox_layer.length = 0;
        }
    }
    for (const key in nodePolygons) delete nodePolygons[key];
}

// 渲染 QIX 的 bbox
export function draw_qix_bbox(map, qixResult) {
    if (!bbox_layer) {
        initBBoxLayer(map);
    }

    // 1. 渲染前先清空 bbox_layer 容器
    if (bbox_layer.clearLayers) {
        bbox_layer.clearLayers();
    } else {
        bbox_layer.forEach(p => map.removeOverLay(p));
        bbox_layer.length = 0;
    }

    if (!qixResult || !qixResult.root_node) return;

    const polygons = [];
    
    // 递归遍历所有节点
    function traverse(node, depth) {
        // BBox 点序：左下, 右下, 右上, 左上
        const points = [
            new T.LngLat(node.bbox_xmin, node.bbox_ymin),
            new T.LngLat(node.bbox_xmax, node.bbox_ymin),
            new T.LngLat(node.bbox_xmax, node.bbox_ymax),
            new T.LngLat(node.bbox_xmin, node.bbox_ymax)
        ];

        // 使用不同颜色区分不同层级的节点
        const colors = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33"];
        const color = colors[depth % colors.length];

        const polygon = new T.Polygon(points, {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.1
        });
        polygons.push(polygon);

        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1));
        }
    }

    traverse(qixResult.root_node, 0);

    // 将图形加入对应的容器中
    polygons.forEach((polygon) => {
        if (bbox_layer.addLayer) {
            bbox_layer.addLayer(polygon);
        } else {
            map.addOverLay(polygon);
            bbox_layer.push(polygon);
        }
    });

    console.log(`[渲染] 成功将 QIX 的 ${polygons.length} 个 BBox 渲染至地图`);
}
