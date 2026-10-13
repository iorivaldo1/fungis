/**
 * pgrb_route_manager.js
 * 纯净矢量底图 (MapLibre GL) 路径规划、路网管理与 A* 演进动画公共业务模块
 * 架构规范：全异步非阻塞请求，纯净无 Emoji 科技风设计
 */

(function (window, $) {
    'use strict';

    const DEFAULT_CONFIG = {
        serverPort: '8080',
        get apiBaseUrl() { return `http://localhost:${this.serverPort}`; },
        get geoserverUrl() { return `http://localhost:8080`; },
        get routeDataManageApiBase() { return `${this.apiBaseUrl}/get_geo_pg/geo/route/data-manage`; },
        get xzqApiBase() { return `${this.apiBaseUrl}/get_geo_pg/geo/route/xzq`; },
        get pgrbApiBase() { return `${this.apiBaseUrl}/get_geo_pg/geo/route/pgrb`; },
        get wmtsTileUrl() {
            return `${this.geoserverUrl}/geoserver/gwc/service/wmts?` +
                'Request=GetTile&Service=WMTS&Version=1.0.0' +
                '&LAYER=basemap:sc_road&STYLE=&Format=image%2Fpng' +
                '&TILEMATRIXSET=EPSG%3A900913&TILEMATRIX=EPSG%3A900913%3A{z}' +
                '&TILEROW={y}&TILECOL={x}';
        },
        // 四川省地理范围 [西经, 南纬, 东经, 北纬]，精准限制瓦片请求视窗 (严格匹配 GeoServer basemap:sc_road 图层范围)
        wmtsBounds: [97.1649772, 26.0568985, 108.579466, 34.3658024]
    };

    const ROUTE_PALETTE = [
        '#38bdf8', '#f59e0b', '#10b981', '#ec4899', '#a855f7',
        '#06b6d4', '#84cc16', '#f97316', '#e11d48', '#14b8a6',
        '#8b5cf6', '#eab308'
    ];

    /**
     * WmtsRoadManager - 独立 WMTS 背景道路切片与图层控制管理器
     * 架构职责：脱离路径规划引擎独立运行，负责 WMTS 瓦片加载、图层控制面板联动以及底图切换监听
     */
    class WmtsRoadManager {
        constructor() {
            this.map = null;
            this.config = Object.assign({}, DEFAULT_CONFIG);
            this.isInitialized = false;
            this.currentPbfTheme = 'standard';
        }

        init(mapInstance, options = {}) {
            if (!mapInstance) {
                console.error('[WmtsRoadManager] 初始化失败: 未提供 maplibre-gl Map 实例');
                return;
            }
            this.map = mapInstance;
            if (options.serverPort) {
                this.config.serverPort = String(options.serverPort);
            }
            if (options.geoserverUrl) {
                this.config.geoserverUrl = String(options.geoserverUrl);
            }
            if (options.wmtsBounds) {
                this.config.wmtsBounds = options.wmtsBounds;
            }

            this.ensureLayer();

            if (!this.isInitialized) {
                this.bindEvents();
                this.isInitialized = true;
                console.log('[WmtsRoadManager] 独立 WMTS 背景道路图层与图层控制模块初始化完成');
            }
        }

        ensureLayer() {
            const map = this.map;
            if (!map) return;

            // 1. WMTS 背景道路切片源 (设置四川省 bounds 保护，杜绝越界 400 瓦片请求)
            if (!map.getSource('wmts-roads-source')) {
                map.addSource('wmts-roads-source', {
                    type: 'raster',
                    tiles: [this.config.wmtsTileUrl],
                    tileSize: 256,
                    bounds: this.config.wmtsBounds
                });
            }

            // 2. WMTS 背景道路切片图层 (根据当前复选框状态决定初始显隐)
            const chkRoads = document.getElementById('chkShowRoads');
            const isShowRoads = chkRoads ? chkRoads.checked : true;

            if (!map.getLayer('wmts-roads-layer')) {
                map.addLayer({
                    id: 'wmts-roads-layer',
                    type: 'raster',
                    source: 'wmts-roads-source',
                    minzoom: 1,
                    maxzoom: 18,
                    paint: { 'raster-opacity': 0.85 },
                    layout: { visibility: isShowRoads ? 'visible' : 'none' }
                });
            } else {
                map.setLayoutProperty('wmts-roads-layer', 'visibility', isShowRoads ? 'visible' : 'none');
            }
        }

        setVisible(visible) {
            if (this.map && this.map.getLayer('wmts-roads-layer')) {
                this.map.setLayoutProperty('wmts-roads-layer', 'visibility', visible ? 'visible' : 'none');
            }
            const chkRoads = document.getElementById('chkShowRoads');
            if (chkRoads && chkRoads.checked !== visible) {
                chkRoads.checked = visible;
            }
        }

        bindEvents() {
            const self = this;

            // 1. 图层控制面板交互 (展开/折叠/点击外部关闭)
            $('#btnToggleLayerControl').off('click.wmts').on('click.wmts', function (e) {
                e.stopPropagation();
                const $panel = $('#layerControlPanel');
                const isShown = $panel.is(':visible');
                if (isShown) {
                    $panel.hide();
                    $(this).removeClass('active');
                } else {
                    $panel.show();
                    $(this).addClass('active');
                }
            });

            $('#btnCloseLayerPanel').off('click.wmts').on('click.wmts', function (e) {
                e.stopPropagation();
                $('#layerControlPanel').hide();
                $('#btnToggleLayerControl').removeClass('active');
            });

            $(document).off('click.wmtsLayerControl').on('click.wmtsLayerControl', function (e) {
                if (!$(e.target).closest('#layerControlContainer').length) {
                    $('#layerControlPanel').hide();
                    $('#btnToggleLayerControl').removeClass('active');
                }
            });

            // 2. 叠加 WMTS 背景道路切片复选框
            $('#chkShowRoads').off('change.wmts').on('change.wmts', function () {
                self.setVisible(this.checked);
            });

            // 3. 矢量底图显隐切换 (白名单保护自定义业务图层)
            $('#chkShowBaseMap').off('change.wmtsBase').on('change.wmtsBase', function () {
                const visible = this.checked;
                const customLayers = new Set([
                    'wmts-roads-layer',
                    'xzq-boundary-fill', 'xzq-boundary-outline',
                    'route-single-casing', 'route-single-glow', 'route-single-core', 'route-single-arrows',
                    'route-dash-casing', 'route-dash-layer',
                    'route-multi-casing', 'route-multi-glow', 'route-multi-core', 'route-multi-arrows',
                    'nav-segment-halo', 'nav-segment-casing', 'nav-segment-core', 'nav-segment-pulse',
                    'nav-segment-line-shader-layer', 'nav-node-beacon-shader-layer',
                    'anim-edges-layer', 'anim-nodes-layer',
                    'anim-optimal-glow', 'anim-optimal-core', 'anim-optimal-dash',
                    'route-pins-glow', 'route-pins-halo', 'route-pins-core', 'route-pins-dot', 'route-pins-label'
                ]);
                const style = self.map ? self.map.getStyle() : null;
                if (style && Array.isArray(style.layers)) {
                    style.layers.forEach(l => {
                        if (!customLayers.has(l.id) && l.type !== 'background') {
                            self.map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
                        }
                    });
                }
            });

            // 4. 矢量底图主题方案切换 (暗黑 / 标准 / 常规 / 素色)
            document.querySelectorAll('.pbf-style-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    const theme = this.getAttribute('data-theme');
                    if (!theme || self.currentPbfTheme === theme || !window.SMGI_STYLES || !window.SMGI_STYLES[theme]) return;
                    self.currentPbfTheme = theme;
                    document.querySelectorAll('.pbf-style-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');

                    if (self.map) {
                        self.map.setStyle(window.SMGI_STYLES[theme].style);
                        self.map.once('styledata', () => {
                            if (typeof window.addAllDecodedImagesToMap === 'function') {
                                window.addAllDecodedImagesToMap(self.map);
                            }
                            if (self.map.getLayer('背景')) {
                                self.map.setPaintProperty('背景', 'background-color', '#0b1120');
                                self.map.setPaintProperty('背景', 'background-opacity', 1);
                            }
                            const styleLayers = (self.map.getStyle() && self.map.getStyle().layers) || [];
                            styleLayers.forEach(lyr => {
                                if (lyr.type === 'background') {
                                    self.map.setPaintProperty(lyr.id, 'background-color', '#0b1120');
                                    self.map.setPaintProperty(lyr.id, 'background-opacity', 1);
                                }
                            });
                            // 恢复 WMTS 图层
                            self.ensureLayer();

                            // 如果路线规划管理器已初始化，则恢复路线可视化
                            if (window.PgrbRouteManager && window.PgrbRouteManager.isInitialized) {
                                window.PgrbRouteManager.registerArrowIcon();
                                window.PgrbRouteManager.setupAppSourcesAndLayers();
                                window.PgrbRouteManager.restoreActiveVisuals();
                            }
                        });
                    }
                });
            });
        }
    }

    class PgrbRouteManager {
        constructor() {
            this.map = null;
            this.config = Object.assign({}, DEFAULT_CONFIG);

            // 状态变量
            this.selectedLevelFilter = 'county';
            this.currentPbfTheme = 'standard';
            this.selectedNetworkId = '';
            this.networksList = [];
            this.editableNetworks = [];
            this.networksLoading = true;
            this.pickingMode = null; // 'start' | 'end' | null

            this.currentPinsGeojson = { type: 'FeatureCollection', features: [] };
            this.draggedPinId = null;

            this.startMarker = null;
            this.endMarker = null;
            this.currentRouteCoords = null;
            this.currentRouteData = null;
            this.currentBoundaryGeojson = null;
            this.rollingDashLayer = null;
            this.currentMultiGeojson = { type: 'FeatureCollection', features: [] };
            this.currentMultiRoutesData = [];
            this.currentFocusedMultiIdx = 0;
            this.navSegmentLineLayer = null;
            this.navNodeBeaconLayer = null;
            this.currentNavSegmentGeojson = { type: 'FeatureCollection', features: [] };
            this.currentAnimEdgesGeojson = { type: 'FeatureCollection', features: [] };
            this.currentAnimNodesGeojson = { type: 'FeatureCollection', features: [] };
            this.currentAnimOptimalGeojson = { type: 'FeatureCollection', features: [] };
            this.currentWarningPopup = null;
            this.isOptimalPathDrawn = false;
            this.lastNavClickTime = 0;

            this.currentNetworkMeta = null;
            this.currentNetworkBoundary = null;
            this.currentParadigm = '1_to_1';
            this.multiDestPoints = [];
            this.multiOrigPoints = [];
            this.isContinuousPicking = false;

            // 动画状态
            this.currentAnimateData = null;
            this.currentAnimationFrames = [];
            this.animStepIndex = 0;
            this.isAnimPlaying = false;
            this.animTimer = null;
            this.animSpeed = 40;

            // 导航状态
            this.currentNavGuideCache = null;
            this.currentNavStepIdx = 0;
            this.navAbortController = null;
            this.isNavGuideFetching = false;
            this.navHighlightMarker = null;

            // 缓存
            this.xzqListCache = new Map();

            // 行政区划相交新建路网状态
            this.currentXzqLevel = 'town';
            this.xzqLevels = [];
            this.xzqFields = [];
            this.xzqList = [];
            this.selectedXzqItem = null;
            this.xzqPage = 1;
            this.xzqPageSize = 100;
            this.xzqTotal = 0;
            this.xzqHasMore = false;
            this.xzqListLoading = false;
            this.isXzqLoadingMore = false;
            this.searchDebounceTimer = null;

            // 上传 SHP 状态
            this.uploadMode = 'folder'; // 'folder' | 'files'
            this.detectedShpFile = null;
            this.detectedMatchedFiles = [];

            this.isInitialized = false;
        }

        init(mapInstance, options = {}) {
            if (!mapInstance) {
                console.error('[PgrbRouteManager] 初始化失败: 未提供 maplibre-gl Map 实例');
                return;
            }
            if (this.isInitialized) return;
            this.isInitialized = true;
            this.map = mapInstance;
            if (options.serverPort) {
                this.config.serverPort = String(options.serverPort);
            }

            try {
                this.selectedNetworkId = localStorage.getItem('pgrb_last_network_id') || '';
            } catch (e) { }

            this.registerArrowIcon();
            this.setupAppSourcesAndLayers();
            this.bindDOMEvents();
            this.bindMapEvents();
            this.updateMarkers(); // 初始如有预设坐标立即渲染 WebGL 图钉

            // 全异步拉取路网数据，不阻塞主线程
            this.fetchRoadNetworks(this.selectedNetworkId || null);

            console.log('[PgrbRouteManager] 模块初始化完成 (全异步双轨架构)');
        }

        registerArrowIcon() {
            if (!this.map || this.map.hasImage('route-arrow-icon')) return;
            const arrowSvg = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 5L26 16L6 27L11 16L6 5Z" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" stroke-linejoin="round"/>
            </svg>`;
            const img = new Image();
            const svgBlob = new Blob([arrowSvg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            img.onload = () => {
                try {
                    if (this.map && !this.map.hasImage('route-arrow-icon')) {
                        const canvas = document.createElement('canvas');
                        canvas.width = 32;
                        canvas.height = 32;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const imageData = ctx.getImageData(0, 0, 32, 32);
                        this.map.addImage('route-arrow-icon', imageData);
                    }
                } catch (e) { }
                URL.revokeObjectURL(url);
            };
            img.src = url;
        }

        setupAppSourcesAndLayers() {
            const map = this.map;
            if (!map) return;

            // 1. WMTS 背景道路切片源与图层 (优先委托给独立 WmtsRoadManager 维护)
            if (window.WmtsRoadManager) {
                window.WmtsRoadManager.ensureLayer();
            } else {
                if (!map.getSource('wmts-roads-source')) {
                    map.addSource('wmts-roads-source', {
                        type: 'raster',
                        tiles: [this.config.wmtsTileUrl],
                        tileSize: 256,
                        bounds: this.config.wmtsBounds
                    });
                }
                if (!map.getLayer('wmts-roads-layer')) {
                    const chkRoads = document.getElementById('chkShowRoads');
                    const isShowRoads = chkRoads ? chkRoads.checked : false;
                    map.addLayer({
                        id: 'wmts-roads-layer',
                        type: 'raster',
                        source: 'wmts-roads-source',
                        minzoom: 1,
                        maxzoom: 18,
                        paint: { 'raster-opacity': 0.85 },
                        layout: { visibility: isShowRoads ? 'visible' : 'none' }
                    });
                }
            }

            // 2. 行政边界虚线框
            if (!map.getSource('xzq-boundary-source')) {
                map.addSource('xzq-boundary-source', {
                    type: 'geojson',
                    data: this.currentBoundaryGeojson || { type: 'FeatureCollection', features: [] }
                });
            }
            if (!map.getLayer('xzq-boundary-outline')) {
                map.addLayer({
                    id: 'xzq-boundary-outline',
                    type: 'line',
                    source: 'xzq-boundary-source',
                    paint: {
                        'line-color': '#000000',
                        'line-width': 3,
                        'line-dasharray': [5, 2],
                        'line-opacity': 1.0
                    }
                });
            }

            // 3. 1:1 单路线图层
            if (!map.getSource('route-single-source')) {
                map.addSource('route-single-source', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            }
            if (!map.getLayer('route-single-casing')) {
                map.addLayer({
                    id: 'route-single-casing',
                    type: 'line',
                    source: 'route-single-source',
                    paint: { 'line-color': '#07162c', 'line-width': 12, 'line-opacity': 0.85 },
                    layout: { 'line-cap': 'round', 'line-join': 'round' }
                });
            }
            if (!map.getLayer('route-single-glow')) {
                map.addLayer({
                    id: 'route-single-glow',
                    type: 'line',
                    source: 'route-single-source',
                    paint: { 'line-color': '#0284c7', 'line-width': 16, 'line-opacity': 0.35 },
                    layout: { 'line-cap': 'round', 'line-join': 'round' }
                });
            }
            if (!map.getLayer('route-single-core')) {
                map.addLayer({
                    id: 'route-single-core',
                    type: 'line',
                    source: 'route-single-source',
                    paint: { 'line-color': '#38bdf8', 'line-width': 8, 'line-opacity': 1.0 },
                    layout: { 'line-cap': 'round', 'line-join': 'round' }
                });
            }
            if (!map.getLayer('route-single-arrows')) {
                map.addLayer({
                    id: 'route-single-arrows',
                    type: 'symbol',
                    source: 'route-single-source',
                    layout: {
                        'symbol-placement': 'line',
                        'symbol-spacing': 80,
                        'icon-image': 'route-arrow-icon',
                        'icon-size': 0.85,
                        'icon-rotation-alignment': 'map',
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true
                    }
                });
            }

            // 4. 吸附虚线图层 (采用 WebGL CustomLayer vs5/fs5 滚动发光虚线)
            if (window.RollingDashLineLayer) {
                if (!this.rollingDashLayer) {
                    this.rollingDashLayer = new window.RollingDashLineLayer({
                        id: 'route-rolling-dash-layer',
                        vs: window.vs5,
                        fs: window.fs5,
                        width: 5.0,
                        dashLength: 22.0,
                        dashRatio: 0.6,
                        speed: 40.0
                    });
                }
                if (!map.getLayer('route-rolling-dash-layer')) {
                    map.addLayer(this.rollingDashLayer);
                }
            }

            // 5. 1:N / N:1 多路线图层
            if (!map.getSource('route-multi-source')) {
                map.addSource('route-multi-source', {
                    type: 'geojson',
                    data: this.currentMultiGeojson
                });
            }
            if (!map.getLayer('route-multi-glow')) {
                map.addLayer({
                    id: 'route-multi-glow',
                    type: 'line',
                    source: 'route-multi-source',
                    paint: {
                        'line-color': ['get', 'color'],
                        'line-width': ['case', ['boolean', ['get', 'selected'], false], 16, 12],
                        'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.7, 0.3]
                    },
                    layout: { 'line-cap': 'round', 'line-join': 'round' }
                });
            }
            if (!map.getLayer('route-multi-core')) {
                map.addLayer({
                    id: 'route-multi-core',
                    type: 'line',
                    source: 'route-multi-source',
                    paint: {
                        'line-color': ['get', 'color'],
                        'line-width': ['case', ['boolean', ['get', 'selected'], false], 7, 5],
                        'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 1.0, 0.7]
                    },
                    layout: { 'line-cap': 'round', 'line-join': 'round' }
                });
            }
            if (!map.getLayer('route-multi-arrows')) {
                map.addLayer({
                    id: 'route-multi-arrows',
                    type: 'symbol',
                    source: 'route-multi-source',
                    layout: {
                        'symbol-placement': 'line',
                        'symbol-spacing': 90,
                        'icon-image': 'route-arrow-icon',
                        'icon-size': 0.75,
                        'icon-rotation-alignment': 'map',
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true
                    }
                });
            }

            // 6. 导航当前段发光动画路径与节点 WebGL CustomLayer 图层 (纯 WebGL Shader 硬件加速)
            if (window.NavSegmentLineLayer) {
                if (!this.navSegmentLineLayer) {
                    this.navSegmentLineLayer = new window.NavSegmentLineLayer({
                        id: 'nav-segment-line-shader-layer',
                        lineWidth: 14.0,
                        speed: 52.0,
                        baseColor: [0.96, 0.62, 0.04, 0.95],
                        pulseColor: [1.0, 0.98, 0.75, 1.0]
                    });
                }
                if (!map.getLayer('nav-segment-line-shader-layer')) {
                    map.addLayer(this.navSegmentLineLayer);
                }
            }

            if (window.NavNodeBeaconLayer) {
                if (!this.navNodeBeaconLayer) {
                    this.navNodeBeaconLayer = new window.NavNodeBeaconLayer({
                        id: 'nav-node-beacon-shader-layer',
                        size: 64.0,
                        color: [0.98, 0.75, 0.14, 1.0]
                    });
                }
                if (!map.getLayer('nav-node-beacon-shader-layer')) {
                    map.addLayer(this.navNodeBeaconLayer);
                }
            }

            if (!map.getSource('nav-segment-source')) {
                map.addSource('nav-segment-source', {
                    type: 'geojson',
                    data: this.currentNavSegmentGeojson
                });
            }

            // 7. A* 演进动画图层
            if (!map.getSource('anim-edges-source')) {
                map.addSource('anim-edges-source', {
                    type: 'geojson',
                    data: this.currentAnimEdgesGeojson
                });
            }
            if (!map.getLayer('anim-edges-layer')) {
                map.addLayer({
                    id: 'anim-edges-layer',
                    type: 'line',
                    source: 'anim-edges-source',
                    paint: {
                        'line-color': ['coalesce', ['get', 'color'], '#d97706'],
                        'line-width': ['coalesce', ['get', 'weight'], 3],
                        'line-opacity': ['coalesce', ['get', 'opacity'], 0.8]
                    },
                    layout: { 'line-cap': 'round', 'line-join': 'round' }
                });
            }
            if (!map.getSource('anim-nodes-source')) {
                map.addSource('anim-nodes-source', {
                    type: 'geojson',
                    data: this.currentAnimNodesGeojson
                });
            }
            if (!map.getLayer('anim-nodes-layer')) {
                map.addLayer({
                    id: 'anim-nodes-layer',
                    type: 'circle',
                    source: 'anim-nodes-source',
                    paint: {
                        'circle-color': ['coalesce', ['get', 'color'], '#3b82f6'],
                        'circle-radius': ['coalesce', ['get', 'radius'], 5],
                        'circle-stroke-color': ['coalesce', ['get', 'strokeColor'], '#1e3a8a'],
                        'circle-stroke-width': ['coalesce', ['get', 'strokeWidth'], 2],
                        'circle-opacity': 1.0
                    }
                });
            }
            if (!map.getSource('anim-optimal-source')) {
                map.addSource('anim-optimal-source', {
                    type: 'geojson',
                    data: this.currentAnimOptimalGeojson
                });
            }
            if (!map.getLayer('anim-optimal-core')) {
                map.addLayer({
                    id: 'anim-optimal-core',
                    type: 'line',
                    source: 'anim-optimal-source',
                    paint: { 'line-color': '#38bdf8', 'line-width': 4.5, 'line-opacity': 1.0 },
                    layout: { 'line-cap': 'round', 'line-join': 'round' }
                });
            }

            // 7. 起终点与途径点 WebGL 原生图层 (GeoJSON Source + Circle/Symbol Layer)
            if (!map.getSource('route-pins-source')) {
                map.addSource('route-pins-source', {
                    type: 'geojson',
                    data: this.currentPinsGeojson
                });
            }
            // (1) 外层呼吸发光晕圈 (Circle Blur)
            if (!map.getLayer('route-pins-glow')) {
                map.addLayer({
                    id: 'route-pins-glow',
                    type: 'circle',
                    source: 'route-pins-source',
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 8, 14, 13, 18, 16],
                        'circle-color': ['coalesce', ['get', 'color'], '#ef4444'],
                        'circle-blur': 0.75,
                        'circle-opacity': 0.75
                    }
                });
            }
            // (2) 白色立体描边外环 (Circle Halo)
            if (!map.getLayer('route-pins-halo')) {
                map.addLayer({
                    id: 'route-pins-halo',
                    type: 'circle',
                    source: 'route-pins-source',
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 6.5, 14, 9, 18, 11],
                        'circle-color': '#ffffff',
                        'circle-opacity': 1.0
                    }
                });
            }
            // (3) 彩色内芯 (Circle Core)
            if (!map.getLayer('route-pins-core')) {
                map.addLayer({
                    id: 'route-pins-core',
                    type: 'circle',
                    source: 'route-pins-source',
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 14, 7, 18, 9],
                        'circle-color': ['coalesce', ['get', 'color'], '#ef4444'],
                        'circle-opacity': 1.0
                    }
                });
            }
            // (4) 起终点中心白点 (Circle Dot)
            if (!map.getLayer('route-pins-dot')) {
                map.addLayer({
                    id: 'route-pins-dot',
                    type: 'circle',
                    source: 'route-pins-source',
                    filter: ['in', ['get', 'type'], ['literal', ['start', 'end']]],
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.8, 14, 2.5, 18, 3.2],
                        'circle-color': '#ffffff',
                        'circle-opacity': 1.0
                    }
                });
            }
            // (5) 途径点文本标签 (Symbol Layer: D1, S1 等)
            if (!map.getLayer('route-pins-label')) {
                map.addLayer({
                    id: 'route-pins-label',
                    type: 'symbol',
                    source: 'route-pins-source',
                    filter: ['!', ['in', ['get', 'type'], ['literal', ['start', 'end']]]],
                    layout: {
                        'text-field': ['get', 'label'],
                        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9, 14, 10, 18, 11],
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold', 'sans-serif'],
                        'text-allow-overlap': true,
                        'text-ignore-placement': true
                    },
                    paint: {
                        'text-color': '#ffffff'
                    }
                });
            }

            this.bindRouteInteractions();
            this.updateRouteVisibility();
        }

        restoreActiveVisuals() {
            const map = this.map;
            if (!map) return;

            // 1. 确保 WMTS 道路图层显隐与当前复选框保持一致
            const chkRoads = document.getElementById('chkShowRoads');
            const isShowRoads = chkRoads ? chkRoads.checked : true;
            if (map.getLayer('wmts-roads-layer')) {
                map.setLayoutProperty('wmts-roads-layer', 'visibility', isShowRoads ? 'visible' : 'none');
            }

            // 2. 恢复行政边界数据
            if (this.currentBoundaryGeojson) {
                this.setXzqBoundaryData(this.currentBoundaryGeojson);
            }

            // 3. 恢复单路径数据
            if (this.currentRouteData && this.currentRouteData.geometry && map.getSource('route-single-source')) {
                map.getSource('route-single-source').setData(this.currentRouteData.geometry);
            }

            // 4. 恢复虚线数据
            if (this.currentDashGeojson && map.getSource('route-dash-source')) {
                map.getSource('route-dash-source').setData(this.currentDashGeojson);
            }

            // 5. 恢复多路线数据
            if (this.currentMultiGeojson && map.getSource('route-multi-source')) {
                map.getSource('route-multi-source').setData(this.currentMultiGeojson);
            }

            // 6. 恢复导航高亮路段
            if (this.currentNavSegmentGeojson && map.getSource('nav-segment-source')) {
                map.getSource('nav-segment-source').setData(this.currentNavSegmentGeojson);
            }

            // 7. 恢复起终点与多点图钉 WebGL 数据
            this.updateMarkers();

            // 8. 恢复路线可见性
            this.updateRouteVisibility();

            // 9. 同步官方矢量底图复选框状态 (使用与 0920 一致的 customLayers 白名单保护业务图层)
            const chkBase = document.getElementById('chkShowBaseMap');
            if (chkBase && !chkBase.checked) {
                const customLayers = new Set([
                    'wmts-roads-layer',
                    'xzq-boundary-fill', 'xzq-boundary-outline',
                    'route-single-casing', 'route-single-glow', 'route-single-core', 'route-single-arrows',
                    'route-dash-casing', 'route-dash-layer',
                    'route-multi-casing', 'route-multi-glow', 'route-multi-core', 'route-multi-arrows',
                    'nav-segment-halo', 'nav-segment-casing', 'nav-segment-core', 'nav-segment-pulse',
                    'nav-segment-line-shader-layer', 'nav-node-beacon-shader-layer',
                    'anim-edges-layer', 'anim-nodes-layer',
                    'anim-optimal-glow', 'anim-optimal-core', 'anim-optimal-dash',
                    'route-pins-glow', 'route-pins-halo', 'route-pins-core', 'route-pins-dot', 'route-pins-label'
                ]);
                const style = map.getStyle();
                if (style && Array.isArray(style.layers)) {
                    style.layers.forEach(layer => {
                        if (!customLayers.has(layer.id) && layer.type !== 'background') {
                            map.setLayoutProperty(layer.id, 'visibility', 'none');
                        }
                    });
                }
            }
        }

        bindRouteInteractions() {
            const map = this.map;
            if (!map) return;

            map.off('click', 'route-single-core', this.onSingleRouteClick.bind(this));
            map.on('click', 'route-single-core', this.onSingleRouteClick.bind(this));

            map.off('click', 'route-multi-core', this.onMultiRouteClick.bind(this));
            map.on('click', 'route-multi-core', this.onMultiRouteClick.bind(this));

            map.on('mouseenter', 'route-single-core', () => {
                if (!this.pickingMode && !this.isContinuousPicking) map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'route-single-core', () => {
                if (!this.pickingMode && !this.isContinuousPicking) map.getCanvas().style.cursor = '';
            });
        }

        onSingleRouteClick(e) {
            if (e && e.originalEvent) e.originalEvent.stopPropagation();
            const now = Date.now();
            if (now - this.lastNavClickTime < 350) return;
            this.lastNavClickTime = now;
            if (this.currentRouteData) {
                this.triggerNavigationGuide(this.currentRouteData);
            }
        }

        onMultiRouteClick(e) {
            if (e && e.originalEvent) e.originalEvent.stopPropagation();
            const now = Date.now();
            if (now - this.lastNavClickTime < 350) return;
            this.lastNavClickTime = now;

            const f = e.features && e.features[0];
            if (f && f.properties && f.properties.routeIdx !== undefined) {
                const idx = parseInt(f.properties.routeIdx, 10);
                this.focusRoute(idx);
                if (!$('#navDrawerPanel').hasClass('open')) {
                    this.triggerNavigationGuide(this.currentRouteData);
                }
            }
        }

        updateRouteVisibility() {
            const $chk = $('#chkShowRoute');
            const isVisible = $chk.length ? $chk.is(':checked') : true;
            const visibility = isVisible ? 'visible' : 'none';
            const routeLayers = [
                'route-single-casing', 'route-single-glow', 'route-single-core', 'route-single-arrows',
                'route-rolling-dash-layer',
                'route-multi-glow', 'route-multi-core', 'route-multi-arrows'
            ];
            routeLayers.forEach(id => {
                if (this.map && this.map.getLayer(id)) {
                    this.map.setLayoutProperty(id, 'visibility', visibility);
                }
            });
            if (this.navSegmentLineLayer) {
                this.navSegmentLineLayer.visible = isVisible;
                if (this.map) this.map.triggerRepaint();
            }
            if (this.navNodeBeaconLayer) {
                this.navNodeBeaconLayer.visible = isVisible;
                if (this.map) this.map.triggerRepaint();
            }
        }

        bindDOMEvents() {
            const self = this;

            // 缩放层级与底图视口更新
            this.map.on('zoom', () => this.updateZoomDisplay());
            this.map.on('move', () => this.updateZoomDisplay());
            this.updateZoomDisplay();

            // 规划模式切换
            $('#paradigm1to1').on('click', () => this.switchParadigm('1_to_1'));
            $('#paradigm1toN').on('click', () => this.switchParadigm('1_to_n'));
            $('#paradigmNto1').on('click', () => this.switchParadigm('n_to_1'));

            // 地图选点切换
            $('#btnPickStart').on('click', () => this.togglePickMode('start'));
            $('#btnPickEnd').on('click', () => this.togglePickMode('end'));

            // 点击起终点整行区域快捷选点
            $('#groupSingleStart').off('click.rowPick').on('click.rowPick', (e) => {
                if (!$(e.target).closest('#btnPickStart').length) {
                    this.togglePickMode('start');
                }
            });
            $('#groupSingleEnd').off('click.rowPick').on('click.rowPick', (e) => {
                if (!$(e.target).closest('#btnPickEnd').length) {
                    this.togglePickMode('end');
                }
            });

            // 弹出式经纬度坐标输入模态框控制
            $('#btnOpenCoordModal').off('click.coordModal').on('click.coordModal', () => {
                $('#coordInputModal').fadeIn(150);
            });
            $('#btnCloseCoordModal').off('click.coordModal').on('click.coordModal', () => {
                $('#coordInputModal').fadeOut(150);
            });
            $('#btnConfirmCoordModal').off('click.coordModal').on('click.coordModal', () => {
                this.updateMarkers();
                $('#coordInputModal').fadeOut(150);
            });
            $('#btnClearCoordInputs').off('click.coordModal').on('click.coordModal', () => {
                $('#startLng, #startLat, #endLng, #endLat').val('');
                this.updateMarkers();
            });

            // 手工输入坐标实时更新图钉与引线
            $('#startLng, #startLat, #endLng, #endLat').on('input change', () => this.updateMarkers());

            // 连续选点
            $('#btnContinuousPickDests').on('click', () => this.toggleContinuousPicking('dests'));
            $('#btnContinuousPickOrigins').on('click', () => this.toggleContinuousPicking('origins'));
            $('#btnClearDests').on('click', () => this.clearDestPoints());
            $('#btnClearOrigins').on('click', () => this.clearOrigPoints());

            // 路网级别切换
            $('.level-radio-item').on('click', function () {
                const lvl = $(this).find('input').val();
                self.setLevelFilter(lvl);
            });

            // 下拉选择路网
            $('#selRoadNetwork').on('change', function () {
                self.selectedNetworkId = this.value;
                try { localStorage.setItem('pgrb_last_network_id', self.selectedNetworkId); } catch (e) { }
                self.resetRoute();
                self.loadRoadNetworkRange(self.selectedNetworkId);
            });

            // 规划与重置
            $('#btnPlanRoute').on('click', () => this.planRoute());
            $('#btnResetRoute').on('click', () => this.resetRoute());

            // 动画分析与控制
            $('#btnAnimateRoute').on('click', () => this.startRouteAnimation());
            $('#btnCloseAnimBar, #btnAnimStop').on('click', () => this.stopAndClearAnimation());
            $('#btnAnimPlayPause').on('click', () => this.toggleAnimPlayPause());
            $('#btnAnimFirst').on('click', () => this.renderUpToStep(1));
            $('#btnAnimPrev').on('click', () => this.stepAnim(-1));
            $('#btnAnimNext').on('click', () => this.stepAnim(1));
            $('#btnAnimLast').on('click', () => this.jumpAnimLast());
            $('#btnAnimReplay').on('click', () => {
                this.renderUpToStep(1);
                this.playAnim();
            });
            $('#animSpeedRange').on('input', function () {
                self.animSpeed = parseInt(this.value, 10);
                $('#animSpeedVal').text(`${self.animSpeed}ms`);
                if (self.isAnimPlaying) {
                    self.pauseAnim();
                    self.playAnim();
                }
            });

            // 路线专属显隐控制
            $('#chkShowRoute').off('change.pgrbRoute').on('change.pgrbRoute', () => this.updateRouteVisibility());

            // 若尚未独立初始化 WmtsRoadManager，则兜底绑定 WMTS、图层面板与底图切换
            if (!window.WmtsRoadManager || !window.WmtsRoadManager.isInitialized) {
                $('#chkShowRoads').off('change.wmts').on('change.wmts', function () {
                    if (self.map && self.map.getLayer('wmts-roads-layer')) {
                        self.map.setLayoutProperty('wmts-roads-layer', 'visibility', this.checked ? 'visible' : 'none');
                    }
                });

                // 图层控制面板交互 (展开/折叠/点击外部关闭)
                $('#btnToggleLayerControl').off('click.wmts').on('click.wmts', function (e) {
                    e.stopPropagation();
                    const $panel = $('#layerControlPanel');
                    const isShown = $panel.is(':visible');
                    if (isShown) {
                        $panel.hide();
                        $(this).removeClass('active');
                    } else {
                        $panel.show();
                        $(this).addClass('active');
                    }
                });

                $('#btnCloseLayerPanel').off('click.wmts').on('click.wmts', function (e) {
                    e.stopPropagation();
                    $('#layerControlPanel').hide();
                    $('#btnToggleLayerControl').removeClass('active');
                });

                $(document).off('click.wmtsLayerControl').on('click.wmtsLayerControl', function (e) {
                    if (!$(e.target).closest('#layerControlContainer').length) {
                        $('#layerControlPanel').hide();
                        $('#btnToggleLayerControl').removeClass('active');
                    }
                });

                // 矢量底图与路网瓦片切换 (严格对照 0920 白名单与 background 保护逻辑)
                $('#chkShowBaseMap').off('change.wmtsBase').on('change.wmtsBase', function () {
                    const visible = this.checked;
                    const customLayers = new Set([
                        'wmts-roads-layer',
                        'xzq-boundary-fill', 'xzq-boundary-outline',
                        'route-single-casing', 'route-single-glow', 'route-single-core', 'route-single-arrows',
                        'route-dash-casing', 'route-dash-layer',
                        'route-multi-casing', 'route-multi-glow', 'route-multi-core', 'route-multi-arrows',
                        'nav-segment-halo', 'nav-segment-casing', 'nav-segment-core', 'nav-segment-pulse',
                        'nav-segment-line-shader-layer', 'nav-node-beacon-shader-layer',
                        'anim-edges-layer', 'anim-nodes-layer',
                        'anim-optimal-glow', 'anim-optimal-core', 'anim-optimal-dash',
                        'route-pins-glow', 'route-pins-halo', 'route-pins-core', 'route-pins-dot', 'route-pins-label'
                    ]);
                    const style = self.map ? self.map.getStyle() : null;
                    if (style && Array.isArray(style.layers)) {
                        style.layers.forEach(l => {
                            if (!customLayers.has(l.id) && l.type !== 'background') {
                                self.map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
                            }
                        });
                    }
                });

                // 矢量底图主题方案切换 (暗黑 / 标准 / 常规 / 素色) - 严格参考 0920 标准实现
                document.querySelectorAll('.pbf-style-btn').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const theme = this.getAttribute('data-theme');
                        if (!theme || self.currentPbfTheme === theme || !window.SMGI_STYLES || !window.SMGI_STYLES[theme]) return;
                        self.currentPbfTheme = theme;
                        document.querySelectorAll('.pbf-style-btn').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');

                        if (self.map) {
                            self.map.setStyle(window.SMGI_STYLES[theme].style);
                            self.map.once('styledata', () => {
                                if (typeof window.addAllDecodedImagesToMap === 'function') {
                                    window.addAllDecodedImagesToMap(self.map);
                                }
                                if (self.map.getLayer('背景')) {
                                    self.map.setPaintProperty('背景', 'background-color', '#0b1120');
                                    self.map.setPaintProperty('背景', 'background-opacity', 1);
                                }
                                const styleLayers = (self.map.getStyle() && self.map.getStyle().layers) || [];
                                styleLayers.forEach(lyr => {
                                    if (lyr.type === 'background') {
                                        self.map.setPaintProperty(lyr.id, 'background-color', '#0b1120');
                                        self.map.setPaintProperty(lyr.id, 'background-opacity', 1);
                                    }
                                });
                                self.registerArrowIcon();
                                self.setupAppSourcesAndLayers();
                                self.restoreActiveVisuals();
                            });
                        }
                    });
                });
            }

            // 路径规划面板展开/折叠 (点击左下角路径图标或面板右上角收起按钮)
            $('#btnToggleRoutePanel').on('click', function (e) {
                e.stopPropagation();
                const $panel = $('#routePanel');
                if ($panel.is(':visible')) {
                    $panel.fadeOut(200);
                    $(this).removeClass('active');
                } else {
                    $panel.fadeIn(200);
                    $(this).addClass('active');
                }
            });

            $('#btnCloseRoutePanel').on('click', function (e) {
                e.stopPropagation();
                $('#routePanel').fadeOut(200);
                $('#btnToggleRoutePanel').removeClass('active');
            });

            // 导航抽屉事件
            $('#btnOpenNavDrawer').on('click', () => {
                if (this.currentRouteData) {
                    this.triggerNavigationGuide(this.currentRouteData);
                }
            });
            $('#btnCloseNavDrawer, #btnNavClose').on('click', () => this.closeNavDrawer());
            $('#btnNavFitRoute').on('click', () => {
                if (this.currentRouteData && this.currentRouteData.coordinates) {
                    this.fitBoundsFromCoords(this.currentRouteData.coordinates, 60);
                }
            });
            $('#btnNavPrevStep').on('click', () => {
                if (this.currentNavStepIdx > 0) this.goToNavStep(this.currentNavStepIdx - 1, true);
            });
            $('#btnNavNextStep').on('click', () => {
                if (this.currentNavGuideCache && this.currentNavStepIdx < this.currentNavGuideCache.steps.length - 1) {
                    this.goToNavStep(this.currentNavStepIdx + 1, true);
                }
            });
            $('#btnNavCurrStep').on('click', () => this.goToNavStep(this.currentNavStepIdx, true));

            // 键盘快捷键监听 (左右方向键切换导航步骤)
            $(document).off('keydown.navSteps').on('keydown.navSteps', (e) => {
                if (!$('#navDrawerPanel').hasClass('open')) return;
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    if (this.currentNavStepIdx > 0) {
                        e.preventDefault();
                        this.goToNavStep(this.currentNavStepIdx - 1, true);
                    }
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    if (this.currentNavGuideCache && this.currentNavGuideCache.steps && this.currentNavStepIdx < this.currentNavGuideCache.steps.length - 1) {
                        e.preventDefault();
                        this.goToNavStep(this.currentNavStepIdx + 1, true);
                    }
                }
            });

            // 管理与新建路网弹窗绑定
            this.bindManageModalEvents();
            this.bindXzqModalEvents();
            this.bindUploadModalEvents();
        }

        bindMapEvents() {
            const map = this.map;
            map.on('click', (e) => {
                const lng = Number(e.lngLat.lng.toFixed(6));
                const lat = Number(e.lngLat.lat.toFixed(6));

                if (this.pickingMode) {
                    if (this.pickingMode === 'start') {
                        $('#startLng').val(lng);
                        $('#startLat').val(lat);
                    } else if (this.pickingMode === 'end') {
                        $('#endLng').val(lng);
                        $('#endLat').val(lat);
                    }
                    this.updateMarkers();
                    this.resetPickingMode();
                    return;
                }

                if (this.isContinuousPicking === 'dests') {
                    this.addDestPoint(lng, lat);
                    return;
                }
                if (this.isContinuousPicking === 'origins') {
                    this.addOrigPoint(lng, lat);
                    return;
                }
            });

            // WebGL 模式图钉悬浮光标与拖拽交互 (逐个图层准确绑定)
            const pinInteractiveLayers = ['route-pins-core', 'route-pins-halo', 'route-pins-glow'];
            pinInteractiveLayers.forEach(layerId => {
                map.on('mouseenter', layerId, () => {
                    if (!this.pickingMode && !this.isContinuousPicking && !this.draggedPinId) {
                        map.getCanvas().style.cursor = 'grab';
                    }
                });

                map.on('mouseleave', layerId, () => {
                    if (!this.draggedPinId) {
                        map.getCanvas().style.cursor = '';
                    }
                });

                map.on('mousedown', layerId, (e) => {
                    if (this.pickingMode || this.isContinuousPicking) return;
                    const features = map.queryRenderedFeatures(e.point, { layers: ['route-pins-core', 'route-pins-halo'] });
                    if (!features || !features.length) return;
                    const f = features[0];
                    const pinId = f.properties && f.properties.id;
                    if (pinId === 'start' || pinId === 'end') {
                        this.draggedPinId = pinId;
                        map.dragPan.disable();
                        map.getCanvas().style.cursor = 'grabbing';
                        e.preventDefault();
                    }
                });
            });

            map.on('mousemove', (e) => {
                if (!this.draggedPinId) return;
                const lng = Number(e.lngLat.lng.toFixed(6));
                const lat = Number(e.lngLat.lat.toFixed(6));
                if (this.draggedPinId === 'start') {
                    $('#startLng').val(lng);
                    $('#startLat').val(lat);
                } else if (this.draggedPinId === 'end') {
                    $('#endLng').val(lng);
                    $('#endLat').val(lat);
                }
                this.updatePinsGeojson();
                this.updateDashlineEndpoints();
            });

            window.addEventListener('mouseup', () => {
                if (this.draggedPinId) {
                    this.draggedPinId = null;
                    map.dragPan.enable();
                    map.getCanvas().style.cursor = '';
                }
            });
        }

        updateZoomDisplay() {
            if (!this.map) return;
            const z = this.map.getZoom();
            $('#zoomValue').text(z.toFixed(2));
        }

        // ==========================================
        // 核心异步逻辑：拉取路网元数据与边界
        // ==========================================
        async fetchRoadNetworks(targetSelectId = null) {
            this.networksLoading = true;
            this.updateNetworkDropdown();

            try {
                let listData = [];
                try {
                    const pgrbRes = await fetch(`${this.config.pgrbApiBase}/list?level=all`).then(r => r.json());
                    if (pgrbRes.code === 200 && Array.isArray(pgrbRes.data) && pgrbRes.data.length > 0) {
                        listData = pgrbRes.data.map(p => ({
                            id: p.networkId,
                            networkId: p.networkId,
                            name: p.networkName,
                            networkName: p.networkName,
                            level: p.level,
                            fileName: p.fileName,
                            fileSize: p.fileSize,
                            fileSizeFmt: p.fileSizeFmt,
                            nodeCount: p.nodeCount,
                            edgeCount: p.edgeCount,
                            pointCount: p.pointCount,
                            centerLng: p.centerLng,
                            centerLat: p.centerLat,
                            defaultZoom: p.defaultZoom || 15,
                            buildTime: p.buildTime
                        }));
                    }
                } catch (e) {
                    console.warn('[PgrbRouteManager] 获取服务端 PGRB 列表失败，回退历史接口:', e);
                }

                if (listData.length === 0) {
                    const res = await fetch(`${this.config.routeDataManageApiBase}/networks?mode=3d`).then(r => r.json());
                    if (res.code === 200 && Array.isArray(res.data)) {
                        listData = res.data;
                    }
                }

                this.networksList = await this.enrichNetworksWithFullName(listData);
                this.editableNetworks = JSON.parse(JSON.stringify(this.networksList));
                this.networksLoading = false;
                this.updateNetworkDropdown(targetSelectId, true);
            } catch (err) {
                console.error('[PgrbRouteManager] 加载路网列表异常:', err);
                this.networksLoading = false;
                this.updateNetworkDropdown();
            }
        }

        async enrichNetworksWithFullName(rawList) {
            if (!Array.isArray(rawList)) return [];
            return rawList.map(net => {
                if (net.id === 'shjd_road' && (!net.name || !net.name.includes('市'))) {
                    return { ...net, name: '成都市成华区沙河街道' };
                }
                return { ...net };
            });
        }

        getNetworkLevel(net) {
            if (!net) return 'county';
            if (net.level) return net.level;
            const id = (net.id || '').toLowerCase();
            if (id.startsWith('xzq_city_')) return 'city';
            if (id.startsWith('xzq_county_')) return 'county';
            if (id.startsWith('xzq_town_')) return 'town';
            if (id.startsWith('xzq_village_')) return 'village';
            if (id.startsWith('shp_') || id.includes('shp')) return 'shp';
            return 'county';
        }

        getFilteredNetworks() {
            if (!Array.isArray(this.networksList)) return [];
            return this.networksList.filter(net => this.getNetworkLevel(net) === this.selectedLevelFilter);
        }

        updateNetworkDropdown(targetSelectId = null, triggerLoad = true) {
            const $select = $('#selRoadNetwork');
            $select.empty();
            const filtered = this.getFilteredNetworks();

            if (this.networksLoading) {
                $select.append('<option value="">加载路网配置中...</option>');
                return;
            }

            if (filtered.length === 0) {
                const emptyTip = this.selectedLevelFilter === 'shp'
                    ? '当前暂无自定义 SHP 路网配置，请在“路网管理”中上传添加'
                    : '当前级别暂无立体路网配置';
                $select.append(`<option value="">${emptyTip}</option>`);
                this.selectedNetworkId = '';
                if (triggerLoad) this.loadRoadNetworkRange(null);
                return;
            }

            filtered.forEach(net => {
                $select.append(`<option value="${net.id}">${net.name}</option>`);
            });

            if (targetSelectId && filtered.some(n => n.id === targetSelectId)) {
                this.selectedNetworkId = targetSelectId;
            } else if (this.selectedNetworkId && filtered.some(n => n.id === this.selectedNetworkId)) {
                // keep current
            } else {
                this.selectedNetworkId = filtered[0].id;
            }

            $select.val(this.selectedNetworkId);
            if (triggerLoad) {
                try { localStorage.setItem('pgrb_last_network_id', this.selectedNetworkId); } catch (e) { }
                this.loadRoadNetworkRange(this.selectedNetworkId);
            }
        }

        setLevelFilter(lvl) {
            this.selectedLevelFilter = lvl;
            $('.level-radio-item').each(function () {
                const val = $(this).find('input').val();
                if (val === lvl) {
                    $(this).addClass('active').find('input').prop('checked', true);
                } else {
                    $(this).removeClass('active');
                }
            });
            this.resetRoute();
            this.updateNetworkDropdown();
        }

        async loadRoadNetworkRange(networkId) {
            this.currentNetworkMeta = null;
            this.currentNetworkBoundary = null;
            this.resetRoute();
            this.clearXzqBoundaryData();
            if (!networkId) return;

            try {
                const targetNet = Array.isArray(this.networksList) ? this.networksList.find(n => n.id === networkId) : null;
                const metaUrl = `${this.config.pgrbApiBase}/meta?networkId=${encodeURIComponent(networkId)}`;
                const boundaryUrl = `${this.config.pgrbApiBase}/boundary-binary?networkId=${encodeURIComponent(networkId)}`;

                const [metaResp, boundaryResp] = await Promise.all([
                    fetch(metaUrl),
                    fetch(boundaryUrl)
                ]);

                if (metaResp.ok) {
                    const res = await metaResp.json();
                    if (res.code === 200 && res.data) {
                        this.currentNetworkMeta = res.data;
                    }
                }

                if (boundaryResp.ok) {
                    const boundaryBuf = await boundaryResp.arrayBuffer();
                    const isBoundaryBinary = window.BoundaryRouteDecode && (
                        (BoundaryRouteDecode.isPGBB && BoundaryRouteDecode.isPGBB(boundaryBuf)) ||
                        (BoundaryRouteDecode.isPGRR && BoundaryRouteDecode.isPGRR(boundaryBuf))
                    );
                    if (boundaryBuf && boundaryBuf.byteLength >= 16 && isBoundaryBinary) {
                        this.currentNetworkBoundary = BoundaryRouteDecode.decodeBoundary(boundaryBuf);
                    }
                }

                if (this.currentNetworkMeta && this.currentNetworkMeta.bbox && this.map) {
                    const b = this.currentNetworkMeta.bbox;
                    this.map.fitBounds([[b.minLng, b.minLat], [b.maxLng, b.maxLat]], { padding: 50, duration: 800 });
                } else if (targetNet && targetNet.centerLat && targetNet.centerLng && this.map) {
                    this.map.flyTo({ center: [targetNet.centerLng, targetNet.centerLat], zoom: targetNet.defaultZoom || 15, duration: 800 });
                }

                const boundaryGeo = this.currentNetworkBoundary ? this.currentNetworkBoundary.geojson : (this.currentNetworkMeta && this.currentNetworkMeta.boundaryGeoJSON);
                if (this.map && boundaryGeo) {
                    this.setXzqBoundaryData(boundaryGeo);
                }
            } catch (err) {
                console.error('[PgrbRouteManager] 加载路网元数据或边界失败:', err);
            }
        }

        setXzqBoundaryData(geojson) {
            this.currentBoundaryGeojson = geojson;
            if (this.map && this.map.getSource('xzq-boundary-source')) {
                this.map.getSource('xzq-boundary-source').setData(geojson || { type: 'FeatureCollection', features: [] });
            }
        }

        clearXzqBoundaryData() {
            this.setXzqBoundaryData(null);
        }

        isPointInCurrentBoundary(lng, lat) {
            if (this.currentNetworkBoundary && typeof this.currentNetworkBoundary.contains === 'function') {
                return this.currentNetworkBoundary.contains(lng, lat);
            }
            if (this.currentNetworkMeta && this.currentNetworkMeta.bbox) {
                const b = this.currentNetworkMeta.bbox;
                return (lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat);
            }
            return true;
        }

        showBoundaryWarningPopup(pt, message) {
            const lng = Array.isArray(pt) ? (pt[0] > 50 ? pt[0] : pt[1]) : pt.lng;
            const lat = Array.isArray(pt) ? (pt[0] > 50 ? pt[1] : pt[0]) : pt.lat;
            if (lng == null || lat == null) return;

            if (this.currentWarningPopup) {
                this.currentWarningPopup.remove();
                this.currentWarningPopup = null;
            }

            this.currentWarningPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: true,
                className: 'boundary-warning-popup',
                offset: [0, -8]
            })
                .setLngLat([lng, lat])
                .setHTML(`<span>提示: ${message}</span>`)
                .addTo(this.map);
        }

        // ==========================================
        // 规划范式与选点
        // ==========================================
        switchParadigm(newParadigm) {
            if (this.currentParadigm === newParadigm) return;
            this.currentParadigm = newParadigm;
            this.resetPickingMode();
            this.stopContinuousPicking();

            $('.paradigm-item').removeClass('active');
            if (newParadigm === '1_to_1') {
                $('#paradigm1to1').addClass('active');
                $('#paradigmBadge').text('1 对 1').css({ background: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8' });
                $('#groupSingleStart, #groupSingleEnd').show();
                $('#groupMultiOrigins, #groupMultiDestinations').hide();
            } else if (newParadigm === '1_to_n') {
                $('#paradigm1toN').addClass('active');
                $('#paradigmBadge').text('1 对 N').css({ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' });
                $('#groupSingleStart, #groupMultiDestinations').show();
                $('#groupSingleEnd, #groupMultiOrigins').hide();
            } else if (newParadigm === 'n_to_1') {
                $('#paradigmNto1').addClass('active');
                $('#paradigmBadge').text('N 对 1').css({ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' });
                $('#groupMultiOrigins, #groupSingleEnd').show();
                $('#groupSingleStart, #groupMultiDestinations').hide();
            }

            this.resetRoute();
            $('#routeResultSection').slideUp(200);
        }

        togglePickMode(mode) {
            if (this.pickingMode === mode) {
                this.resetPickingMode();
            } else {
                this.pickingMode = mode;
                if (mode === 'start') {
                    $('#btnPickStart').addClass('active').text('正在选点...');
                    $('#btnPickEnd').removeClass('active').text('地图选点');
                } else if (mode === 'end') {
                    $('#btnPickEnd').addClass('active').text('正在选点...');
                    $('#btnPickStart').removeClass('active').text('地图选点');
                }
                $(this.map.getContainer()).addClass('picking-cursor');
            }
        }

        resetPickingMode() {
            this.pickingMode = null;
            $('#btnPickStart, #btnPickEnd').removeClass('active').text('地图选点');
            if (!this.isContinuousPicking) {
                $(this.map.getContainer()).removeClass('picking-cursor');
            }
        }

        toggleContinuousPicking(target) {
            if (this.isContinuousPicking === target) {
                this.stopContinuousPicking();
            } else {
                this.isContinuousPicking = target;
                this.resetPickingMode();
                $(this.map.getContainer()).addClass('picking-cursor');
                if (target === 'dests') {
                    $('#btnContinuousPickDests').addClass('active').find('span').text('正在连续选终点 (点击地图添加)');
                } else if (target === 'origins') {
                    $('#btnContinuousPickOrigins').addClass('active').find('span').text('正在连续选起点 (点击地图添加)');
                }
            }
        }

        stopContinuousPicking() {
            this.isContinuousPicking = false;
            $(this.map.getContainer()).removeClass('picking-cursor');
            $('#btnContinuousPickDests').removeClass('active').find('span').text('+ 在地图上连续选终点');
            $('#btnContinuousPickOrigins').removeClass('active').find('span').text('+ 在地图上连续选起点');
        }

        updatePinsGeojson() {
            const sLng = parseFloat($('#startLng').val());
            const sLat = parseFloat($('#startLat').val());
            const eLng = parseFloat($('#endLng').val());
            const eLat = parseFloat($('#endLat').val());

            // 实时同步轻量化面板起终点文本与状态
            const hasStart = !isNaN(sLng) && !isNaN(sLat);
            const hasEnd = !isNaN(eLng) && !isNaN(eLat);
            $('#textStartCoord').text(hasStart ? `${sLng.toFixed(5)}, ${sLat.toFixed(5)}` : '在地图上点击选起点');
            $('#textEndCoord').text(hasEnd ? `${eLng.toFixed(5)}, ${eLat.toFixed(5)}` : '在地图上点击选终点');
            $('#groupSingleStart').toggleClass('has-coord', hasStart);
            $('#groupSingleEnd').toggleClass('has-coord', hasEnd);

            const features = [];
            if (!isNaN(sLng) && !isNaN(sLat)) {
                features.push({
                    type: 'Feature',
                    properties: { id: 'start', type: 'start', color: '#10b981', label: '起' },
                    geometry: { type: 'Point', coordinates: [sLng, sLat] }
                });
            }
            if (!isNaN(eLng) && !isNaN(eLat)) {
                features.push({
                    type: 'Feature',
                    properties: { id: 'end', type: 'end', color: '#ef4444', label: '终' },
                    geometry: { type: 'Point', coordinates: [eLng, eLat] }
                });
            }
            this.multiDestPoints.forEach((pt, idx) => {
                features.push({
                    type: 'Feature',
                    properties: { id: `dest_${idx + 1}`, type: 'dest', color: pt.color, label: `D${idx + 1}` },
                    geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] }
                });
            });
            this.multiOrigPoints.forEach((pt, idx) => {
                features.push({
                    type: 'Feature',
                    properties: { id: `orig_${idx + 1}`, type: 'orig', color: pt.color, label: `S${idx + 1}` },
                    geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] }
                });
            });

            this.currentPinsGeojson = { type: 'FeatureCollection', features };
            if (this.map && this.map.getSource('route-pins-source')) {
                this.map.getSource('route-pins-source').setData(this.currentPinsGeojson);
            }
        }

        updateMarkers() {
            // 彻底销毁任何残留的 DOM Marker 元素
            if (this.startMarker) {
                this.startMarker.remove();
                this.startMarker = null;
            }
            if (this.endMarker) {
                this.endMarker.remove();
                this.endMarker = null;
            }
            // 全面使用 MapLibre GL 原生 WebGL 图层渲染 (route-pins-source)
            this.updatePinsGeojson();
            this.updateDashlineEndpoints();
        }

        updateDashlineEndpoints() {
            if (!this.currentRouteCoords || this.currentRouteCoords.length === 0) {
                if (this.rollingDashLayer) {
                    this.rollingDashLayer.clear();
                }
                return;
            }
            const firstCoord = this.currentRouteCoords[0];
            const lastCoord = this.currentRouteCoords[this.currentRouteCoords.length - 1];
            const startLngLat = this.startMarker ? this.startMarker.getLngLat() : null;
            const endLngLat = this.endMarker ? this.endMarker.getLngLat() : null;
            const sLng = startLngLat ? startLngLat.lng : parseFloat($('#startLng').val());
            const sLat = startLngLat ? startLngLat.lat : parseFloat($('#startLat').val());
            const eLng = endLngLat ? endLngLat.lng : parseFloat($('#endLng').val());
            const eLat = endLngLat ? endLngLat.lat : parseFloat($('#endLat').val());

            const rollingLines = [];

            if (!isNaN(sLng) && !isNaN(sLat)) {
                // 起点到路线入口（绿色光带从起点流向路线）
                rollingLines.push({
                    coords: [[sLng, sLat], [firstCoord[0], firstCoord[1]]],
                    color: '#10b981'
                });
            }
            if (!isNaN(eLng) && !isNaN(eLat)) {
                // 路线末尾到终点（红色光带从路线尾节点流向终点）
                rollingLines.push({
                    coords: [[lastCoord[0], lastCoord[1]], [eLng, eLat]],
                    color: '#ef4444'
                });
            }
            if (this.rollingDashLayer) {
                this.rollingDashLayer.setLines(rollingLines);
            }
        }

        addDestPoint(lng, lat) {
            const idx = this.multiDestPoints.length;
            const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
            this.multiDestPoints.push({ id: `dest_${idx + 1}`, lng, lat, color });
            this.updatePinsGeojson();
            this.renderDestsListDOM();
        }

        renderDestsListDOM() {
            $('#destPointsCount').text(this.multiDestPoints.length);
            const $list = $('#destPointsList');
            if (this.multiDestPoints.length === 0) {
                $list.html('<div style="color:#64748b;font-size:11px;text-align:center;padding:10px 0;">暂未添加终点</div>');
                return;
            }
            $list.html(this.multiDestPoints.map((pt, idx) => `
                <div class="multi-point-row">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="point-tag-badge" style="background:${pt.color};">D${idx + 1}</span>
                        <span class="point-coords-text">${pt.lng.toFixed(4)}, ${pt.lat.toFixed(4)}</span>
                    </div>
                    <button type="button" class="btn-del-point" data-del-dest="${idx}">&times;</button>
                </div>
            `).join(''));
            $list.find('[data-del-dest]').on('click', (e) => {
                const idx = parseInt($(e.currentTarget).data('del-dest'), 10);
                this.removeDestPoint(idx);
            });
        }

        removeDestPoint(idx) {
            this.multiDestPoints.splice(idx, 1);
            this.updatePinsGeojson();
            this.renderDestsListDOM();
        }

        clearDestPoints() {
            this.multiDestPoints = [];
            this.updatePinsGeojson();
            this.renderDestsListDOM();
        }

        addOrigPoint(lng, lat) {
            const idx = this.multiOrigPoints.length;
            const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
            this.multiOrigPoints.push({ id: `orig_${idx + 1}`, lng, lat, color });
            this.updatePinsGeojson();
            this.renderOrigsListDOM();
        }

        renderOrigsListDOM() {
            $('#origPointsCount').text(this.multiOrigPoints.length);
            const $list = $('#origPointsList');
            if (this.multiOrigPoints.length === 0) {
                $list.html('<div style="color:#64748b;font-size:11px;text-align:center;padding:10px 0;">暂未添加起点</div>');
                return;
            }
            $list.html(this.multiOrigPoints.map((pt, idx) => `
                <div class="multi-point-row">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="point-tag-badge" style="background:${pt.color};">S${idx + 1}</span>
                        <span class="point-coords-text">${pt.lng.toFixed(4)}, ${pt.lat.toFixed(4)}</span>
                    </div>
                    <button type="button" class="btn-del-point" data-del-orig="${idx}">&times;</button>
                </div>
            `).join(''));
            $list.find('[data-del-orig]').on('click', (e) => {
                const idx = parseInt($(e.currentTarget).data('del-orig'), 10);
                this.removeOrigPoint(idx);
            });
        }

        removeOrigPoint(idx) {
            this.multiOrigPoints.splice(idx, 1);
            this.updatePinsGeojson();
            this.renderOrigsListDOM();
        }

        clearOrigPoints() {
            this.multiOrigPoints = [];
            this.updatePinsGeojson();
            this.renderOrigsListDOM();
        }

        resetRoute() {
            this.resetPickingMode();
            this.stopContinuousPicking();
            $('#startLng, #startLat, #endLng, #endLat').val('');
            $('#textStartCoord').text('在地图上点击选起点');
            $('#textEndCoord').text('在地图上点击选终点');
            $('#groupSingleStart, #groupSingleEnd').removeClass('has-coord');
            $('#routeResultSection').slideUp(200);
            this.updateMarkers();
            this.clearDestPoints();
            this.clearOrigPoints();
            this.clearSingleRouteLayers();
            this.clearMultiRoutes();
            this.clearNavHighlight();
            this.closeNavDrawer();
            if (this.currentWarningPopup) {
                this.currentWarningPopup.remove();
                this.currentWarningPopup = null;
            }
            this.currentRouteData = null;
            $('#rowNavAction').hide();
            $('#resultCard').removeClass('show');
            $('#resStatus').text('已重置').css('color', '#38bdf8');
        }

        clearSingleRouteLayers() {
            if (this.map && this.map.getSource('route-single-source')) {
                this.map.getSource('route-single-source').setData({ type: 'FeatureCollection', features: [] });
            }
            if (this.rollingDashLayer) {
                this.rollingDashLayer.clear();
            }
        }

        clearMultiRoutes() {
            if (this.map && this.map.getSource('route-multi-source')) {
                this.map.getSource('route-multi-source').setData({ type: 'FeatureCollection', features: [] });
            }
            if (this.rollingDashLayer) {
                this.rollingDashLayer.clear();
            }
        }

        fitBoundsFromCoords(coords, padding = 60) {
            if (!this.map || !coords || coords.length === 0) return;
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            coords.forEach(pt => {
                if (!pt) return;
                const lng = pt[0] > 50 ? pt[0] : pt[1];
                const lat = pt[0] > 50 ? pt[1] : pt[0];
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            });
            if (minLng !== Infinity) {
                this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding, duration: 800, maxZoom: 17.5 });
            }
        }

        // ==========================================
        // 核心寻径逻辑 (1:1, 1:N, N:1)
        // ==========================================
        async planRoute() {
            if (!this.selectedNetworkId) {
                alert('请先选择有效路网！');
                return;
            }

            $('#routeResultSection').slideDown(200);
            $('#resultCard').addClass('show');
            $('#resStatus').text('计算中...').css('color', '#38bdf8');
            $('#btnPlanRoute').prop('disabled', true).text('计算中...');

            if (this.currentParadigm === '1_to_1') {
                const sLng = parseFloat($('#startLng').val());
                const sLat = parseFloat($('#startLat').val());
                const eLng = parseFloat($('#endLng').val());
                const eLat = parseFloat($('#endLat').val());

                if (isNaN(sLng) || isNaN(sLat) || isNaN(eLng) || isNaN(eLat)) {
                    alert('请先在地图选点或输入有效起点终点坐标！');
                    $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                    return;
                }

                if (!this.isPointInCurrentBoundary(sLng, sLat)) {
                    this.showBoundaryWarningPopup([sLng, sLat], '起点坐标超出路网边界');
                    $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                    return;
                }

                if (!this.isPointInCurrentBoundary(eLng, eLat)) {
                    this.showBoundaryWarningPopup([eLng, eLat], '终点坐标超出路网边界');
                    $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                    return;
                }

                const t0 = performance.now();
                try {
                    const resp = await fetch(`${this.config.pgrbApiBase}/plan-binary`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            networkId: this.selectedNetworkId,
                            startLng: sLng,
                            startLat: sLat,
                            endLng: eLng,
                            endLat: eLat,
                            directed: true
                        })
                    });

                    let planRes;
                    if (resp.ok) {
                        const arrayBuf = await resp.arrayBuffer();
                        if (window.BoundaryRouteDecode && BoundaryRouteDecode.isPGRP && BoundaryRouteDecode.isPGRP(arrayBuf)) {
                            const decodeFn = BoundaryRouteDecode.decodeRoutePath || BoundaryRouteDecode.decodeRoute;
                            planRes = decodeFn(arrayBuf);
                        } else {
                            planRes = JSON.parse(new TextDecoder().decode(arrayBuf));
                        }
                    } else {
                        try {
                            const errBuf = await resp.arrayBuffer();
                            if (window.BoundaryRouteDecode && BoundaryRouteDecode.isPGRP && BoundaryRouteDecode.isPGRP(errBuf)) {
                                const decodeFn = BoundaryRouteDecode.decodeRoutePath || BoundaryRouteDecode.decodeRoute;
                                planRes = decodeFn(errBuf);
                            } else {
                                planRes = JSON.parse(new TextDecoder().decode(errBuf));
                            }
                        } catch (e) {
                            planRes = { code: resp.status, message: `HTTP ${resp.status}` };
                        }
                    }

                    const t1 = performance.now();
                    const calcCostMs = (t1 - t0).toFixed(1);

                    if (planRes && (planRes.code === 200 || planRes.coordinates) && planRes.data) {
                        this.renderRouteResult(planRes, `${planRes.data.costTimeMs || calcCostMs} ms PGRP二进制算路`);
                    } else {
                        $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                        $('#resStatus').text((planRes && (planRes.msg || planRes.message)) || '规划失败').css('color', '#ef4444');
                    }
                } catch (e) {
                    $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                    $('#resStatus').text(`请求异常: ${e.message}`).css('color', '#ef4444');
                }
            } else {
                // 1:N 或 N:1 批处理
                const is1toN = (this.currentParadigm === '1_to_n');
                const centerLng = parseFloat(is1toN ? $('#startLng').val() : $('#endLng').val());
                const centerLat = parseFloat(is1toN ? $('#startLat').val() : $('#endLat').val());
                const targetPoints = is1toN ? this.multiDestPoints : this.multiOrigPoints;

                if (isNaN(centerLng) || isNaN(centerLat)) {
                    alert(`请先在地图选定中心${is1toN ? '起点' : '终点'}！`);
                    $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                    return;
                }

                if (targetPoints.length === 0) {
                    alert(`请至少添加一个目标${is1toN ? '终点' : '起点'}！`);
                    $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                    return;
                }

                const t0 = performance.now();
                try {
                    const planRes = await fetch(`${this.config.pgrbApiBase}/plan-batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            networkId: this.selectedNetworkId,
                            mode: is1toN ? '1_to_n' : 'n_to_1',
                            center: { lng: centerLng, lat: centerLat },
                            points: targetPoints.map((d, i) => ({ id: d.id, idx: i, lng: d.lng, lat: d.lat })),
                            directed: true
                        })
                    }).then(r => r.json());

                    const t1 = performance.now();
                    if (planRes && planRes.code === 200 && planRes.data && planRes.data.routes) {
                        this.renderMultiRoutesResult(planRes.data.routes, `${(t1 - t0).toFixed(1)} ms`, this.currentParadigm);
                    } else {
                        $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                        $('#resStatus').text((planRes && planRes.message) || '规划失败').css('color', '#ef4444');
                    }
                } catch (e) {
                    $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
                    $('#resStatus').text(`请求异常: ${e.message}`).css('color', '#ef4444');
                }
            }
        }

        renderRouteResult(res, costStr) {
            $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
            this.clearMultiRoutes();
            this.clearNavHighlight();
            this.closeNavDrawer();
            $('#rowDistance, #rowNodes').show();
            $('#multiRouteStats').hide();

            if (res && (res.code === 200 || res.coordinates) && this.map) {
                const resData = res.data || res;
                $('#resStatus').text(`规划成功 (${costStr})`).css('color', '#10b981');
                $('#resDistance').text(`${(resData.totalDistance / 1000).toFixed(2)} km`);
                $('#resNodes').text(`${resData.startNode || '-'} -> ${resData.endNode || '-'}`);

                this.clearSingleRouteLayers();

                // 健壮提取路径折线坐标数组 (兼容 geometry.coordinates, geometry.features, 或顶层 coordinates)
                let coords = [];
                if (resData.geometry && Array.isArray(resData.geometry.coordinates)) {
                    coords = resData.geometry.coordinates;
                } else if (Array.isArray(resData.coordinates)) {
                    coords = resData.coordinates;
                } else if (resData.geometry && Array.isArray(resData.geometry.features) && resData.geometry.features[0]) {
                    coords = resData.geometry.features[0].geometry.coordinates;
                } else if (resData.pathCoordinates) {
                    coords = resData.pathCoordinates;
                }
                this.currentRouteCoords = coords;

                // 构造 MapLibre GL 官方标准的 FeatureCollection
                const geojson = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: { totalDistance: resData.totalDistance },
                        geometry: {
                            type: 'LineString',
                            coordinates: coords
                        }
                    }]
                };

                this.currentRouteData = {
                    coordinates: coords,
                    totalDistance: resData.totalDistance,
                    geometry: geojson,
                    startNode: resData.startNode,
                    endNode: resData.endNode
                };

                if (this.map.getSource('route-single-source')) {
                    this.map.getSource('route-single-source').setData(geojson);
                }

                $('#rowNavAction').show();

                // 渲染起终点吸附引线并自动居中
                this.updateDashlineEndpoints();
                if (this.currentRouteCoords && this.currentRouteCoords.length > 0) {
                    const startLngLat = this.startMarker ? this.startMarker.getLngLat() : null;
                    const endLngLat = this.endMarker ? this.endMarker.getLngLat() : null;
                    const sLng = startLngLat ? startLngLat.lng : parseFloat($('#startLng').val());
                    const sLat = startLngLat ? startLngLat.lat : parseFloat($('#startLat').val());
                    const eLng = endLngLat ? endLngLat.lng : parseFloat($('#endLng').val());
                    const eLat = endLngLat ? endLngLat.lat : parseFloat($('#endLat').val());
                    const focusPts = [];
                    if (!isNaN(sLng) && !isNaN(sLat)) focusPts.push([sLng, sLat]);
                    if (!isNaN(eLng) && !isNaN(eLat)) focusPts.push([eLng, eLat]);
                    this.fitBoundsFromCoords([...focusPts, ...this.currentRouteCoords], 60);
                }
                this.updateRouteVisibility();
            } else {
                $('#resStatus').text((res && res.msg) || '路径未找到').css('color', '#ef4444');
            }
        }

        renderMultiRoutesResult(routes, costStr, paradigm) {
            $('#btnPlanRoute').prop('disabled', false).text('开始规划路径');
            this.clearSingleRouteLayers();
            this.clearMultiRoutes();

            if (!Array.isArray(routes) || routes.length === 0) {
                $('#resStatus').text('未找到有效路线').css('color', '#ef4444');
                return;
            }

            $('#resStatus').text(`规划成功 (${costStr})`).css('color', '#10b981');
            $('#rowDistance, #rowNodes').hide();
            $('#multiRouteStats').show();
            $('#resMultiCount').text(`${routes.length} 条有效路径`);

            const multiFeatures = [];
            const rollingLines = [];
            this.currentMultiRoutesData = [];
            let allCoords = [];

            routes.forEach((rt, idx) => {
                const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
                const geojson = rt.geometry || {};
                const coords = (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features) && geojson.features[0])
                    ? geojson.features[0].geometry.coordinates
                    : (geojson.geometry ? geojson.geometry.coordinates : (geojson.coordinates || (Array.isArray(rt.coordinates) ? rt.coordinates : [])));

                multiFeatures.push({
                    type: 'Feature',
                    properties: { routeIdx: idx, color: color, selected: idx === 0 },
                    geometry: { type: 'LineString', coordinates: coords }
                });

                // 多路线模式吸附引线
                if (coords && coords.length > 0) {
                    const firstCoord = coords[0];
                    const lastCoord = coords[coords.length - 1];
                    const sLng = parseFloat($('#startLng').val());
                    const sLat = parseFloat($('#startLat').val());
                    const eLng = parseFloat($('#endLng').val());
                    const eLat = parseFloat($('#endLat').val());

                    if (paradigm === '1_to_n') {
                        if (idx === 0 && !isNaN(sLng) && !isNaN(sLat)) {
                            rollingLines.push({
                                coords: [[sLng, sLat], [firstCoord[0], firstCoord[1]]],
                                color: '#10b981'
                            });
                        }
                    } else if (paradigm === 'n_to_1') {
                        if (idx === 0 && !isNaN(eLng) && !isNaN(eLat)) {
                            rollingLines.push({
                                coords: [[lastCoord[0], lastCoord[1]], [eLng, eLat]],
                                color: '#ef4444'
                            });
                        }
                    }
                }

                coords.forEach(c => allCoords.push(c));
                this.currentMultiRoutesData.push({
                    id: idx,
                    coords: coords,
                    totalDistance: rt.totalDistance,
                    geometry: geojson24,
                    name: `路线 ${idx + 1}`
                });
            });

            this.currentMultiGeojson = { type: 'FeatureCollection', features: multiFeatures };
            if (this.map && this.map.getSource('route-multi-source')) {
                this.map.getSource('route-multi-source').setData(this.currentMultiGeojson);
            }
            if (this.rollingDashLayer) {
                this.rollingDashLayer.setLines(rollingLines);
            }

            if (routes.length > 0) {
                this.currentRouteData = this.currentMultiRoutesData[0];
                $('#rowNavAction').show();
            }

            $('#multiRouteList').html(routes.map((rt, idx) => {
                const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
                const distKm = (rt.totalDistance / 1000).toFixed(2);
                const label = paradigm === '1_to_n' ? `D${idx + 1}` : `S${idx + 1}`;
                return `
                    <div class="multi-route-card-item ${idx === 0 ? 'selected' : ''}" data-route-idx="${idx}">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span class="point-tag-badge" style="background:${color};">${label}</span>
                            <span style="color:#e2e8f0;font-weight:600;">路线 ${idx + 1}</span>
                        </div>
                        <span style="color:#38bdf8;font-weight:700;font-family:monospace;">${distKm} km</span>
                    </div>
                `;
            }).join(''));

            $('#multiRouteList .multi-route-card-item').on('click', (e) => {
                const idx = parseInt($(e.currentTarget).data('route-idx'), 10);
                this.focusRoute(idx);
            });

            if (allCoords.length > 0) {
                this.fitBoundsFromCoords(allCoords, 50);
            }
            this.updateRouteVisibility();
        }

        focusRoute(idx) {
            this.currentFocusedMultiIdx = idx;
            $('#multiRouteList .multi-route-card-item').removeClass('selected').filter(`[data-route-idx="${idx}"]`).addClass('selected');

            if (this.currentMultiGeojson && this.currentMultiGeojson.features) {
                this.currentMultiGeojson.features.forEach(f => {
                    f.properties.selected = (f.properties.routeIdx === idx);
                });
                if (this.map && this.map.getSource('route-multi-source')) {
                    this.map.getSource('route-multi-source').setData(this.currentMultiGeojson);
                }
            }

            const targetData = this.currentMultiRoutesData[idx];
            if (targetData && targetData.coords) {
                this.fitBoundsFromCoords(targetData.coords, 60);
                this.currentRouteData = targetData;
                $('#rowNavAction').show();
            }
        }

        // ==========================================
        // 导航指引逻辑
        // ==========================================
        async triggerNavigationGuide(routeInfo) {
            if (!routeInfo || !routeInfo.coordinates || routeInfo.coordinates.length < 2) {
                alert('未检测到有效路线几何折线，无法生成导航！');
                return;
            }

            this.currentRouteData = routeInfo;
            $('#navDrawerPanel').addClass('open active');

            if (routeInfo.guideCache) {
                this.currentNavGuideCache = routeInfo.guideCache;
                this.currentNavStepIdx = 0;
                this.renderNavDrawerContent(routeInfo.guideCache, routeInfo);
                return;
            }

            let roadData = null;
            try {
                const resp = await fetch(`${this.config.routeDataManageApiBase}/road-names`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        networkId: this.selectedNetworkId || '',
                        coordinates: routeInfo.coordinates
                    })
                });
                if (resp.ok) {
                    const json = await resp.json();
                    if (json.code === 200) roadData = json.data;
                }
            } catch (err) {
                console.warn('[PgrbRouteManager] 路名请求失败，回退几何分析:', err);
            }

            if (window.BoundaryRouteDecode && typeof BoundaryRouteDecode.generateNavigationGuide === 'function') {
                const guide = BoundaryRouteDecode.generateNavigationGuide(routeInfo.coordinates, roadData);
                routeInfo.guideCache = guide;
                this.currentNavGuideCache = guide;
                this.currentNavStepIdx = 0;
                this.renderNavDrawerContent(guide, routeInfo);
            }
        }

        renderNavDrawerContent(guide, routeInfo) {
            if (!guide || !guide.steps) return;
            $('#navTripSubtitle').text(`总里程 ${(routeInfo.totalDistance / 1000).toFixed(2)} km · 共 ${guide.steps.length} 个转向节点`);
            this.renderThreeStepNodes(guide, this.currentNavStepIdx);
        }

        renderThreeStepNodes(guide, activeIdx) {
            const steps = guide.steps;
            const total = steps.length;
            $('#navStepProgressText').text(`步骤 ${activeIdx + 1} / ${total}`);
            $('#btnNavPrevStep').prop('disabled', activeIdx <= 0);
            $('#btnNavNextStep').prop('disabled', activeIdx >= total - 1);
            $('#btnNavCurrStep').prop('disabled', false);

            const prevStep = activeIdx > 0 ? steps[activeIdx - 1] : null;
            const currStep = steps[activeIdx];
            const nextStep = activeIdx < total - 1 ? steps[activeIdx + 1] : null;

            let html = '';
            html += this.renderStepNodeCard(prevStep, 'prev', activeIdx - 1);
            html += this.renderStepNodeCard(currStep, 'curr', activeIdx);
            html += this.renderStepNodeCard(nextStep, 'next', activeIdx + 1);

            $('#navThreeStepsList').html(html);
            $('#navThreeStepsList .nav-three-node-item').on('click', (e) => {
                const targetIdx = parseInt($(e.currentTarget).data('step-idx'), 10);
                if (!isNaN(targetIdx)) this.goToNavStep(targetIdx, true);
            });

            this.highlightNavSegment(currStep);
        }

        renderStepNodeCard(step, role, targetIdx) {
            if (!step) {
                const emptyText = role === 'prev' ? '已是路线起点，无前置步骤' : '已到达目的地，无后续步骤';
                return `<div class="nav-three-node-item empty-node"><div class="empty-hint">${emptyText}</div></div>`;
            }

            const m = (step.maneuver || step.icon || '').toLowerCase();
            let badgeText = '直行';
            let badgeCls = 'badge-straight';
            if (m === 'depart') { badgeText = '起点'; badgeCls = 'badge-depart'; }
            else if (m === 'arrive') { badgeText = '到达'; badgeCls = 'badge-arrive'; }
            else if (m.includes('u-turn') || m.includes('uturn')) { badgeText = '掉头'; badgeCls = 'badge-uturn'; }
            else if (m.includes('left')) { badgeText = '左转'; badgeCls = 'badge-left'; }
            else if (m.includes('right')) { badgeText = '右转'; badgeCls = 'badge-right'; }

            const roleTag = role === 'prev' ? '<span class="step-role-tag prev">前一步</span>' : (role === 'curr' ? '<span class="step-role-tag curr">当前步</span>' : '<span class="step-role-tag next">后一步</span>');
            const extraCls = (role === 'curr') ? 'role-curr' : '';

            return `
                <div class="nav-three-node-item ${extraCls}" data-step-idx="${targetIdx}">
                    <div class="node-header">
                        ${roleTag}
                        <span class="node-click-hint">点击定位</span>
                    </div>
                    <div class="node-body">
                        <div class="maneuver-badge ${badgeCls}">${badgeText}</div>
                        <div class="nav-step-content">
                            <div class="nav-step-main">${step.instruction || ''}</div>
                            <div class="nav-step-sub">
                                <span class="nav-step-dist">${step.distanceText || ''}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        goToNavStep(idx, autoFly = false) {
            if (!this.currentNavGuideCache || !this.currentNavGuideCache.steps) return;
            const steps = this.currentNavGuideCache.steps;
            if (idx < 0 || idx >= steps.length) return;
            this.currentNavStepIdx = idx;
            this.renderThreeStepNodes(this.currentNavGuideCache, idx);

            if (autoFly && steps[idx] && this.map) {
                const targetStep = steps[idx];
                const pt = targetStep.coordinate || (targetStep.coords && targetStep.coords[0]);
                if (pt) {
                    const targetZoom = Math.max(this.map.getZoom(), 16.5);
                    this.map.flyTo({ center: [pt[0], pt[1]], zoom: targetZoom, duration: 600 });
                }
            }
        }

        highlightNavSegment(step) {
            if (!this.map || !step) return;

            // 1. 弱化全路线以突出当前聚焦的导航路段与转向节点
            if (this.map.getLayer('route-single-casing')) this.map.setPaintProperty('route-single-casing', 'line-opacity', 0.35);
            if (this.map.getLayer('route-single-glow')) this.map.setPaintProperty('route-single-glow', 'line-opacity', 0.12);
            if (this.map.getLayer('route-single-core')) this.map.setPaintProperty('route-single-core', 'line-opacity', 0.28);
            if (this.map.getLayer('route-multi-glow')) this.map.setPaintProperty('route-multi-glow', 'line-opacity', 0.12);
            if (this.map.getLayer('route-multi-core')) this.map.setPaintProperty('route-multi-core', 'line-opacity', 0.25);

            // 2. 提取当前步骤折线坐标 (优先兼容 step.coords, step.segmentCoords, step.geometry)
            const coords = step.coords || step.segmentCoords || step.geometry || [];

            // 3. WebGL CustomLayer 当前段发光动画路径 Shader 渲染
            if (this.navSegmentLineLayer) {
                this.navSegmentLineLayer.setCoords(coords);
            }

            // 4. WebGL CustomLayer 当前决策节点与全线途径点 Shader 渲染 (雷达脉冲扩散波)
            if (this.navNodeBeaconLayer) {
                const allStepNodes = (this.currentNavGuideCache && Array.isArray(this.currentNavGuideCache.steps))
                    ? this.currentNavGuideCache.steps.map(s => s.coordinate || (s.coords && s.coords[0])).filter(Boolean)
                    : [];
                this.navNodeBeaconLayer.setNodes(allStepNodes, this.currentNavStepIdx);
            }

            // 5. 备用 GeoJSON 源同步
            if (coords && coords.length > 1) {
                this.currentNavSegmentGeojson = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: coords }
                    }]
                };
                if (this.map.getSource('nav-segment-source')) {
                    this.map.getSource('nav-segment-source').setData(this.currentNavSegmentGeojson);
                }
            }
        }

        clearNavHighlight() {
            if (this.navSegmentLineLayer) {
                this.navSegmentLineLayer.clear();
            }
            if (this.navNodeBeaconLayer) {
                this.navNodeBeaconLayer.clear();
            }
            if (this.map && this.map.getSource('nav-segment-source')) {
                this.map.getSource('nav-segment-source').setData({ type: 'FeatureCollection', features: [] });
            }
            if (this.navHighlightMarker) {
                this.navHighlightMarker.remove();
                this.navHighlightMarker = null;
            }

            // 退出导航单步聚焦时，恢复主路线的饱满展示
            if (this.map) {
                if (this.map.getLayer('route-single-casing')) this.map.setPaintProperty('route-single-casing', 'line-opacity', 0.85);
                if (this.map.getLayer('route-single-glow')) this.map.setPaintProperty('route-single-glow', 'line-opacity', 0.35);
                if (this.map.getLayer('route-single-core')) this.map.setPaintProperty('route-single-core', 'line-opacity', 1.0);
                if (this.map.getLayer('route-multi-glow')) this.map.setPaintProperty('route-multi-glow', 'line-opacity', 0.35);
                if (this.map.getLayer('route-multi-core')) this.map.setPaintProperty('route-multi-core', 'line-opacity', 0.95);
            }
        }

        closeNavDrawer() {
            $('#navDrawerPanel').removeClass('open active');
            this.clearNavHighlight();
        }

        // ==========================================
        // A* 堆演进动画控制
        // ==========================================
        async startRouteAnimation() {
            const sLng = parseFloat($('#startLng').val());
            const sLat = parseFloat($('#startLat').val());
            const eLng = parseFloat($('#endLng').val());
            const eLat = parseFloat($('#endLat').val());

            if (isNaN(sLng) || isNaN(sLat) || isNaN(eLng) || isNaN(eLat)) {
                alert('请先设定有效的起点终点坐标！');
                return;
            }

            $('#btnAnimateRoute').prop('disabled', true).text('请求演进数据...');
            try {
                const resp = await fetch(`${this.config.pgrbApiBase}/route_animate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        networkId: this.selectedNetworkId,
                        startLng: sLng,
                        startLat: sLat,
                        endLng: eLng,
                        endLat: eLat,
                        directed: true,
                        maxSteps: 0
                    })
                }).then(r => r.json());

                $('#btnAnimateRoute').prop('disabled', false).text('分析路径');
                if (resp.code === 200 && resp.data && Array.isArray(resp.data.steps)) {
                    this.currentAnimateData = resp.data;
                    this.currentAnimationFrames = this.buildAnimationFrames(resp.data.steps);
                    $('#animateCtrlBar').show();
                    $('#animStepTotal').text(this.currentAnimationFrames.length);
                    this.renderUpToStep(1);
                    this.playAnim();
                } else {
                    alert((resp && resp.msg) || '获取动画数据失败');
                }
            } catch (err) {
                $('#btnAnimateRoute').prop('disabled', false).text('分析路径');
                alert(`请求演进失败: ${err.message}`);
            }
        }

        buildAnimationFrames(rawSteps) {
            const frames = [];
            for (let i = 0; i < rawSteps.length; i++) {
                const st = rawSteps[i];
                if (st.action === 'PUSH') {
                    frames.push({ type: 'PUSH', rawIndex: i, node: st.node, coord: st.coord });
                } else if (st.action === 'POP') {
                    frames.push({ type: 'POP', rawIndex: i, node: st.node, coord: st.coord });
                }
            }
            return frames;
        }

        renderUpToStep(stepIdx) {
            if (!this.currentAnimationFrames || this.currentAnimationFrames.length === 0) return;
            this.animStepIndex = Math.max(1, Math.min(stepIdx, this.currentAnimationFrames.length));
            $('#animStepCur').text(this.animStepIndex);
            const progress = (this.animStepIndex / this.currentAnimationFrames.length) * 100;
            $('#animProgressBar').css('width', `${progress}%`);

            const nodeFeatures = [];
            const edgeFeatures = [];
            for (let i = 0; i < this.animStepIndex; i++) {
                const f = this.currentAnimationFrames[i];
                if (f.coord) {
                    nodeFeatures.push({
                        type: 'Feature',
                        properties: { color: (f.type === 'POP') ? '#ef4444' : '#3b82f6', radius: 4 },
                        geometry: { type: 'Point', coordinates: f.coord }
                    });
                }
            }

            if (this.map && this.map.getSource('anim-nodes-source')) {
                this.map.getSource('anim-nodes-source').setData({ type: 'FeatureCollection', features: nodeFeatures });
            }

            if (this.animStepIndex === this.currentAnimationFrames.length && this.currentAnimateData && this.currentAnimateData.geometry) {
                if (this.map && this.map.getSource('anim-optimal-source')) {
                    this.map.getSource('anim-optimal-source').setData(this.currentAnimateData.geometry);
                }
                this.pauseAnim();
            }
        }

        stepAnim(delta) {
            this.renderUpToStep(this.animStepIndex + delta);
        }

        jumpAnimLast() {
            this.renderUpToStep(this.currentAnimationFrames.length);
        }

        playAnim() {
            this.isAnimPlaying = true;
            $('#btnAnimPlayPause').text('暂停');
            $('#animStateBadge').text('播放中').removeClass('anim-badge-idle').addClass('anim-badge-push');
            clearInterval(this.animTimer);
            this.animTimer = setInterval(() => {
                if (this.animStepIndex < this.currentAnimationFrames.length) {
                    this.renderUpToStep(this.animStepIndex + 1);
                } else {
                    this.pauseAnim();
                }
            }, this.animSpeed);
        }

        pauseAnim() {
            this.isAnimPlaying = false;
            $('#btnAnimPlayPause').text('播放');
            $('#animStateBadge').text('暂停').removeClass('anim-badge-push').addClass('anim-badge-idle');
            clearInterval(this.animTimer);
        }

        toggleAnimPlayPause() {
            if (this.isAnimPlaying) this.pauseAnim();
            else this.playAnim();
        }

        stopAndClearAnimation() {
            this.pauseAnim();
            $('#animateCtrlBar').hide();
            if (this.map) {
                if (this.map.getSource('anim-nodes-source')) this.map.getSource('anim-nodes-source').setData({ type: 'FeatureCollection', features: [] });
                if (this.map.getSource('anim-edges-source')) this.map.getSource('anim-edges-source').setData({ type: 'FeatureCollection', features: [] });
                if (this.map.getSource('anim-optimal-source')) this.map.getSource('anim-optimal-source').setData({ type: 'FeatureCollection', features: [] });
            }
        }

        // ==========================================
        // 路网管理与弹窗逻辑
        // ==========================================
        bindManageModalEvents() {
            const self = this;
            $('#btnManageNetworks').on('click', () => {
                $('#manageModal').show();
                this.renderManageTable();
            });
            $('#btnCloseManageModal, #btnCloseManageModalBtn').on('click', () => $('#manageModal').hide());

            // 顶部三个操作按钮联动打开新建路网子弹窗
            $('#btnOpenUploadFolder').on('click', () => {
                $('#manageModal').hide();
                this.openUploadModal('folder');
            });
            $('#btnOpenUploadFiles').on('click', () => {
                $('#manageModal').hide();
                this.openUploadModal('files');
            });
            $('#btnOpenXzqFromManage').on('click', () => {
                $('#manageModal').hide();
                this.openXzqModal();
            });

            // 管理级别过滤
            $('.manage-level-radio .level-radio-item').on('click', function () {
                const val = $(this).find('input').val();
                $('.manage-level-radio .level-radio-item').removeClass('active');
                $(this).addClass('active');
                self.renderManageTable(val);
            });
        }

        renderManageTable(lvlFilter = 'county') {
            const $tbody = $('#manageTableBody');
            $tbody.empty();
            let list = this.editableNetworks || [];
            if (lvlFilter !== 'all') {
                list = list.filter(n => this.getNetworkLevel(n) === lvlFilter);
            }

            if (list.length === 0) {
                $tbody.html('<tr><td colspan="4" class="empty-td text-center">当前暂无路网配置</td></tr>');
                return;
            }

            list.forEach(net => {
                const isProtected = net.id === 'shjd_road';
                const delBtn = isProtected
                    ? '<span class="protected-badge">系统保护</span>'
                    : `<button type="button" class="pick-btn btn-del-net" data-del-net="${net.id}">删除</button>`;

                $tbody.append(`
                    <tr>
                        <td class="net-id-cell">
                            <div>${net.id}</div>
                            ${net.buildTime ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${net.buildTime}</div>` : ''}
                        </td>
                        <td><input type="text" class="coord-input edit-name-input" id="editName_${net.id}" value="${net.name || net.id}"></td>
                        <td>${net.fileSizeFmt || '-'}</td>
                        <td class="action-cell">
                            <button type="button" class="pick-btn btn-sm-action" data-save-net="${net.id}">保存</button>
                            <button type="button" class="pick-btn btn-sm-action" data-recompile-net="${net.id}">编译</button>
                            ${delBtn}
                        </td>
                    </tr>
                `);
            });

            $tbody.find('[data-save-net]').on('click', async (e) => {
                const id = $(e.currentTarget).data('save-net');
                const newName = $(`#editName_${id}`).val().trim();
                if (!newName) return;
                try {
                    const formData = new URLSearchParams();
                    formData.append('networkId', id);
                    formData.append('networkName', newName);
                    const res = await fetch(`${this.config.pgrbApiBase}/update-name`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    }).then(r => r.json());
                    if (res.code === 200) {
                        alert('更新成功');
                        this.fetchRoadNetworks(id);
                    }
                } catch (err) {
                    alert(`更新失败: ${err.message}`);
                }
            });

            $tbody.find('[data-recompile-net]').on('click', async (e) => {
                const id = $(e.currentTarget).data('recompile-net');
                const net = (this.editableNetworks || []).find(n => n.id === id);
                const name = net ? (net.name || id) : id;
                if (!confirm(`确认要重新编译路网【${name}】并刷新服务器磁盘 .pgrb 文件吗？`)) return;
                const $btn = $(e.currentTarget);
                const oldText = $btn.text();
                $btn.prop('disabled', true).text('编译中...');
                try {
                    const lvl = net ? this.getNetworkLevel(net) : '';
                    const formData = new URLSearchParams();
                    formData.append('networkId', id);
                    if (lvl) formData.append('level', lvl);
                    const res = await fetch(`${this.config.pgrbApiBase}/recompile`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    }).then(r => r.json());
                    if (res.code === 200) {
                        alert(`重新编译落盘成功！最新文件体积: ${res.data ? res.data.fileSizeFmt : '就绪'}`);
                        await this.fetchRoadNetworks(id);
                        this.renderManageTable();
                    } else {
                        alert(`重新编译失败: ${res.msg}`);
                    }
                } catch (err) {
                    alert(`重新编译异常: ${err.message}`);
                } finally {
                    $btn.prop('disabled', false).text(oldText);
                }
            });

            $tbody.find('[data-del-net]').on('click', async (e) => {
                const id = $(e.currentTarget).data('del-net');
                if (!confirm(`确定删除路网 ${id} 吗？`)) return;
                try {
                    const formData = new URLSearchParams();
                    formData.append('networkId', id);
                    const res = await fetch(`${this.config.pgrbApiBase}/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    }).then(r => r.json());
                    if (res.code === 200) {
                        alert('删除成功');
                        this.fetchRoadNetworks();
                    }
                } catch (err) {
                    alert(`删除失败: ${err.message}`);
                }
            });
        }

        // ==========================================
        // 行政区划相交新建路网业务逻辑
        // ==========================================
        bindXzqModalEvents() {
            const self = this;
            $('#btnCloseXzqModal, #btnCloseXzqModalBtn').on('click', () => {
                $('#xzqModal').hide();
                self.restoreActiveBoundaryAfterModal();
            });

            $('#xzqSearchInput').on('input', () => {
                if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = setTimeout(() => {
                    self.loadXzqList(self.currentXzqLevel, false);
                }, 250);
            });

            $('#xzqListWrapper').on('scroll', function () {
                if (this.scrollTop + this.clientHeight >= this.scrollHeight - 35) {
                    if (self.xzqHasMore && !self.isXzqLoadingMore && !self.xzqListLoading) {
                        self.xzqPage++;
                        self.loadXzqList(self.currentXzqLevel, true);
                    }
                }
            });

            $('#btnSubmitXzqBuild').on('click', () => this.submitXzqBuild());
        }

        openXzqModal() {
            $('#xzqModal').show();
            $('#xzqMsg').hide();
            $('#selectedSummaryBar').hide();
            this.selectedXzqItem = null;
            $('#xzqSearchInput').val('');
            this.initXzqLevels();
        }

        restoreActiveBoundaryAfterModal() {
            this.clearXzqBoundaryData();
            const boundaryGeo = this.currentNetworkBoundary ? this.currentNetworkBoundary.geojson : (this.currentNetworkMeta && this.currentNetworkMeta.boundaryGeoJSON);
            if (boundaryGeo) {
                this.setXzqBoundaryData(boundaryGeo);
            }
        }

        async initXzqLevels() {
            const $container = $('#xzqLevelBtnContainer');
            $container.html('<div class="loading-state">正在检索数据库行政层级...</div>');
            try {
                const res = await fetch(`${this.config.xzqApiBase}/levels`).then(r => r.json());
                if (res.code === 200 && Array.isArray(res.data) && res.data.length > 0) {
                    this.xzqLevels = res.data;
                    this.currentXzqLevel = res.data[0].key;
                    this.renderXzqLevelButtons();
                    this.loadXzqList(this.currentXzqLevel, false);
                } else {
                    $container.html('<div style="font-size:12px; color:#ef4444;">未获取到级别配置</div>');
                }
            } catch (err) {
                console.error('[PgrbRouteManager] 获取行政层级异常:', err);
                $container.html('<div style="font-size:12px; color:#ef4444;">请求级别失败</div>');
            }
        }

        renderXzqLevelButtons() {
            const $container = $('#xzqLevelBtnContainer');
            $container.empty();
            this.xzqLevels.forEach(lvl => {
                const $btn = $(`<button type="button" class="pick-btn xzq-lvl-btn ${this.currentXzqLevel === lvl.key ? 'active' : ''}">${lvl.name}</button>`);
                $btn.on('click', () => {
                    this.currentXzqLevel = lvl.key;
                    this.renderXzqLevelButtons();
                    this.loadXzqList(this.currentXzqLevel, false);
                });
                $container.append($btn);
            });
        }

        getExistingXzqIdSet(level) {
            const idSet = new Set();
            if (!Array.isArray(this.networksList)) return idSet;
            const prefix = `xzq_${level}_`;
            for (const net of this.networksList) {
                if (!net || !net.id) continue;
                if (net.id.startsWith(prefix)) {
                    const featId = net.id.replace(prefix, '').replace(/_3d$/, '');
                    idSet.add(String(featId).trim().toLowerCase());
                } else if (this.getNetworkLevel(net) === level) {
                    idSet.add(String(net.id).replace(/_3d$/, '').trim().toLowerCase());
                }
            }
            return idSet;
        }

        getExistingXzqNameSet(level) {
            const nameSet = new Set();
            if (!Array.isArray(this.networksList)) return nameSet;
            for (const net of this.networksList) {
                if (this.getNetworkLevel(net) === level && net.name) {
                    nameSet.add(net.name.trim().toLowerCase());
                }
            }
            return nameSet;
        }

        getXzqItemFullName(item) {
            if (!item) return '';
            if (item.fields && typeof item.fields === 'object') {
                const vals = [];
                for (const key of Object.keys(item.fields)) {
                    const val = item.fields[key];
                    if (val && typeof val === 'string' && val.trim() !== '') {
                        vals.push(val.trim());
                    }
                }
                if (vals.length > 0) return vals.join('');
            }
            return item.name || String(item.id || '');
        }

        async loadXzqList(level, isAppend = false) {
            const $wrapper = $('#xzqListWrapper');
            if (!isAppend) {
                this.xzqPage = 1;
                this.xzqList = [];
                this.selectedXzqItem = null;
                $('#selectedSummaryBar').hide();
                this.xzqListLoading = true;
                $wrapper.html('<div class="loading-state">正在加载行政区划列表中...</div>');
            } else {
                this.isXzqLoadingMore = true;
            }

            const existingFilterTip = document.getElementById('existingFilterTip');
            const existingIdSet = this.getExistingXzqIdSet(level);
            const existingNameSet = this.getExistingXzqNameSet(level);
            const existingCount = Array.isArray(this.networksList) ? this.networksList.filter(n => this.getNetworkLevel(n) === level).length : 0;

            if (existingFilterTip) {
                if (existingCount > 0) {
                    existingFilterTip.style.display = 'flex';
                    existingFilterTip.textContent = `已自动过滤当前级别已在数据库中建图的 ${existingCount} 个行政区，防止重复建图`;
                } else {
                    existingFilterTip.style.display = 'none';
                }
            }

            try {
                const kw = encodeURIComponent($('#xzqSearchInput').val().trim());
                const url = `${this.config.xzqApiBase}/list?level=${level}&page=${this.xzqPage}&pageSize=${this.xzqPageSize}&keyword=${kw}`;
                const res = await fetch(url).then(r => r.json());
                if (res.code === 200 && res.data) {
                    this.xzqFields = res.data.fields || ['市级', '区县级', '乡镇级', '村级名'];
                    const rawList = res.data.list || [];
                    this.xzqTotal = res.data.total || 0;

                    // 严格去重：过滤已建图的行政区
                    const deduplicatedList = rawList.filter(item => {
                        const itemId = String(item.id || '').trim().toLowerCase();
                        if (itemId && existingIdSet.has(itemId)) return false;

                        const fullName = this.getXzqItemFullName(item);
                        if (fullName && existingNameSet.has(fullName.trim().toLowerCase())) return false;
                        if (item.name && existingNameSet.has(item.name.trim().toLowerCase())) return false;

                        return true;
                    });

                    if (!isAppend) {
                        this.xzqList = deduplicatedList;
                    } else {
                        this.xzqList.push(...deduplicatedList);
                    }
                    this.xzqHasMore = this.xzqList.length < this.xzqTotal;
                    this.renderXzqTable();
                } else {
                    if (!isAppend) {
                        this.xzqFields = ['名称', 'ID'];
                        this.xzqList = [];
                        this.xzqTotal = 0;
                        this.xzqHasMore = false;
                        $wrapper.html('<div class="empty-state">未检索到匹配的行政区划要素（可能已全部建图）</div>');
                    }
                }
            } catch (err) {
                console.error('[PgrbRouteManager] 获取行政区划列表异常:', err);
                if (!isAppend) {
                    $wrapper.html(`<div class="empty-state" style="color: #ef4444;">请求异常: ${err.message}</div>`);
                }
            } finally {
                this.xzqListLoading = false;
                this.isXzqLoadingMore = false;
            }
        }

        renderXzqTable() {
            const $wrapper = $('#xzqListWrapper');
            if (this.xzqList.length === 0) {
                $wrapper.html('<div class="empty-state">未检索到匹配的行政区划要素</div>');
                return;
            }

            $wrapper.empty();
            const $table = $('<table class="xzq-table"></table>');
            const $thead = $('<thead><tr></tr></thead>');
            this.xzqFields.forEach(f => {
                $thead.find('tr').append(`<th>${f}</th>`);
            });
            $table.append($thead);

            const $tbody = $('<tbody></tbody>');
            this.xzqList.forEach(item => {
                const $tr = $('<tr></tr>');
                if (this.selectedXzqItem && this.selectedXzqItem.id === item.id) {
                    $tr.addClass('selected');
                }

                this.xzqFields.forEach(f => {
                    const text = (item.fields && item.fields[f]) || item[f] || item.name || item.id || '-';
                    $tr.append(`<td>${text}</td>`);
                });

                $tr.on('click', () => this.onSelectXzqItem(item, $tbody, $tr));
                $tbody.append($tr);
            });
            $table.append($tbody);
            $wrapper.append($table);

            if (this.isXzqLoadingMore) {
                $wrapper.append('<div class="scroll-more-hint">正在加载下 100 条...</div>');
            } else if (this.xzqHasMore) {
                $wrapper.append(`<div class="scroll-more-hint">已展示 ${this.xzqList.length} / ${this.xzqTotal} 条，向下滚动自动加载下 100 条...</div>`);
            } else {
                $wrapper.append(`<div class="scroll-more-hint end-hint">已加载全部 ${this.xzqList.length} 条要素</div>`);
            }
        }

        async onSelectXzqItem(item, $tbody, $currentTr) {
            this.selectedXzqItem = item;
            $tbody.find('tr').removeClass('selected');
            $currentTr.addClass('selected');

            $('#selectedSummaryBar').css('display', 'flex');
            $('#summaryValue').text(this.getXzqItemFullName(item));

            this.clearXzqBoundaryData();

            try {
                const res = await fetch(`${this.config.xzqApiBase}/detail?level=${this.currentXzqLevel}&featureId=${item.id}`).then(r => r.json());
                if (res.code === 200 && res.data && this.map) {
                    const detail = res.data;
                    const geoData = detail.geojson ? (typeof detail.geojson === 'string' ? JSON.parse(detail.geojson) : detail.geojson) : null;

                    if (detail.bbox && Array.isArray(detail.bbox) && detail.bbox.length === 4) {
                        this.flyMapToBounds(detail.bbox, { padding: 50, duration: 800 });
                    }

                    if (geoData && this.selectedXzqItem && this.selectedXzqItem.id === item.id) {
                        this.setXzqBoundaryData(geoData);
                    }
                }
            } catch (err) {
                console.error('[PgrbRouteManager] 获取行政区要素详情异常:', err);
            }
        }

        flyMapToBounds(bounds, options = { padding: 50, duration: 800 }) {
            if (!this.map || !bounds) return;
            let bbox = bounds;
            if (Array.isArray(bounds) && bounds.length === 4 && typeof bounds[0] === 'number') {
                bbox = [[bounds[0], bounds[1]], [bounds[2], bounds[3]]];
            }
            try {
                this.map.fitBounds(bbox, {
                    padding: options.padding || 50,
                    duration: options.duration || 800
                });
            } catch (e) {
                console.warn('[PgrbRouteManager] fitBounds 异常:', e);
            }
        }

        async submitXzqBuild() {
            if (!this.selectedXzqItem) {
                alert('请先在列表中点击选中具体的要素！');
                return;
            }

            const netId = `xzq_${this.currentXzqLevel}_${this.selectedXzqItem.id}_3d`;
            const fullName = this.getXzqItemFullName(this.selectedXzqItem) || this.selectedXzqItem.name || this.selectedXzqItem.id;
            const netName = fullName;

            const $msg = $('#xzqMsg');
            const $btn = $('#btnSubmitXzqBuild');
            $msg.show().css('color', '#38bdf8').text(`正在基于【${netName}】提取 OSM 路网要素并构建 3D 立体分层拓扑（Layer-Aware Noding），请稍候...`);
            $btn.prop('disabled', true).text('构建中...');

            const formData = new URLSearchParams();
            formData.append('level', this.currentXzqLevel);
            formData.append('featureId', this.selectedXzqItem.id);
            formData.append('networkId', netId);
            formData.append('networkName', netName);

            try {
                const res = await fetch(`${this.config.pgrbApiBase}/build-and-save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                }).then(r => r.json());

                $btn.prop('disabled', false).text('开始相交构建路网');

                if (res.code === 200) {
                    $msg.css('color', '#10b981').text(res.data ? res.data.msg : '路网相交构建成功！');
                    setTimeout(() => {
                        $('#xzqModal').hide();
                        this.selectedLevelFilter = this.currentXzqLevel;
                        $(`.level-radio-item input[name="levelFilter"][value="${this.currentXzqLevel}"]`).prop('checked', true);
                        $(`.level-radio-item`).removeClass('active');
                        $(`.level-radio-item input[name="levelFilter"][value="${this.currentXzqLevel}"]`).closest('.level-radio-item').addClass('active');
                        this.fetchRoadNetworks(netId);
                    }, 1500);
                } else {
                    $msg.css('color', '#ef4444').text(res.msg || '构建失败');
                }
            } catch (err) {
                $btn.prop('disabled', false).text('开始相交构建路网');
                $msg.css('color', '#ef4444').text(`请求异常: ${err.message}`);
                console.error('[PgrbRouteManager] 相交建图异常:', err);
            }
        }

        // ==========================================
        // 上传 SHP 并编译为 V3 PGRB 路网业务逻辑
        // ==========================================
        bindUploadModalEvents() {
            const self = this;
            $('#btnCloseUploadModal, #btnCloseUploadModalBtn').on('click', () => $('#uploadModal').hide());

            $('#btnModeFolder').on('click', () => this.switchUploadMode('folder'));
            $('#btnModeFiles').on('click', () => this.switchUploadMode('files'));

            $('#shpFolderInput').on('change', function () {
                self.handleShpFilesChange(this.files, 'folder');
            });
            $('#shpFilesInput').on('change', function () {
                self.handleShpFilesChange(this.files, 'files');
            });

            $('#btnSubmitUpload').on('click', () => this.submitUploadShp());
        }

        openUploadModal(mode = 'folder') {
            $('#uploadModal').show();
            this.switchUploadMode(mode);
            this.resetUploadForm();
        }

        resetUploadForm() {
            this.detectedShpFile = null;
            this.detectedMatchedFiles = [];
            $('#shpFolderInput').val('');
            $('#shpFilesInput').val('');
            $('#netIdInput').val('');
            $('#netNameInput').val('');
            $('#netEncodingInput').val('GBK');
            $('#shpFilesSummary').hide().empty();
            $('#uploadMsg').hide().empty();
            $('#btnSubmitUpload').prop('disabled', false).text('上传并编译为 V3 路网');
        }

        switchUploadMode(mode) {
            this.uploadMode = mode;
            this.detectedShpFile = null;
            this.detectedMatchedFiles = [];
            $('#shpFilesSummary').hide();
            $('#uploadMsg').hide();

            if (mode === 'folder') {
                $('#btnModeFolder').addClass('active');
                $('#btnModeFiles').removeClass('active');
                $('#groupUploadFolder').show();
                $('#groupUploadFiles').hide();
            } else {
                $('#btnModeFiles').addClass('active');
                $('#btnModeFolder').removeClass('active');
                $('#groupUploadFiles').show();
                $('#groupUploadFolder').hide();
            }
        }

        handleShpFilesChange(fileList, mode) {
            const files = Array.from(fileList || []);
            const validExts = ['.shp', '.dbf', '.shx', '.prj', '.cpg', '.sbn', '.sbx'];
            this.detectedMatchedFiles = files.filter(f => {
                const n = f.name.toLowerCase();
                return validExts.some(ext => n.endsWith(ext));
            });

            this.detectedShpFile = this.detectedMatchedFiles.find(f => f.name.toLowerCase().endsWith('.shp'));

            const $summary = $('#shpFilesSummary');
            if (!this.detectedShpFile) {
                $summary.show().css('color', '#ef4444').text(mode === 'folder'
                    ? '所选目录中未检索到 .shp 矢量文件，请确保所选文件夹包含有效的 Shapefile 数据！'
                    : '未包含 .shp 主图层文件，请确保多选的文件中含有 .shp 几何主文件！');
                return;
            }

            const rawBaseName = this.detectedShpFile.name.replace(/\.shp$/i, '');
            const cleanId = 'shp_' + rawBaseName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

            const currentId = $('#netIdInput').val();
            if (!currentId || currentId.startsWith('shp_')) {
                $('#netIdInput').val(cleanId);
            }
            const currentName = $('#netNameInput').val();
            if (!currentName || currentName.endsWith('(SHP)')) {
                $('#netNameInput').val(`${rawBaseName} (SHP)`);
            }

            const foundExts = new Set(this.detectedMatchedFiles.map(f => {
                const n = f.name.toLowerCase();
                return n.substring(n.lastIndexOf('.'));
            }));

            const requiredCore = ['.shp', '.dbf', '.shx', '.prj'];
            const missingCore = requiredCore.filter(ext => !foundExts.has(ext));

            $summary.show();
            if (mode === 'files' && missingCore.length > 0) {
                $summary.css('color', '#f59e0b').text(`核心文件未齐备：已选择 [ ${Array.from(foundExts).join(', ')} ]，缺少必备文件 [ ${missingCore.join(', ')} ]，请多选至少包含这 4 个基本文件！`);
                return;
            }

            $summary.css('color', '#10b981');
            if (missingCore.length === 0) {
                $summary.text(`4个核心要素文件已齐备: ${this.detectedShpFile.name} (含 ${Array.from(foundExts).join(', ')}，共 ${this.detectedMatchedFiles.length} 个文件)`);
            } else {
                $summary.text(`检测到主矢量文件: ${this.detectedShpFile.name} (含配套格式: ${Array.from(foundExts).join(', ')}，共 ${this.detectedMatchedFiles.length} 个相关文件)`);
            }
        }

        async submitUploadShp() {
            if (!this.detectedShpFile || this.detectedMatchedFiles.length === 0) {
                alert(this.uploadMode === 'folder'
                    ? '请先选择包含有效 .shp 矢量文件的本地文件夹！'
                    : '请先多选包含 .shp、.dbf、.shx、.prj 核心文件的文件列表！');
                return;
            }

            if (this.uploadMode === 'files') {
                const foundExts = new Set(this.detectedMatchedFiles.map(f => f.name.toLowerCase().substring(f.name.lastIndexOf('.'))));
                const requiredCore = ['.shp', '.dbf', '.shx', '.prj'];
                const missingCore = requiredCore.filter(ext => !foundExts.has(ext));
                if (missingCore.length > 0) {
                    alert(`缺少必需的核心 Shapefile 文件：${missingCore.join(', ')}！\nShapefile 构网必须同时包含 .shp、.dbf、.shx、.prj 这 4 个基本文件。`);
                    return;
                }
            }

            const netId = $('#netIdInput').val().trim();
            const netName = $('#netNameInput').val().trim() || netId;
            const encoding = $('#netEncodingInput').val() || 'GBK';

            if (!netId) {
                alert('请输入路网唯一标识 Code！');
                return;
            }
            if (!/^[a-zA-Z0-9_]+$/.test(netId)) {
                alert('路网标识 Code 仅支持英文字母、数字和下划线！');
                return;
            }

            const $btn = $('#btnSubmitUpload');
            const $msg = $('#uploadMsg');
            $btn.prop('disabled', true).text('上传中...');
            $msg.show().css('color', '#38bdf8').text('[步骤 1/2] 正在上传 Shapefile 并在 PostGIS 中生成拓扑节点...');

            try {
                // 1. 上传 SHP 文件夹 / 多文件至 PostGIS
                const formData = new FormData();
                for (const f of this.detectedMatchedFiles) {
                    formData.append('files', f);
                }
                formData.append('networkId', netId);
                formData.append('networkName', netName);
                formData.append('encoding', encoding);

                const uploadRes = await fetch(`${this.config.routeDataManageApiBase}/upload-shp-folder`, {
                    method: 'POST',
                    body: formData
                }).then(r => r.json());

                if (uploadRes.code !== 200) {
                    throw new Error(uploadRes.msg || '上传并在 PostGIS 构建拓扑失败');
                }

                // 2. 编译落盘为 V3 .pgrb 二进制文件与凹包外包边界
                $btn.text('编译 V3...');
                $msg.text('[步骤 2/2] PostGIS 拓扑构建成功，正在编译落盘为 V3 二进制路网与凹包边界...');
                const compileParams = new URLSearchParams();
                compileParams.append('networkId', netId);
                compileParams.append('level', 'shp');

                const compileRes = await fetch(`${this.config.pgrbApiBase}/recompile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: compileParams
                }).then(r => r.json());

                if (compileRes.code !== 200) {
                    throw new Error(compileRes.msg || '编译 V3 PGRB 失败');
                }

                const sizeFmt = compileRes.data && compileRes.data.fileSizeFmt ? compileRes.data.fileSizeFmt : '就绪';
                $msg.css('color', '#10b981').text(`路网创建并落盘成功！最新文件体积: ${sizeFmt}`);

                setTimeout(() => {
                    $('#uploadModal').hide();
                    this.selectedLevelFilter = 'shp';
                    $('.level-radio-item input[name="levelFilter"][value="shp"]').prop('checked', true);
                    $('.level-radio-item').removeClass('active');
                    $('#levelItemShp').addClass('active');
                    this.fetchRoadNetworks(netId);
                }, 1200);
            } catch (err) {
                console.error('[PgrbRouteManager] SHP 上传或构建异常:', err);
                $btn.prop('disabled', false).text('上传并编译为 V3 路网');
                $msg.css('color', '#ef4444').text(`错误: ${err.message}`);
            }
        }
    }

    window.WmtsRoadManager = new WmtsRoadManager();
    window.PgrbRouteManager = new PgrbRouteManager();

})(window, jQuery);
