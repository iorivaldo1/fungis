/**
 * fungis_maplibre_tools.js
 * fungis 核心功能移植套件 (针对 MapLibre GL JS 引擎)
 * 包含：点击查询、多系定位、定位结果管理、SHP图层、JSON图层、空间量算、照片EXIF定位、设备当前定位
 */

(function () {
    'use strict';

    window.FungisMapLibreTools = {
        map: null,
        activePanelId: null,
        
        // 1. 点击查询状态
        clickInfo: {
            active: false,
            marker: null
        },

        // 2. 定位点集合
        locationList: [],
        locationIdCounter: 1,

        // 3. SHP 图层集合
        shpLayers: {},
        shpIdCounter: 1,

        // 4. JSON 图层集合
        jsonLayers: {},
        jsonIdCounter: 1,

        // 5. 空间量算状态
        measure: {
            activeTool: null, // 'distance' | 'area' | null
            points: [],
            markers: [],
            activeRubberPoint: null
        },

        // 6. 照片点集合
        photoList: [],
        photoMarkers: [],

        // 7. 当前设备定位 Marker
        userLocationMarker: null,

        // 初始化入口
        init: function (mapInstance) {
            this.map = mapInstance;
            this.bindPanelToggles();
            this.initClickInfo();
            this.initLocate();
            this.initLocationTable();
            this.initShpPanel();
            this.initJsonPanel();
            this.initMeasure();
            this.initPhotoUpload();
            this.initCurrentLoc();
        },

        // 绑定底部圆形按钮与浮动面板互斥联动
        bindPanelToggles: function () {
            const self = this;
            const buttons = [
                { btn: '#btnClickInfo', panel: '#panelClickInfo' },
                { btn: '#btnLocate', panel: '#panelLocate' },
                { btn: '#btnLocationTable', panel: '#panelLocationTable' },
                { btn: '#btnShpPanel', panel: '#panelShpPanel' },
                { btn: '#btnJsonPanel', panel: '#panelJsonPanel' },
                { btn: '#btnMeasurePanel', panel: '#panelMeasurePanel' }
            ];

            buttons.forEach(function (item) {
                $(item.btn).on('click', function (e) {
                    e.stopPropagation();
                    self.togglePanel(item.panel, item.btn);
                });
            });

            // 面板内部的关闭按钮
            $('.fungis-panel-close').on('click', function (e) {
                e.stopPropagation();
                const panel = $(this).closest('.fungis-popup-panel');
                panel.fadeOut(150);
                $('.btn-circle-tool').removeClass('active');
                self.activePanelId = null;
            });

            // 监听全局 Esc 键退出量算或关闭面板
            $(document).on('keydown', function (e) {
                if (e.key === 'Escape') {
                    if (self.measure.activeTool) {
                        self.stopMeasure();
                    } else if (self.activePanelId) {
                        $(self.activePanelId).fadeOut(150);
                        $('.btn-circle-tool').removeClass('active');
                        self.activePanelId = null;
                    }
                }
            });
        },

        // 互斥展开/收起面板
        togglePanel: function (panelId, btnId) {
            const $panel = $(panelId);
            const $btn = $(btnId);

            if (this.activePanelId === panelId) {
                // 点击已激活的，关闭之
                $panel.fadeOut(150);
                $btn.removeClass('active');
                this.activePanelId = null;
            } else {
                // 关闭其他
                $('.fungis-popup-panel').fadeOut(100);
                $('.btn-circle-tool').removeClass('active');
                $panel.fadeIn(180);
                $btn.addClass('active');
                this.activePanelId = panelId;
            }
        },

        // =========================================================================
        // 1. 点击查询模块
        // =========================================================================
        initClickInfo: function () {
            const self = this;
            const $chkActive = $('#chkClickInfoActive');

            $chkActive.on('change', function () {
                self.clickInfo.active = this.checked;
                if (!this.checked && self.clickInfo.marker) {
                    self.clickInfo.marker.remove();
                    self.clickInfo.marker = null;
                }
            });

            self.map.on('click', function (e) {
                if (!self.clickInfo.active) return;
                const lng = e.lngLat.lng;
                const lat = e.lngLat.lat;

                // 更新红点 Marker
                if (self.clickInfo.marker) {
                    self.clickInfo.marker.remove();
                }
                const el = document.createElement('div');
                el.className = 'mlgl-click-marker';
                self.clickInfo.marker = new maplibregl.Marker({ element: el })
                    .setLngLat([lng, lat])
                    .addTo(self.map);

                // 坐标换算 (WGS84, BD09, CGCS2000)
                let bdLng = '--', bdLat = '--';
                if (typeof window.wgs84togcj02 === 'function' && typeof window.gcj02tobd09 === 'function') {
                    const gcj = window.wgs84togcj02(lng, lat);
                    const bd = window.gcj02tobd09(gcj[0], gcj[1]);
                    bdLng = bd[0].toFixed(6);
                    bdLat = bd[1].toFixed(6);
                }

                let zoneStr = '--', projXStr = '--', projYStr = '--';
                try {
                    const zone = Math.floor((lng + 1.5) / 3);
                    const centralMeridian = zone * 3;
                    const cgcs2000Str = '+proj=tmerc +lat_0=0 +lon_0=' + centralMeridian + ' +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
                    const [x, y] = proj4('EPSG:4326', cgcs2000Str, [lng, lat]);
                    projXStr = x.toFixed(2);
                    projYStr = y.toFixed(2);
                    zoneStr = zone + '带 (中央经线 ' + centralMeridian + '°)';
                } catch (err) {
                    console.error('CGCS2000 计算失败:', err);
                }

                $('#valWgsLng').text(lng.toFixed(6));
                $('#valWgsLat').text(lat.toFixed(6));
                $('#valBdLng').text(bdLng);
                $('#valBdLat').text(bdLat);
                $('#valProjZone').text(zoneStr);
                $('#valProjX').text(projXStr);
                $('#valProjY').text(projYStr);

                // 自动展开点击查询面板供用户查看
                if (self.activePanelId !== '#panelClickInfo') {
                    self.togglePanel('#panelClickInfo', '#btnClickInfo');
                }
            });
        },

        // =========================================================================
        // 2. 坐标精准定位模块
        // =========================================================================
        initLocate: function () {
            const self = this;
            const $selCrs = $('#locateCrsSelect');
            const $selFormat = $('#locateFormatSelect');
            const $rowFormat = $('#rowLocateFormat');
            const $rowZone = $('#rowLocateZone');
            const $rowDecimal = $('#rowLocateDecimal');
            const $rowDmsX = $('#rowLocateDmsX');
            const $rowDmsY = $('#rowLocateDmsY');

            // 联动表单项显示
            function updateLocateFormView() {
                const crs = $selCrs.val();
                const format = $selFormat.val();

                if (crs === 'WGS84') {
                    $rowFormat.show();
                    $rowZone.hide();
                    if (format === 'dms') {
                        $rowDecimal.hide();
                        $rowDmsX.show();
                        $rowDmsY.show();
                    } else {
                        $rowDecimal.show();
                        $rowDmsX.hide();
                        $rowDmsY.hide();
                    }
                } else if (crs === 'CGCS2000') {
                    $rowFormat.hide();
                    $rowZone.show();
                    $rowDecimal.show();
                    $rowDmsX.hide();
                    $rowDmsY.hide();
                    $('#lblCoordX').text('X (东向):');
                    $('#lblCoordY').text('Y (北向):');
                } else {
                    $rowFormat.hide();
                    $rowZone.hide();
                    $rowDecimal.show();
                    $rowDmsX.hide();
                    $rowDmsY.hide();
                    $('#lblCoordX').text('经度:');
                    $('#lblCoordY').text('纬度:');
                }
            }

            $selCrs.on('change', updateLocateFormView);
            $selFormat.on('change', updateLocateFormView);
            updateLocateFormView();

            // 执行定位按钮
            $('#btnDoLocate').on('click', function () {
                const crs = $selCrs.val();
                let x, y;

                if (crs === 'WGS84' && $selFormat.val() === 'dms') {
                    const parseDMS = function (deg, min, sec) {
                        const d = parseFloat(deg || 0);
                        const m = Math.abs(parseFloat(min || 0));
                        const s = Math.abs(parseFloat(sec || 0));
                        const sign = (d < 0 || Object.is(d, -0)) ? -1 : 1;
                        return sign * (Math.abs(d) + m / 60 + s / 3600);
                    };
                    x = parseDMS($('#dmsXdeg').val(), $('#dmsXmin').val(), $('#dmsXsec').val());
                    y = parseDMS($('#dmsYdeg').val(), $('#dmsYmin').val(), $('#dmsYsec').val());
                } else {
                    x = parseFloat($('#locateCoordX').val());
                    y = parseFloat($('#locateCoordY').val());
                }

                if (isNaN(x) || isNaN(y)) {
                    alert('请输入有效的坐标数值');
                    return;
                }

                let lng, lat;
                if (crs === 'WGS84') {
                    lng = x;
                    lat = y;
                } else if (crs === 'BD09') {
                    if (typeof window.bd09ToWgs84 === 'function') {
                        const w = window.bd09ToWgs84(x, y);
                        lng = w[0];
                        lat = w[1];
                    }
                } else if (crs === 'CGCS2000') {
                    const zone = parseInt($('#locateZoneSelect').val(), 10);
                    const centralMeridian = zone * 3;
                    const cgcs2000Str = '+proj=tmerc +lat_0=0 +lon_0=' + centralMeridian + ' +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
                    let actualX = x;
                    if (x > 10000000) {
                        actualX = x % 1000000;
                    }
                    try {
                        const [wLng, wLat] = proj4(cgcs2000Str, 'EPSG:4326', [actualX, y]);
                        lng = wLng;
                        lat = wLat;
                    } catch (e) {
                        alert('CGCS2000 坐标转换失败，请检查输入数值');
                        return;
                    }
                }

                if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                    alert('计算所得经纬度超出全球范围');
                    return;
                }

                const currentId = self.locationIdCounter++;
                const markerEl = document.createElement('div');
                markerEl.className = 'mlgl-locate-marker';
                markerEl.innerHTML = '<div class="mlgl-locate-dot"></div><div class="mlgl-locate-label"><span style="color:#38bdf8;font-weight:bold;">ID: ' + currentId + '</span> (' + x.toFixed(2) + ', ' + y.toFixed(2) + ')</div>';

                const marker = new maplibregl.Marker({ element: markerEl })
                    .setLngLat([lng, lat])
                    .addTo(self.map);

                const record = {
                    id: currentId,
                    lng: lng,
                    lat: lat,
                    rawX: x,
                    rawY: y,
                    crs: crs,
                    visible: true,
                    marker: marker
                };

                self.locationList.push(record);
                self.map.flyTo({ center: [lng, lat], zoom: 15 });
                self.renderLocationTable();
            });

            // 清除表单输入
            $('#btnClearLocateForm').on('click', function () {
                $('#locateCoordX, #locateCoordY, #dmsXdeg, #dmsXmin, #dmsXsec, #dmsYdeg, #dmsYmin, #dmsYsec').val('');
            });
        },

        // =========================================================================
        // 3. 定位结果管理列表模块
        // =========================================================================
        initLocationTable: function () {
            const self = this;
            $('#btnClearAllLocations').on('click', function () {
                self.locationList.forEach(function (item) {
                    if (item.marker) item.marker.remove();
                });
                self.locationList = [];
                self.renderLocationTable();
            });
        },

        renderLocationTable: function () {
            const self = this;
            const $tbody = $('#locationTableBody');
            const $countBadge = $('#btnLocTableBadge');
            $tbody.empty();

            if (self.locationList.length === 0) {
                $countBadge.hide().text('0');
                $tbody.append('<tr><td colspan="3" style="text-align:center;color:#64748b;padding:16px;">暂无定位点数据</td></tr>');
                return;
            }

            $countBadge.show().text(self.locationList.length);

            self.locationList.forEach(function (item) {
                const tr = $('<tr></tr>');
                tr.append('<td><span style="color:#38bdf8;font-weight:600;">#' + item.id + '</span></td>');
                tr.append('<td><div style="font-family:monospace;font-size:11px;">' + item.lng.toFixed(5) + ', ' + item.lat.toFixed(5) + '</div></td>');

                const actionsTd = $('<td class="col-actions"></td>');
                
                // 显隐按钮
                const btnVis = $('<button type="button" class="table-action-icon-btn" title="' + (item.visible ? '隐藏' : '显示') + '"></button>');
                btnVis.html(item.visible ? 
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : 
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>');
                btnVis.on('click', function (e) {
                    e.stopPropagation();
                    item.visible = !item.visible;
                    if (item.visible) {
                        item.marker.addTo(self.map);
                    } else {
                        item.marker.remove();
                    }
                    self.renderLocationTable();
                });

                // 聚焦定位按钮
                const btnFocus = $('<button type="button" class="table-action-icon-btn" title="居中定位"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button>');
                btnFocus.on('click', function (e) {
                    e.stopPropagation();
                    self.map.flyTo({ center: [item.lng, item.lat], zoom: 15 });
                });

                // 删除按钮
                const btnDel = $('<button type="button" class="table-action-icon-btn btn-del" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>');
                btnDel.on('click', function (e) {
                    e.stopPropagation();
                    if (item.marker) item.marker.remove();
                    self.locationList = self.locationList.filter(function (i) { return i.id !== item.id; });
                    self.renderLocationTable();
                });

                actionsTd.append(btnVis).append(btnFocus).append(btnDel);
                tr.append(actionsTd);
                $tbody.append(tr);
            });
        },

        // =========================================================================
        // 4. SHP 矢量图层模块
        // =========================================================================
        initShpPanel: function () {
            const self = this;
            const $fileInput = $('#shpFileInput');
            const $folderInput = $('#shpFolderInputGeneral');
            const $dropBox = $('#shpDropBox');

            $('#btnTriggerShpFile').on('click', function () { $fileInput.trigger('click'); });
            $('#btnTriggerShpFolder').on('click', function () { $folderInput.trigger('click'); });

            $fileInput.on('change', function (e) {
                if (e.target.files.length) {
                    self.handleShpUpload(e.target.files);
                    $fileInput.val('');
                }
            });

            $folderInput.on('change', function (e) {
                if (e.target.files.length) {
                    self.handleShpUpload(e.target.files);
                    $folderInput.val('');
                }
            });

            $dropBox.on('dragover', function (e) {
                e.preventDefault();
                $(this).addClass('dragging');
            }).on('dragleave drop', function (e) {
                e.preventDefault();
                $(this).removeClass('dragging');
                if (e.type === 'drop' && e.originalEvent.dataTransfer.files.length) {
                    self.handleShpUpload(e.originalEvent.dataTransfer.files);
                }
            });

            $('#btnClearAllShp').on('click', function () {
                Object.keys(self.shpLayers).forEach(function (id) {
                    self.removeShpLayer(id);
                });
                self.shpLayers = {};
                self.renderShpLayerList();
            });
        },

        handleShpUpload: function (fileList) {
            const self = this;
            const files = Array.from(fileList);
            const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip'));

            if (zipFile) {
                const reader = new FileReader();
                reader.onload = function () {
                    if (typeof window.shp === 'function') {
                        window.shp(reader.result).then(function (geojson) {
                            if (Array.isArray(geojson)) {
                                geojson.forEach(function (gj, idx) {
                                    self.addGeoJsonLayer(gj, zipFile.name + ' [' + (idx + 1) + ']', 'shp');
                                });
                            } else {
                                self.addGeoJsonLayer(geojson, zipFile.name, 'shp');
                            }
                        }).catch(function (err) {
                            alert('SHP ZIP 文件解析失败: ' + err.message);
                        });
                    }
                };
                reader.readAsArrayBuffer(zipFile);
                return;
            }

            // 查找 .shp 与 .dbf
            const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
            if (!shpFile) {
                alert('未检测到 .shp 或 .zip 压缩包文件');
                return;
            }

            const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));
            const prjFile = files.find(f => f.name.toLowerCase().endsWith('.prj'));

            const readFileBuffer = function (file) {
                return new Promise(function (resolve) {
                    if (!file) return resolve(null);
                    const r = new FileReader();
                    r.onload = function () { resolve(r.result); };
                    r.readAsArrayBuffer(file);
                });
            };

            const readText = function (file) {
                return new Promise(function (resolve) {
                    if (!file) return resolve(null);
                    const r = new FileReader();
                    r.onload = function () { resolve(r.result); };
                    r.readAsText(file);
                });
            };

            Promise.all([readFileBuffer(shpFile), readFileBuffer(dbfFile), readText(prjFile)]).then(function ([shpBuf, dbfBuf, prjText]) {
                try {
                    const parsedShp = shp.parseShp(shpBuf, prjText);
                    const parsedDbf = dbfBuf ? shp.parseDbf(dbfBuf) : [];
                    const geojson = shp.combine([parsedShp, parsedDbf]);
                    self.addGeoJsonLayer(geojson, shpFile.name, 'shp');
                } catch (err) {
                    alert('Shapefile 解析失败: ' + err.message);
                }
            });
        },

        // =========================================================================
        // 5. JSON / GeoJSON 矢量图层模块
        // =========================================================================
        initJsonPanel: function () {
            const self = this;
            const $fileInput = $('#jsonFileInput');
            const $folderInput = $('#jsonFolderInputGeneral');
            const $dropBox = $('#jsonDropBox');

            $('#btnTriggerJsonFile').on('click', function () { $fileInput.trigger('click'); });
            $('#btnTriggerJsonFolder').on('click', function () { $folderInput.trigger('click'); });

            $fileInput.on('change', function (e) {
                if (e.target.files.length) {
                    self.handleJsonUpload(e.target.files);
                    $fileInput.val('');
                }
            });

            $folderInput.on('change', function (e) {
                if (e.target.files.length) {
                    self.handleJsonUpload(e.target.files);
                    $folderInput.val('');
                }
            });

            $dropBox.on('dragover', function (e) {
                e.preventDefault();
                $(this).addClass('dragging');
            }).on('dragleave drop', function (e) {
                e.preventDefault();
                $(this).removeClass('dragging');
                if (e.type === 'drop' && e.originalEvent.dataTransfer.files.length) {
                    self.handleJsonUpload(e.originalEvent.dataTransfer.files);
                }
            });

            $('#btnClearAllJson').on('click', function () {
                Object.keys(self.jsonLayers).forEach(function (id) {
                    self.removeJsonLayer(id);
                });
                self.jsonLayers = {};
                self.renderJsonLayerList();
            });
        },

        handleJsonUpload: function (fileList) {
            const self = this;
            Array.from(fileList).forEach(function (file) {
                if (file.name.toLowerCase().match(/\.(json|geojson|topojson)$/)) {
                    const reader = new FileReader();
                    reader.onload = function () {
                        try {
                            const data = JSON.parse(reader.result);
                            self.addGeoJsonLayer(data, file.name, 'json');
                        } catch (err) {
                            alert(file.name + ' JSON 解析失败: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                }
            });
        },

        // 通用添加 GeoJSON 图层至 MapLibre GL
        addGeoJsonLayer: function (geojson, name, type) {
            const self = this;
            if (!geojson || !geojson.features || !geojson.features.length) {
                alert(name + ' 中未提取到有效几何要素');
                return;
            }

            const colors = ['#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#eab308'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const layerId = (type === 'shp' ? 'shp_' + self.shpIdCounter++ : 'json_' + self.jsonIdCounter++);
            const srcId = 'src_' + layerId;
            const fillId = 'fill_' + layerId;
            const lineId = 'line_' + layerId;
            const circleId = 'circle_' + layerId;
            const labelId = 'label_' + layerId;

            // 提取要素属性字段名供标签选择
            const propFields = Object.keys(geojson.features[0].properties || {});

            self.map.addSource(srcId, {
                type: 'geojson',
                data: geojson
            });

            self.map.addLayer({
                id: fillId,
                type: 'fill',
                source: srcId,
                paint: {
                    'fill-color': color,
                    'fill-opacity': 0.35
                },
                filter: ['==', '$type', 'Polygon']
            });

            self.map.addLayer({
                id: lineId,
                type: 'line',
                source: srcId,
                paint: {
                    'line-color': color,
                    'line-width': 2
                }
            });

            self.map.addLayer({
                id: circleId,
                type: 'circle',
                source: srcId,
                paint: {
                    'circle-color': color,
                    'circle-radius': 5,
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 1.5
                },
                filter: ['==', '$type', 'Point']
            });

            // 计算 BoundingBox 并聚焦视野
            let bbox = null;
            if (typeof turf !== 'undefined' && turf.bbox) {
                try {
                    bbox = turf.bbox(geojson);
                    self.map.fitBounds(bbox, { padding: 60, maxZoom: 16 });
                } catch (e) { }
            }

            const layerObj = {
                id: layerId,
                name: name,
                geojson: geojson,
                color: color,
                visible: true,
                srcId: srcId,
                fillId: fillId,
                lineId: lineId,
                circleId: circleId,
                labelId: labelId,
                propFields: propFields,
                currentField: '',
                bbox: bbox
            };

            if (type === 'shp') {
                self.shpLayers[layerId] = layerObj;
                self.renderShpLayerList();
            } else {
                self.jsonLayers[layerId] = layerObj;
                self.renderJsonLayerList();
            }
        },

        removeShpLayer: function (layerId) {
            const l = this.shpLayers[layerId];
            if (!l) return;
            if (this.map.getLayer(l.labelId)) this.map.removeLayer(l.labelId);
            if (this.map.getLayer(l.circleId)) this.map.removeLayer(l.circleId);
            if (this.map.getLayer(l.lineId)) this.map.removeLayer(l.lineId);
            if (this.map.getLayer(l.fillId)) this.map.removeLayer(l.fillId);
            if (this.map.getSource(l.srcId)) this.map.removeSource(l.srcId);
            delete this.shpLayers[layerId];
        },

        removeJsonLayer: function (layerId) {
            const l = this.jsonLayers[layerId];
            if (!l) return;
            if (this.map.getLayer(l.labelId)) this.map.removeLayer(l.labelId);
            if (this.map.getLayer(l.circleId)) this.map.removeLayer(l.circleId);
            if (this.map.getLayer(l.lineId)) this.map.removeLayer(l.lineId);
            if (this.map.getLayer(l.fillId)) this.map.removeLayer(l.fillId);
            if (this.map.getSource(l.srcId)) this.map.removeSource(l.srcId);
            delete this.jsonLayers[layerId];
        },

        renderShpLayerList: function () {
            this._renderGenericLayerList('shp', this.shpLayers, '#shpLayerList');
        },

        renderJsonLayerList: function () {
            this._renderGenericLayerList('json', this.jsonLayers, '#jsonLayerList');
        },

        _renderGenericLayerList: function (type, layersObj, containerId) {
            const self = this;
            const $container = $(containerId);
            $container.empty();

            const keys = Object.keys(layersObj);
            if (keys.length === 0) {
                $container.append('<div style="text-align:center;color:#64748b;font-size:11.5px;padding:8px;">暂无加载图层</div>');
                return;
            }

            keys.forEach(function (id) {
                const layer = layersObj[id];
                const card = $('<div class="layer-item-card"></div>');

                const topRow = $('<div class="layer-card-top"></div>');
                const left = $('<div class="layer-card-left"></div>');
                left.append('<span class="layer-color-dot" style="background:' + layer.color + '"></span>');
                left.append('<span title="' + layer.name + '">' + layer.name + '</span>');

                const actions = $('<div class="layer-card-actions"></div>');
                
                // 显隐复选
                const chk = $('<input type="checkbox" ' + (layer.visible ? 'checked' : '') + ' title="显示/隐藏图层">');
                chk.on('change', function () {
                    layer.visible = this.checked;
                    const vis = this.checked ? 'visible' : 'none';
                    if (self.map.getLayer(layer.fillId)) self.map.setLayoutProperty(layer.fillId, 'visibility', vis);
                    if (self.map.getLayer(layer.lineId)) self.map.setLayoutProperty(layer.lineId, 'visibility', vis);
                    if (self.map.getLayer(layer.circleId)) self.map.setLayoutProperty(layer.circleId, 'visibility', vis);
                    if (self.map.getLayer(layer.labelId)) self.map.setLayoutProperty(layer.labelId, 'visibility', vis);
                });

                // 聚焦按钮
                const btnFocus = $('<button type="button" class="table-action-icon-btn" title="缩放到图层范围"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button>');
                btnFocus.on('click', function () {
                    if (layer.bbox) {
                        self.map.fitBounds(layer.bbox, { padding: 60, maxZoom: 16 });
                    }
                });

                // 删除按钮
                const btnDel = $('<button type="button" class="table-action-icon-btn btn-del" title="移除图层"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>');
                btnDel.on('click', function () {
                    if (type === 'shp') {
                        self.removeShpLayer(id);
                        self.renderShpLayerList();
                    } else {
                        self.removeJsonLayer(id);
                        self.renderJsonLayerList();
                    }
                });

                actions.append(chk).append(btnFocus).append(btnDel);
                topRow.append(left).append(actions);
                card.append(topRow);

                // 属性标注选择下拉
                if (layer.propFields && layer.propFields.length) {
                    const fieldRow = $('<div class="layer-field-select-row"><span>标注:</span></div>');
                    const sel = $('<select class="fungis-select layer-field-select"><option value="">-- 不标注 --</option></select>');
                    layer.propFields.forEach(function (f) {
                        sel.append('<option value="' + f + '" ' + (layer.currentField === f ? 'selected' : '') + '>' + f + '</option>');
                    });

                    sel.on('change', function () {
                        const f = $(this).val();
                        layer.currentField = f;
                        if (self.map.getLayer(layer.labelId)) {
                            self.map.removeLayer(layer.labelId);
                        }
                        if (f) {
                            self.map.addLayer({
                                id: layer.labelId,
                                type: 'symbol',
                                source: layer.srcId,
                                layout: {
                                    'text-field': ['get', f],
                                    'text-size': 11,
                                    'text-anchor': 'center',
                                    'text-allow-overlap': false
                                },
                                paint: {
                                    'text-color': '#ffffff',
                                    'text-halo-color': '#0f172a',
                                    'text-halo-width': 1.5
                                }
                            });
                        }
                    });

                    fieldRow.append(sel);
                    card.append(fieldRow);
                }

                $container.append(card);
            });
        },

        // =========================================================================
        // 6. 空间几何量算模块 (测距 / 测面)
        // =========================================================================
        initMeasure: function () {
            const self = this;
            const $btnDist = $('#btnMeasureDistance');
            const $btnArea = $('#btnMeasureArea');
            const $btnClear = $('#btnMeasureClear');
            const $tip = $('#measureTipText');

            // 预先注册量算矢量图层源
            if (!self.map.getSource('measure-source')) {
                self.map.addSource('measure-source', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                self.map.addLayer({
                    id: 'measure-fill',
                    type: 'fill',
                    source: 'measure-source',
                    paint: {
                        'fill-color': '#fbbf24',
                        'fill-opacity': 0.25
                    },
                    filter: ['==', '$type', 'Polygon']
                });

                self.map.addLayer({
                    id: 'measure-line',
                    type: 'line',
                    source: 'measure-source',
                    paint: {
                        'line-color': '#fbbf24',
                        'line-width': 2.5,
                        'line-dasharray': [2, 1]
                    }
                });

                self.map.addLayer({
                    id: 'measure-points',
                    type: 'circle',
                    source: 'measure-source',
                    paint: {
                        'circle-radius': 5,
                        'circle-color': '#fbbf24',
                        'circle-stroke-color': '#0f172a',
                        'circle-stroke-width': 2
                    },
                    filter: ['==', '$type', 'Point']
                });
            }

            $btnDist.on('click', function () {
                if (self.measure.activeTool === 'distance') {
                    self.stopMeasure();
                } else {
                    self.startMeasure('distance');
                }
            });

            $btnArea.on('click', function () {
                if (self.measure.activeTool === 'area') {
                    self.stopMeasure();
                } else {
                    self.startMeasure('area');
                }
            });

            $btnClear.on('click', function () {
                self.clearMeasure();
            });

            // 地图交互事件
            self.map.on('click', function (e) {
                if (!self.measure.activeTool) return;
                const pt = [e.lngLat.lng, e.lngLat.lat];
                self.measure.points.push(pt);
                self.updateMeasureLayers();

                // 在节点处显示段距离
                if (self.measure.activeTool === 'distance' && self.measure.points.length > 1) {
                    const line = turf.lineString(self.measure.points);
                    const distKm = turf.length(line, { units: 'kilometers' });
                    const text = distKm >= 1 ? distKm.toFixed(2) + ' km' : Math.round(distKm * 1000) + ' m';
                    self.addMeasureBadge(pt, text);
                }
            });

            self.map.on('mousemove', function (e) {
                if (!self.measure.activeTool || self.measure.points.length === 0) return;
                self.measure.activeRubberPoint = [e.lngLat.lng, e.lngLat.lat];
                self.updateMeasureLayers();
            });

            self.map.on('dblclick', function (e) {
                if (!self.measure.activeTool || self.measure.points.length < 2) return;
                e.preventDefault();
                const pts = self.measure.points;

                if (self.measure.activeTool === 'distance') {
                    const line = turf.lineString(pts);
                    const totalKm = turf.length(line, { units: 'kilometers' });
                    const totalText = '总长: ' + (totalKm >= 1 ? totalKm.toFixed(2) + ' km' : Math.round(totalKm * 1000) + ' m');
                    self.addMeasureBadge(pts[pts.length - 1], totalText, true);
                } else if (self.measure.activeTool === 'area' && pts.length >= 3) {
                    const polyPts = pts.concat([pts[0]]);
                    const poly = turf.polygon([polyPts]);
                    const areaSqM = turf.area(poly);
                    const areaText = areaSqM >= 1000000 ? 
                        '总面积: ' + (areaSqM / 1000000).toFixed(3) + ' km²' : 
                        '总面积: ' + Math.round(areaSqM) + ' m² (' + (areaSqM * 0.0015).toFixed(2) + ' 亩)';
                    const center = turf.center(poly).geometry.coordinates;
                    self.addMeasureBadge(center, areaText, true);
                }

                self.stopMeasure();
            });
        },

        startMeasure: function (tool) {
            this.measure.activeTool = tool;
            this.measure.points = [];
            this.measure.activeRubberPoint = null;
            this.map.getCanvas().style.cursor = 'crosshair';

            $('.measure-btn').removeClass('active');
            if (tool === 'distance') {
                $('#btnMeasureDistance').addClass('active');
                $('#measureTipText').text('📏 测距中：点击地图添加转折点，双击结束测距 (Esc取消)');
            } else {
                $('#btnMeasureArea').addClass('active');
                $('#measureTipText').text('📐 测面中：点击地图添加多边形顶点，双击闭合测面 (Esc取消)');
            }
        },

        stopMeasure: function () {
            this.measure.activeTool = null;
            this.measure.activeRubberPoint = null;
            this.map.getCanvas().style.cursor = '';
            $('.measure-btn').removeClass('active');
            $('#measureTipText').text('测量已完成。可点击清除按钮重置。');
            this.updateMeasureLayers();
        },

        clearMeasure: function () {
            this.stopMeasure();
            this.measure.points = [];
            this.measure.markers.forEach(function (m) { m.remove(); });
            this.measure.markers = [];
            if (this.map.getSource('measure-source')) {
                this.map.getSource('measure-source').setData({ type: 'FeatureCollection', features: [] });
            }
            $('#measureTipText').text('选择上方测距或测面工具开始测量。');
        },

        updateMeasureLayers: function () {
            if (!this.map.getSource('measure-source')) return;
            const features = [];
            const pts = this.measure.points.slice();
            if (this.measure.activeRubberPoint) {
                pts.push(this.measure.activeRubberPoint);
            }

            if (pts.length >= 2) {
                if (this.measure.activeTool === 'area' && pts.length >= 3) {
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [pts.concat([pts[0]])]
                        }
                    });
                }
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: pts
                    }
                });
            }

            this.measure.points.forEach(function (p) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: p }
                });
            });

            this.map.getSource('measure-source').setData({
                type: 'FeatureCollection',
                features: features
            });
        },

        addMeasureBadge: function (lngLat, text, isTotal) {
            const el = document.createElement('div');
            el.className = 'mlgl-measure-badge';
            if (isTotal) {
                el.style.background = '#0284c7';
                el.style.borderColor = '#38bdf8';
                el.style.color = '#ffffff';
            }
            el.innerText = text;
            const marker = new maplibregl.Marker({ element: el })
                .setLngLat(lngLat)
                .addTo(this.map);
            this.measure.markers.push(marker);
        },

        // =========================================================================
        // 7. 照片 GPS 上传与空间定位模块
        // =========================================================================
        initPhotoUpload: function () {
            const self = this;
            const $input = $('#photoFileInputGeneral');

            $('#btnPhotoUpload').on('click', function () {
                $input.trigger('click');
            });

            $input.on('change', function (e) {
                if (e.target.files.length) {
                    self.handlePhotoFiles(e.target.files);
                    $input.val('');
                }
            });

            $('#btnClosePhotoPreview').on('click', function () {
                $('#modalPhotoPreview').fadeOut(150);
            });
        },

        handlePhotoFiles: function (fileList) {
            const self = this;
            let loadedCount = 0;
            const boundsPts = [];

            Array.from(fileList).forEach(function (file) {
                if (!file.type.startsWith('image/')) return;

                if (typeof window.EXIF !== 'undefined') {
                    window.EXIF.getData(file, function () {
                        const latArr = window.EXIF.getTag(this, 'GPSLatitude');
                        const latRef = window.EXIF.getTag(this, 'GPSLatitudeRef');
                        const lngArr = window.EXIF.getTag(this, 'GPSLongitude');
                        const lngRef = window.EXIF.getTag(this, 'GPSLongitudeRef');
                        const dateStr = window.EXIF.getTag(this, 'DateTimeOriginal') || '未知拍摄时间';

                        if (latArr && lngArr) {
                            const toDecimal = function (arr, ref) {
                                const d = arr[0].numerator / arr[0].denominator;
                                const m = arr[1].numerator / arr[1].denominator;
                                const s = arr[2].numerator / arr[2].denominator;
                                let dec = d + m / 60 + s / 3600;
                                if (ref === 'S' || ref === 'W') dec = -dec;
                                return dec;
                            };

                            const lat = toDecimal(latArr, latRef);
                            const lng = toDecimal(lngArr, lngRef);

                            const url = URL.createObjectURL(file);
                            const el = document.createElement('div');
                            el.className = 'mlgl-photo-marker';
                            el.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';

                            el.addEventListener('click', function (ev) {
                                ev.stopPropagation();
                                $('#photoPreviewImg').attr('src', url);
                                $('#photoPreviewTitle').text(file.name);
                                $('#photoPreviewMeta').html('拍摄时间: <b style="color:#f8fafc;">' + dateStr + '</b><br>空间坐标: <span style="color:#38bdf8;">' + lng.toFixed(6) + ', ' + lat.toFixed(6) + '</span>');
                                $('#modalPhotoPreview').fadeIn(150);
                            });

                            const marker = new maplibregl.Marker({ element: el })
                                .setLngLat([lng, lat])
                                .addTo(self.map);

                            self.photoMarkers.push(marker);
                            boundsPts.push([lng, lat]);
                            loadedCount++;

                            if (boundsPts.length === 1) {
                                self.map.flyTo({ center: [lng, lat], zoom: 15 });
                            } else if (boundsPts.length > 1) {
                                const bbox = turf.bbox(turf.multiPoint(boundsPts));
                                self.map.fitBounds(bbox, { padding: 80, maxZoom: 16 });
                            }
                        }
                    });
                }
            });
        },

        // =========================================================================
        // 8. 浏览器实时设备定位模块
        // =========================================================================
        initCurrentLoc: function () {
            const self = this;
            const $btn = $('#btnCurrentLoc');

            $btn.on('click', function () {
                if (!navigator.geolocation) {
                    alert('您的浏览器不支持 Geolocation 地理定位功能');
                    return;
                }

                $btn.addClass('active');
                navigator.geolocation.getCurrentPosition(function (position) {
                    $btn.removeClass('active');
                    const wgsLng = position.coords.longitude;
                    const wgsLat = position.coords.latitude;

                    if (!self.userLocationMarker) {
                        const el = document.createElement('div');
                        el.className = 'mlgl-user-location-marker';
                        el.innerHTML = '<div class="mlgl-user-location-pulse"></div><div class="mlgl-user-location-dot"></div>';
                        self.userLocationMarker = new maplibregl.Marker({ element: el })
                            .setLngLat([wgsLng, wgsLat])
                            .addTo(self.map);
                    } else {
                        self.userLocationMarker.setLngLat([wgsLng, wgsLat]);
                    }

                    self.map.flyTo({
                        center: [wgsLng, wgsLat],
                        zoom: 16,
                        speed: 1.4
                    });
                }, function (err) {
                    $btn.removeClass('active');
                    alert('获取当前设备位置失败: ' + err.message);
                }, {
                    enableHighAccuracy: true,
                    timeout: 8000
                });
            });
        }
    };
})();
