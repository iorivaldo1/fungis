export class RiverRouteTool {
    constructor(map, options = {}) {
        this.map = map;
        this.routeOverlays = [];
        this.routeInfoPoints = {};
        this.isRouting = false;
        this.animFrameId = null;
        this.animZoomHandler = null;

        // 可配置的API地址和面板选择器
        this.apiUrl = options.apiUrl || 'http://localhost:8085/get_geo_pg/geo/ya_river_route';
        this.panelSelector = options.panelSelector || '#route_info_panel';
        this.bodySelector = options.bodySelector || '#route_info_body';

        this.getRoute = this.getRoute.bind(this);
        this.initPanelEvents();
    }

    initPanelEvents() {
        const panel = document.querySelector(this.panelSelector);
        if (!panel) return;

        // 阻止面板点击事件冒泡到地图
        panel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 事件代理处理定位按钮点击
        panel.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('route-locate-btn')) {
                e.stopPropagation();
                let code = e.target.getAttribute('data-code');
                let point = this.routeInfoPoints[code];
                if (!point) return;
                this.map.centerAndZoom(new window.T.LngLat(point.lng, point.lat), 18);
            }
        });
    }

    toggleRouting(btnElement, activeText = "取消路线查询", inactiveText = "获取河流路线") {
        if (!this.isRouting) {
            this.isRouting = true;
            if (btnElement) btnElement.innerText = activeText;
            this.map.addEventListener("click", this.getRoute);
        } else {
            this.isRouting = false;
            if (btnElement) btnElement.innerText = inactiveText;
            this.map.removeEventListener("click", this.getRoute);
            this.clearRouteOverlays();
        }
    }

    clearRouteOverlays() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        if (this.animZoomHandler) {
            this.map.removeEventListener("zoomend", this.animZoomHandler);
            this.animZoomHandler = null;
        }
        this.routeOverlays.forEach(ov => this.map.removeOverLay(ov));
        this.routeOverlays = [];
        this.routeInfoPoints = {};

        const body = document.querySelector(this.bodySelector);
        if (body) body.innerHTML = '';

        const panel = document.querySelector(this.panelSelector);
        if (panel) panel.style.display = 'none';
    }

    styleLabel(label, bgColor, borderColor, textColor, extraStyles = {}) {
        this.map.addOverLay(label);
        let el = typeof label.getElement === 'function' ? label.getElement() : null;
        if (!el && label.Ow) el = label.Ow;
        if (!el && label._label) el = label._label;
        if (!el) {
            const pane = document.querySelector('.tdt-label-pane') || document.querySelector('.tdt-overlay-pane');
            if (pane) el = pane.lastElementChild;
        }
        if (el) {
            el.style.backgroundColor = bgColor;
            el.style.borderColor = borderColor;
            el.style.color = textColor;
            el.style.padding = '4px 8px';
            el.style.borderRadius = '4px';
            el.style.fontSize = '12px';
            el.style.whiteSpace = 'normal';
            el.style.border = '1px solid ' + borderColor;
            el.style.maxWidth = '256px';
            el.style.wordBreak = 'keep-all';
            Object.keys(extraStyles).forEach(key => {
                el.style[key] = extraStyles[key];
            });
        }
    }

    addRouteCodeLabel(code, coord, bgColor, borderColor, textColor) {
        let codeLabel = new window.T.Label({
            text: code,
            offset: new window.T.Point(5, 0),
            position: new window.T.LngLat(coord[0], coord[1])
        });
        this.styleLabel(codeLabel, bgColor, borderColor, textColor, {
            padding: '2px 6px',
            fontWeight: 'bold',
            fontSize: '12px',
            maxWidth: 'none'
        });
        this.routeOverlays.push(codeLabel);
    }

    renderRouteInfoPanel(items) {
        let html = items.map(item => `
            <div class="route-info-row">
                <div class="route-info-code" style="background:${item.bgColor};border:1px solid ${item.borderColor};color:${item.textColor};">${item.code}</div>
                <div class="route-info-desc">${item.desc}</div>
                <button class="route-locate-btn" data-code="${item.code}">定位</button>
            </div>
        `).join('');

        const body = document.querySelector(this.bodySelector);
        if (body) body.innerHTML = html;

        const panel = document.querySelector(this.panelSelector);
        if (panel) panel.style.display = 'block';
    }

    calcLineLength(coords) {
        let len = 0;
        for (let i = 1; i < coords.length; i++) {
            const dx = coords[i][0] - coords[i - 1][0];
            const dy = coords[i][1] - coords[i - 1][1];
            len += Math.sqrt(dx * dx + dy * dy);
        }
        return len;
    }

    fitRouteToViewport(routeCoords) {
        if (!routeCoords || routeCoords.length === 0) return;
        let minLng = routeCoords[0][0];
        let maxLng = routeCoords[0][0];
        let minLat = routeCoords[0][1];
        let maxLat = routeCoords[0][1];
        routeCoords.forEach(coord => {
            minLng = Math.min(minLng, coord[0]);
            maxLng = Math.max(maxLng, coord[0]);
            minLat = Math.min(minLat, coord[1]);
            maxLat = Math.max(maxLat, coord[1]);
        });
        let lngPadding = Math.max((maxLng - minLng) * 0.1, 0.001);
        let latPadding = Math.max((maxLat - minLat) * 0.1, 0.001);
        let bounds = new window.T.LngLatBounds(
            new window.T.LngLat(minLng - lngPadding, minLat - latPadding),
            new window.T.LngLat(maxLng + lngPadding, maxLat + latPadding)
        );
        this.map.setViewport([bounds.getSouthWest(), bounds.getNorthEast()]);
    }

    getRoute(e) {
        let lng = e.lnglat.getLng();
        let lat = e.lnglat.getLat();
        let self = this;

        const _token = (() => {
            try {
                const raw = sessionStorage.getItem('fungis_user');
                if (!raw) return null;
                const d = JSON.parse(raw);
                return Date.now() > d.expireAt ? null : d.token;
            } catch { return null; }
        })();
        const _headers = _token ? { 'Authorization': `Bearer ${_token}` } : {};

        fetch(`${this.apiUrl}?lng=${lng}&lat=${lat}`, { headers: _headers })
            .then(res => res.json())
            .then(result => {
                if (result.code === 200 && result.data) {
                    self.clearRouteOverlays();

                    let rivers = [];
                    result.data.forEach((item, idx) => {
                        let name = item.name || ('河段' + (idx + 1));
                        let flowRiv = item.flowRiv || '';
                        let curLen = item.curLen || '';
                        let lines = [];
                        if (item.geometry) {
                            let geo = JSON.parse(item.geometry);
                            if (geo.type === 'MultiLineString') {
                                lines = geo.coordinates;
                            } else if (geo.type === 'LineString') {
                                lines = [geo.coordinates];
                            }
                        }
                        rivers.push({ name, flowRiv, curLen, lines });
                    });

                    let allLines = [];
                    let totalLength = 0;

                    rivers.forEach(river => {
                        river.lines.forEach(line => {
                            let points = line.map(coord => new window.T.LngLat(coord[0], coord[1]));
                            let polyline = new window.T.Polyline(points, {
                                color: "red",
                                weight: 5,
                                opacity: 1.0,
                            });
                            self.map.addOverLay(polyline);
                            self.routeOverlays.push(polyline);
                            allLines.push(line);
                            totalLength += self.calcLineLength(line);
                        });
                    });

                    if (allLines.length === 0 || totalLength === 0) return;

                    let cumLength = 0;
                    let routeInfoItems = [];
                    let routeCodeIndex = 1;
                    let routePointCircles = [];

                    let startCoord = allLines[0][0];
                    routePointCircles.push({ coord: startCoord, color: '#28a745', fillColor: '#d4edda' });
                    let startCode = 'R' + routeCodeIndex++;
                    self.routeInfoPoints[startCode] = { lng: startCoord[0], lat: startCoord[1] };
                    self.addRouteCodeLabel(startCode, startCoord, '#d4edda', '#28a745', '#155724');
                    routeInfoItems.push({
                        code: startCode, desc: `📍起点 ${rivers[0].name}`,
                        bgColor: '#d4edda', borderColor: '#28a745', textColor: '#155724'
                    });

                    for (let i = 1; i < rivers.length; i++) {
                        let prevRiver = rivers[i - 1];
                        let curRiver = rivers[i];
                        let prevLastLine = prevRiver.lines[prevRiver.lines.length - 1];
                        cumLength += self.calcLineLength(prevLastLine);
                        let juncCoord = prevLastLine[prevLastLine.length - 1];
                        routePointCircles.push({ coord: juncCoord, color: '#ffc107', fillColor: '#fff3cd' });
                        let pct = (cumLength / totalLength * 100).toFixed(1);
                        let juncCode = 'R' + routeCodeIndex++;
                        self.routeInfoPoints[juncCode] = { lng: juncCoord[0], lat: juncCoord[1] };
                        self.addRouteCodeLabel(juncCode, juncCoord, '#fff3cd', '#ffc107', '#856404');
                        routeInfoItems.push({
                            code: juncCode, desc: `🔀${pct}% ${prevRiver.name}汇入${curRiver.name}`,
                            bgColor: '#fff3cd', borderColor: '#ffc107', textColor: '#856404'
                        });
                    }

                    let lastLine = allLines[allLines.length - 1];
                    let endCoord = lastLine[lastLine.length - 1];
                    routePointCircles.push({ coord: endCoord, color: '#dc3545', fillColor: '#f8d7da' });
                    let lastRiver = rivers[rivers.length - 1];
                    let endFlowInfo = lastRiver.flowRiv ? ` →${lastRiver.flowRiv}` : '';
                    let endCode = 'R' + routeCodeIndex++;
                    self.routeInfoPoints[endCode] = { lng: endCoord[0], lat: endCoord[1] };
                    self.addRouteCodeLabel(endCode, endCoord, '#f8d7da', '#dc3545', '#721c24');
                    routeInfoItems.push({
                        code: endCode, desc: `🏁终点 ${lastRiver.name}${endFlowInfo}`,
                        bgColor: '#f8d7da', borderColor: '#dc3545', textColor: '#721c24'
                    });

                    self.renderRouteInfoPanel(routeInfoItems);

                    let routeCoords = [];
                    allLines.forEach(line => {
                        line.forEach(coord => routeCoords.push(coord));
                    });
                    self.fitRouteToViewport(routeCoords);

                    if (routeCoords.length >= 2) {
                        let segDists = [0];
                        for (let i = 1; i < routeCoords.length; i++) {
                            const dx = routeCoords[i][0] - routeCoords[i - 1][0];
                            const dy = routeCoords[i][1] - routeCoords[i - 1][1];
                            segDists.push(segDists[i - 1] + Math.sqrt(dx * dx + dy * dy));
                        }
                        let totalDist = segDists[segDists.length - 1];

                        let dotPixelDiameter = 10;
                        let dotPixelRadius = dotPixelDiameter / 2;
                        let routeLat = routeCoords[0][1];
                        let metersPerPixelAtEquator = 156543.03392804097;
                        let animDotRadiusByZoom = {};
                        for (let z = 3; z <= 18; z++) {
                            let metersPerPixel = metersPerPixelAtEquator * Math.cos(routeLat * Math.PI / 180) / Math.pow(2, z);
                            animDotRadiusByZoom[z] = dotPixelRadius * metersPerPixel;
                        }
                        let initZoom = Math.round(self.map.getZoom());
                        initZoom = Math.max(3, Math.min(18, initZoom));
                        let routeStaticCircles = [];
                        routePointCircles.forEach(item => {
                            let circle = new window.T.Circle(
                                new window.T.LngLat(item.coord[0], item.coord[1]),
                                animDotRadiusByZoom[initZoom],
                                { color: item.color, weight: 1, opacity: 1, fillColor: item.fillColor, fillOpacity: 1 }
                            );
                            self.map.addOverLay(circle);
                            self.routeOverlays.push(circle);
                            routeStaticCircles.push(circle);
                        });

                        let animDot = new window.T.Circle(
                            new window.T.LngLat(routeCoords[0][0], routeCoords[0][1]),
                            animDotRadiusByZoom[initZoom],
                            { color: '#0052ff', weight: 1, opacity: 1, fillColor: '#00aaff', fillOpacity: 1 }
                        );
                        self.map.addOverLay(animDot);
                        self.routeOverlays.push(animDot);

                        function updateAnimDotRadius() {
                            let zoom = Math.round(self.map.getZoom());
                            zoom = Math.max(3, Math.min(18, zoom));
                            let radius = animDotRadiusByZoom[zoom];
                            animDot.setRadius(radius);
                            routeStaticCircles.forEach(circle => circle.setRadius(radius));
                        }
                        self.animZoomHandler = updateAnimDotRadius;
                        self.map.addEventListener("zoomend", self.animZoomHandler);

                        let duration = 16000;
                        let startTime = null;

                        function animateRouteDot(timestamp) {
                            if (!startTime) startTime = timestamp;
                            let progress = ((timestamp - startTime) % duration) / duration;
                            let targetDist = progress * totalDist;

                            let lo = 0;
                            let hi = segDists.length - 1;
                            while (lo < hi - 1) {
                                let mid = (lo + hi) >> 1;
                                if (segDists[mid] <= targetDist) {
                                    lo = mid;
                                } else {
                                    hi = mid;
                                }
                            }

                            let segLen = segDists[hi] - segDists[lo];
                            let t = segLen > 0 ? (targetDist - segDists[lo]) / segLen : 0;
                            let lng = routeCoords[lo][0] + t * (routeCoords[hi][0] - routeCoords[lo][0]);
                            let lat = routeCoords[lo][1] + t * (routeCoords[hi][1] - routeCoords[lo][1]);

                            animDot.setCenter(new window.T.LngLat(lng, lat));
                            self.animFrameId = requestAnimationFrame(animateRouteDot);
                        }
                        self.animFrameId = requestAnimationFrame(animateRouteDot);
                    }
                } else {
                    alert("获取路径失败或没有下游路径");
                }
            })
            .catch(err => console.error(err));
    }
}
