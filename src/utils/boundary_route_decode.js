/**
 * boundary_route_decode.js
 * 
 * PGRB 专用紧凑二进制协议解码器与轻量智能导航指引器
 * 支持:
 * 1. PGBB 协议: 行政区边界多边形紧凑二进制流解码 (体积缩减 80%+, 纯整型坐标)
 * 2. PGRP 协议: A* 最优路径折线紧凑二进制流解码 (极速微秒级解析, 零拷贝)
 * 3. 智能导航指引生成器: 融合折线转角几何分析与后端路名反查，自动生成分步导航 (Turn-by-Turn Guide)
 * 4. 彻底解耦 pgrb-router.js: 前端不再需要包含任何底层路网二进制解析与本地 A* 算法，杜绝拓扑泄露
 * 
 * 架构规范: 配合后端 PgrbBoundaryBinary 与 PgrbRoutePath 强类型领域模型 (小端序 Little-Endian)
 */
var BoundaryRouteDecode = (function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        return define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return module.exports;
    } else {
        var lib = factory();
        if (typeof root !== 'undefined') {
            root.BoundaryRouteDecode = lib;
            // 兼容原 PGRBRouter 导航命名空间，杜绝旧引用报错
            root.PGRBRouter = root.PGRBRouter || {};
            root.PGRBRouter.generateNavigationGuide = lib.generateNavigationGuide;
            root.PGRBRouter.calculateDistance = lib.calculateDistance;
            root.PGRBRouter.determineManeuver = lib.determineManeuver;
            root.PGRBRouter.formatDistance = lib.formatDistance;
        }
        return lib;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var BoundaryRouteDecode = {};

    /**
     * 辅助方法: 统一转化为 DataView (安全处理 Buffer / ArrayBuffer / TypedArray)
     */
    function createDataView(input) {
        if (!input) return null;
        if (input instanceof DataView) return input;
        if (input instanceof ArrayBuffer) return new DataView(input);
        if (input.buffer && input.buffer instanceof ArrayBuffer) {
            return new DataView(input.buffer, input.byteOffset, input.byteLength);
        }
        return null;
    }

    function readMagic(view, offset) {
        return String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
        );
    }

    /**
     * 判断是否为有效 PGBB 边界二进制流
     */
    BoundaryRouteDecode.isPGBB = function (buffer) {
        var view = createDataView(buffer);
        if (!view || view.byteLength < 16) return false;
        return readMagic(view, 0) === 'PGBB';
    };

    /**
     * 判断是否为有效 PGRP 路径二进制流
     */
    BoundaryRouteDecode.isPGRP = function (buffer) {
        var view = createDataView(buffer);
        if (!view || view.byteLength < 44) return false;
        return readMagic(view, 0) === 'PGRP';
    };

    /**
     * 解码 PGBB 行政区多边形边界二进制数据
     * 协议格式:
     * - Header (16 字节，小端序):
     *   Magic (4B): "PGBB"
     *   Version (2B): uint16
     *   Flags (2B): uint16
     *   ringCount (4B): uint32 环数量
     *   totalPointCount (4B): uint32 边界点总数
     * - Body:
     *   ringSizes (ringCount * 4B): 每个环的点数 (uint32)
     *   coordinates (totalPointCount * 8B): 经纬度整型对 (lngInt, latInt), 实数 = int / 1e6
     * 
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {Object} 包含 GeoJSON Polygon 和元数据
     */
    BoundaryRouteDecode.decodeBoundary = function (buffer) {
        var view = createDataView(buffer);
        if (!view || view.byteLength < 16) {
            throw new Error('[BoundaryRouteDecode] PGBB 数据长度不足 16 字节');
        }

        var magic = readMagic(view, 0);
        if (magic !== 'PGBB') {
            throw new Error('[BoundaryRouteDecode] 非法 PGBB 魔数: ' + magic);
        }

        var version = view.getUint16(4, true);
        var flags = view.getUint16(6, true);
        var ringCount = view.getUint32(8, true);
        var totalPointCount = view.getUint32(12, true);

        var offset = 16;
        var ringSizes = new Uint32Array(ringCount);
        for (var r = 0; r < ringCount; r++) {
            ringSizes[r] = view.getUint32(offset, true);
            offset += 4;
        }

        var rings = [];
        var minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;

        for (var i = 0; i < ringCount; i++) {
            var count = ringSizes[i];
            var ringCoords = [];
            for (var p = 0; p < count; p++) {
                var lngInt = view.getInt32(offset, true);
                offset += 4;
                var latInt = view.getInt32(offset, true);
                offset += 4;

                var lng = lngInt / 1000000.0;
                var lat = latInt / 1000000.0;

                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;

                ringCoords.push([lng, lat]);
            }
            rings.push(ringCoords);
        }

        // 构造标准的 GeoJSON 几何体
        var geojson = {
            type: "Polygon",
            coordinates: rings
        };

        return {
            magic: "PGBB",
            version: version,
            flags: flags,
            ringCount: ringCount,
            totalPointCount: totalPointCount,
            bbox: [minLng, minLat, maxLng, maxLat],
            rings: rings,
            geojson: geojson,
            /**
             * 客户端射线法点在多边形内快速判定
             */
            contains: function (lng, lat) {
                return BoundaryRouteDecode.pointInPolygon([lng, lat], rings);
            }
        };
    };

    /**
     * 解码 PGRP 算路结果二进制数据
     * 协议格式:
     * - Header (44 字节，小端序):
     *   Magic (4B): "PGRP"
     *   Version (2B): uint16
     *   Code (2B): uint16 (如 200, 404, 500)
     *   totalDistance (8B): float64 米
     *   costTimeMs (4B): uint32 毫秒
     *   nodeCount (4B): uint32 途经拓扑节点数
     *   coordCount (4B): uint32 折线几何点数
     *   startNodeId (8B): int64 起点拓扑节点 ID
     *   endNodeId (8B): int64 终点拓扑节点 ID
     * - Body:
     *   pathNodes (nodeCount * 4B): uint32 节点索引序列
     *   coordinates (coordCount * 8B): 经纬度整型对 (lngInt, latInt), 实数 = int / 1e6
     * 
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {Object} 兼容标准前端展示与导航反查的 RoutePath 对象
     */
    BoundaryRouteDecode.decodeRoutePath = function (buffer) {
        var view = createDataView(buffer);
        if (!view || view.byteLength < 44) {
            throw new Error('[BoundaryRouteDecode] PGRP 数据长度不足 44 字节');
        }

        var magic = readMagic(view, 0);
        if (magic !== 'PGRP') {
            throw new Error('[BoundaryRouteDecode] 非法 PGRP 魔数: ' + magic);
        }

        var version = view.getUint16(4, true);
        var code = view.getUint16(6, true);
        var totalDistance = view.getFloat64(8, true);
        var costTimeMs = view.getUint32(16, true);
        var nodeCount = view.getUint32(20, true);
        var coordCount = view.getUint32(24, true);

        // 读取 64 位整数 (兼容大数)
        var startNodeId = "0";
        var endNodeId = "0";
        if (typeof view.getBigInt64 === 'function') {
            startNodeId = view.getBigInt64(28, true).toString();
            endNodeId = view.getBigInt64(36, true).toString();
        } else {
            var sl = view.getUint32(28, true);
            var sh = view.getUint32(32, true);
            startNodeId = (sh * 4294967296 + sl).toString();

            var el = view.getUint32(36, true);
            var eh = view.getUint32(40, true);
            endNodeId = (eh * 4294967296 + el).toString();
        }

        var offset = 44;

        // 读取 pathNodes
        var pathNodes = [];
        for (var n = 0; n < nodeCount; n++) {
            pathNodes.push(view.getUint32(offset, true));
            offset += 4;
        }

        // 读取 coordinates
        var coordinates = [];
        for (var c = 0; c < coordCount; c++) {
            var lngInt = view.getInt32(offset, true);
            offset += 4;
            var latInt = view.getInt32(offset, true);
            offset += 4;
            coordinates.push([lngInt / 1000000.0, latInt / 1000000.0]);
        }

        // 构造与原 JSON 接口完全兼容的返回结构
        return {
            code: code,
            msg: code === 200 ? "规划成功" : ("路径规划失败 (Code " + code + ")"),
            data: {
                totalDistance: totalDistance,
                costTimeMs: costTimeMs,
                nodeCount: nodeCount,
                coordCount: coordCount,
                startNode: startNodeId,
                endNode: endNodeId,
                pathNodes: pathNodes,
                geometry: {
                    type: "LineString",
                    coordinates: coordinates
                }
            }
        };
    };

    /**
     * 射线法判定点是否在多边形环组内 (支持内外环判定)
     * @param {Array<number>} pt [lng, lat]
     * @param {Array<Array<Array<number>>>} rings [[ [lng, lat], ... ], ...]
     * @returns {boolean}
     */
    BoundaryRouteDecode.pointInPolygon = function (pt, rings) {
        if (!rings || rings.length === 0) return true;
        var x = pt[0], y = pt[1];

        // 判定外环 (第 0 个环必须包含该点)
        var outer = rings[0];
        var inside = false;
        for (var i = 0, j = outer.length - 1; i < outer.length; j = i++) {
            var xi = outer[i][0], yi = outer[i][1];
            var xj = outer[j][0], yj = outer[j][1];
            var intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
            if (intersect) inside = !inside;
        }

        if (!inside) return false;

        // 如果存在内环（洞孔），点落在内环中则视为不在区域内
        for (var r = 1; r < rings.length; r++) {
            var hole = rings[r];
            var inHole = false;
            for (var hi = 0, hj = hole.length - 1; hi < hole.length; hj = hi++) {
                var hxi = hole[hi][0], hyi = hole[hi][1];
                var hxj = hole[hj][0], hyj = hole[hj][1];
                var hit = ((hyi > y) !== (hyj > y)) &&
                    (x < (hxj - hxi) * (y - hyi) / (hyj - hyi + 1e-12) + hxi);
                if (hit) inHole = !inHole;
            }
            if (inHole) return false;
        }

        return true;
    };

    // =========================================================================
    // 智能导航与几何转角分析工具函数 (完全独立，零依赖 pgrb-router.js)
    // =========================================================================

    /**
     * Haversine 球面大圆距离 (米)
     */
    BoundaryRouteDecode.calculateDistance = function (p1, p2) {
        if (!p1 || !p2) return 0;
        var R = 6371000;
        var rad = Math.PI / 180;
        var lat1 = p1[1] * rad;
        var lat2 = p2[1] * rad;
        var dLat = (p2[1] - p1[1]) * rad;
        var dLng = (p2[0] - p1[0]) * rad;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    /**
     * 计算向量 p1 -> p2 的正北航向角 (0°~360°)
     */
    BoundaryRouteDecode.calculateBearing = function (p1, p2) {
        if (!p1 || !p2) return 0;
        var rad = Math.PI / 180;
        var lat1 = p1[1] * rad;
        var lat2 = p2[1] * rad;
        var dLng = (p2[0] - p1[0]) * rad;
        var y = Math.sin(dLng) * Math.cos(lat2);
        var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    };

    /**
     * 根据前一节点、当前拐点、后一节点判断转向动作与转向角
     */
    BoundaryRouteDecode.determineManeuver = function (pPrev, pCurr, pNext) {
        if (!pPrev || !pCurr || !pNext) {
            return {
                maneuver: 'straight',
                maneuverName: '直行',
                turnAngle: 0,
                icon: 'straight',
                description: '沿当前道路继续直行'
            };
        }

        var bearingIn = BoundaryRouteDecode.calculateBearing(pPrev, pCurr);
        var bearingOut = BoundaryRouteDecode.calculateBearing(pCurr, pNext);

        var deltaAngle = bearingOut - bearingIn;
        while (deltaAngle > 180) deltaAngle -= 360;
        while (deltaAngle <= -180) deltaAngle += 360;

        var absDelta = Math.abs(deltaAngle);

        if (absDelta <= 18) {
            return {
                maneuver: 'straight',
                maneuverName: '直行',
                turnAngle: deltaAngle,
                icon: 'straight',
                description: '沿道路继续直行'
            };
        } else if (absDelta >= 162) {
            return {
                maneuver: 'u-turn',
                maneuverName: '掉头',
                turnAngle: deltaAngle,
                icon: 'u-turn',
                description: '在前方允许掉头处掉头行驶'
            };
        } else if (deltaAngle > 0) {
            if (deltaAngle <= 55) {
                return {
                    maneuver: 'slight-right',
                    maneuverName: '偏右转',
                    turnAngle: deltaAngle,
                    icon: 'slight-right',
                    description: '向右前方偏右行驶'
                };
            } else if (deltaAngle <= 135) {
                return {
                    maneuver: 'turn-right',
                    maneuverName: '右转',
                    turnAngle: deltaAngle,
                    icon: 'turn-right',
                    description: '路口右转'
                };
            } else {
                return {
                    maneuver: 'sharp-right',
                    maneuverName: '向右后方转',
                    turnAngle: deltaAngle,
                    icon: 'sharp-right',
                    description: '向右后方转弯'
                };
            }
        } else {
            var negAngle = deltaAngle;
            if (negAngle >= -55) {
                return {
                    maneuver: 'slight-left',
                    maneuverName: '偏左转',
                    turnAngle: deltaAngle,
                    icon: 'slight-left',
                    description: '向左前方偏左行驶'
                };
            } else if (negAngle >= -135) {
                return {
                    maneuver: 'turn-left',
                    maneuverName: '左转',
                    turnAngle: deltaAngle,
                    icon: 'turn-left',
                    description: '路口左转'
                };
            } else {
                return {
                    maneuver: 'sharp-left',
                    maneuverName: '向左后方转',
                    turnAngle: deltaAngle,
                    icon: 'sharp-left',
                    description: '向左后方转弯'
                };
            }
        }
    };

    /**
     * 格式化距离显示 (米 / 公里)
     */
    BoundaryRouteDecode.formatDistance = function (meters) {
        if (meters == null || isNaN(meters)) return '0米';
        if (meters < 1000) {
            return Math.round(meters) + '米';
        }
        return (meters / 1000).toFixed(1) + '公里';
    };

    /**
     * 核心导航步骤组装算法：融合路线几何坐标与后端沿途路名数据，生成结构化 Turn-by-turn 导航指引
     * @param {Array<Array<number>>} coordinates 路线完整经纬度点集 [[lng, lat], ...]
     * @param {object} roadData 后端 /geo/route/road-names 返回的沿途路名数据
     * @returns {object} { totalDistance, distanceText, estimatedMinutes, totalSteps, mainRoads, steps: [...] }
     */
    BoundaryRouteDecode.generateNavigationGuide = function (coordinates, roadData) {
        if (!coordinates || coordinates.length < 2) {
            return {
                totalDistance: 0,
                distanceText: '0米',
                estimatedMinutes: 0,
                totalSteps: 0,
                mainRoads: [],
                steps: []
            };
        }

        var ptCount = coordinates.length;
        var cumDists = new Float64Array(ptCount);
        for (var i = 1; i < ptCount; i++) {
            cumDists[i] = cumDists[i - 1] + BoundaryRouteDecode.calculateDistance(coordinates[i - 1], coordinates[i]);
        }
        var totalDistance = cumDists[ptCount - 1];

        var sections = (roadData && Array.isArray(roadData.sections) && roadData.sections.length > 0)
            ? roadData.sections
            : null;

        if (!sections) {
            sections = [{
                roadName: '未名道路',
                startIndex: 0,
                endIndex: ptCount - 1,
                length: totalDistance
            }];
        }

        var ptRoadNameMap = new Array(ptCount).fill('未名道路');
        sections.forEach(function (sec) {
            var sIdx = Math.max(0, Math.min(ptCount - 1, sec.startIndex != null ? sec.startIndex : 0));
            var eIdx = Math.max(sIdx, Math.min(ptCount - 1, sec.endIndex != null ? sec.endIndex : ptCount - 1));
            var name = (sec.roadName && sec.roadName.trim() !== '') ? sec.roadName.trim() : '未名道路';
            for (var k = sIdx; k <= eIdx; k++) {
                ptRoadNameMap[k] = name;
            }
        });

        function getWindowedTurnInfo(idx) {
            if (idx <= 0 || idx >= ptCount - 1) {
                return { turnAngle: 0, maneuver: 'straight', maneuverName: '直行', icon: 'straight' };
            }
            var prevI = idx - 1;
            while (prevI > 0 && (cumDists[idx] - cumDists[prevI] < 15)) prevI--;
            var nextI = idx + 1;
            while (nextI < ptCount - 1 && (cumDists[nextI] - cumDists[idx] < 15)) nextI++;
            return BoundaryRouteDecode.determineManeuver(coordinates[prevI], coordinates[idx], coordinates[nextI]);
        }

        var rawDecisionPoints = [0];
        for (var j = 1; j < ptCount - 1; j++) {
            var roadPrev = ptRoadNameMap[j - 1];
            var roadNext = ptRoadNameMap[j];
            var isRoadChanged = (roadPrev !== roadNext);

            var mInfo = getWindowedTurnInfo(j);
            var isSharpTurn = Math.abs(mInfo.turnAngle) >= 28;

            if (isRoadChanged || isSharpTurn) {
                rawDecisionPoints.push(j);
            }
        }
        rawDecisionPoints.push(ptCount - 1);

        var decisionIndices = [0];
        var lastPushedIdx = 0;
        for (var m = 1; m < rawDecisionPoints.length - 1; m++) {
            var pIdx = rawDecisionPoints[m];
            var distFromLast = cumDists[pIdx] - cumDists[lastPushedIdx];

            if (distFromLast < 30) {
                var prevM = getWindowedTurnInfo(lastPushedIdx);
                var currM = getWindowedTurnInfo(pIdx);
                if (lastPushedIdx > 0 && Math.abs(currM.turnAngle) > Math.abs(prevM.turnAngle)) {
                    decisionIndices[decisionIndices.length - 1] = pIdx;
                    lastPushedIdx = pIdx;
                }
            } else {
                decisionIndices.push(pIdx);
                lastPushedIdx = pIdx;
            }
        }
        if (decisionIndices[decisionIndices.length - 1] !== ptCount - 1) {
            decisionIndices.push(ptCount - 1);
        }

        var steps = [];
        var stepCounter = 1;

        for (var d = 0; d < decisionIndices.length - 1; d++) {
            var curIdx = decisionIndices[d];
            var nextIdx = decisionIndices[d + 1];

            var stepCoords = coordinates.slice(curIdx, nextIdx + 1);
            var stepDist = cumDists[nextIdx] - cumDists[curIdx];

            var curSegmentRoad = ptRoadNameMap[curIdx];
            if (curSegmentRoad === '未名道路' && curIdx + 1 <= nextIdx) {
                curSegmentRoad = ptRoadNameMap[curIdx + 1] || '未名道路';
            }

            var prevRoadName = curIdx > 0 ? ptRoadNameMap[curIdx - 1] : '';

            var maneuver = 'straight';
            var maneuverName = '直行';
            var icon = 'straight';
            var turnAngle = 0;
            var instruction = '';

            if (d === 0) {
                maneuver = 'depart';
                maneuverName = '出发';
                icon = 'depart';
                instruction = '从起点出发，沿【' + curSegmentRoad + '】行驶 ' + BoundaryRouteDecode.formatDistance(stepDist);
            } else {
                var mRes = getWindowedTurnInfo(curIdx);
                maneuver = mRes.maneuver;
                maneuverName = mRes.maneuverName;
                icon = mRes.icon;
                turnAngle = mRes.turnAngle;

                var isEnteringNewNamedRoad = (curSegmentRoad !== prevRoadName) && (curSegmentRoad !== '未名道路');
                var isEnteringUnnamedRoad = (curSegmentRoad !== prevRoadName) && (curSegmentRoad === '未名道路') && (prevRoadName !== '');

                if (isEnteringNewNamedRoad) {
                    if (maneuver === 'straight') {
                        instruction = '直行，进入【' + curSegmentRoad + '】行驶 ' + BoundaryRouteDecode.formatDistance(stepDist);
                    } else {
                        instruction = maneuverName + '，进入【' + curSegmentRoad + '】行驶 ' + BoundaryRouteDecode.formatDistance(stepDist);
                    }
                } else if (isEnteringUnnamedRoad) {
                    if (maneuver === 'straight') {
                        instruction = '直行，驶入【未名道路】行驶 ' + BoundaryRouteDecode.formatDistance(stepDist);
                    } else {
                        instruction = maneuverName + '，驶入【未名道路】行驶 ' + BoundaryRouteDecode.formatDistance(stepDist);
                    }
                } else {
                    if (maneuver === 'straight') {
                        instruction = '沿【' + curSegmentRoad + '】继续直行 ' + BoundaryRouteDecode.formatDistance(stepDist);
                    } else {
                        instruction = maneuverName + '，继续沿【' + curSegmentRoad + '】行驶 ' + BoundaryRouteDecode.formatDistance(stepDist);
                    }
                }
            }

            steps.push({
                stepIndex: stepCounter++,
                maneuver: maneuver,
                maneuverName: maneuverName,
                icon: icon,
                roadName: curSegmentRoad,
                nextRoadName: (nextIdx < ptCount ? ptRoadNameMap[nextIdx] : ''),
                distance: stepDist,
                distanceText: BoundaryRouteDecode.formatDistance(stepDist),
                cumulativeDistance: cumDists[nextIdx],
                turnAngle: Math.round(turnAngle),
                coordinate: coordinates[curIdx],
                endCoordinate: coordinates[nextIdx],
                instruction: instruction,
                coords: stepCoords
            });
        }

        steps.push({
            stepIndex: stepCounter,
            maneuver: 'arrive',
            maneuverName: '到达',
            icon: 'arrive',
            roadName: ptRoadNameMap[ptCount - 1] || '目的地',
            nextRoadName: '',
            distance: 0,
            distanceText: '0米',
            cumulativeDistance: totalDistance,
            turnAngle: 0,
            coordinate: coordinates[ptCount - 1],
            endCoordinate: coordinates[ptCount - 1],
            instruction: '到达目的地附近，导航结束',
            coords: [coordinates[ptCount - 1]]
        });

        var mainRoads = [];
        var seenRoads = new Set();
        steps.forEach(function (s) {
            if (s.roadName && s.roadName !== '未名道路' && !seenRoads.has(s.roadName)) {
                seenRoads.add(s.roadName);
                mainRoads.push(s.roadName);
            }
        });

        var estimatedMinutes = Math.max(1, Math.round(totalDistance / (35 * 1000 / 60)));

        return {
            totalDistance: Math.round(totalDistance * 10) / 10,
            distanceText: BoundaryRouteDecode.formatDistance(totalDistance),
            estimatedMinutes: estimatedMinutes,
            totalSteps: steps.length,
            mainRoads: mainRoads,
            steps: steps
        };
    };

    return BoundaryRouteDecode;
}));

export { BoundaryRouteDecode };
export default BoundaryRouteDecode;
