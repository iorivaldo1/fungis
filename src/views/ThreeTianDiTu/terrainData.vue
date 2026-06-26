<template>
    <div class="test-page">
        <div class="no-select" id="map"></div>
        <button class="no-select" id="getDem" @click="HD1">T</button>

        <div class="no-select" id="coordSwitchButton">
            <span>显示坐标</span>
            <button class="switch" @click="toggleCoord">
                <span class="switch_circle" :class="{ 'circle_right': showCoord, 'circle_left': !showCoord }"></span>
            </button>
            <div id="coordInfoContainer" v-show="showCoord">
                <span id="coord">{{ coordInfo }}</span>
            </div>
        </div>

        <div class="viewer_3d" id="Window_3D" :style="{ visibility: show3DWindow ? 'visible' : 'hidden' }">
            <div class="v_header">
                <span>DEM来源:FABDEM | DOM来源:天地图</span>
                <div class="header_controls">
                    <button class="viewer_ctrl_btns" id="reloadScene1" title="Reload View"
                        @click="resetCamera">R</button>
                    <button class="viewer_ctrl_btns close-btn" id="clo_con1" title="Close"
                        @click="close3DWindow">X</button>
                </div>
            </div>
            <div class="three_container" id="threeCon1" ref="threeContainer"></div>
            <div class="sh_ctr_group">
                <div class="sw_container no-select" @click="toggleRiver">
                    <span>河流</span>
                    <button class="switch" :class="{ 'switch_active': showRiver }">
                        <span class="switch_circle"
                            :class="{ 'circle_right': showRiver, 'circle_left': !showRiver }"></span>
                    </button>
                </div>
                <div class="sw_container no-select" @click="toggleBridge">
                    <span>桥梁</span>
                    <button class="switch" :class="{ 'switch_active': showBridge }">
                        <span class="switch_circle"
                            :class="{ 'circle_right': showBridge, 'circle_left': !showBridge }"></span>
                    </button>
                </div>
                <div class="sw_container no-select" @click="toggleClickQuery">
                    <span>点击查询</span>
                    <button class="switch" :class="{ 'switch_active': showClickQuery }">
                        <span class="switch_circle"
                            :class="{ 'circle_right': showClickQuery, 'circle_left': !showClickQuery }"></span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 页面说明 -->
        <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
            <div class="info-container" v-if="showPageInfo">
                <div class="info-header">
                    <div class="info-title">📌 页面说明</div>
                    <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
                </div>
                <div class="info-section-title">🗺️ 地形生成</div>
                <div class="info-item">• 点击左下角 <kbd>T</kbd> 按钮激活框选工具，在地图上框选区域生成3D地形</div>
                <div class="info-item">• 数据覆盖范围：雅安市（地图上蓝色虚线框区域）</div>
                <div class="info-item">• 框选边长限制：≤ 0.08° (约 8km)，过大会影响服务器性能</div>
                <div class="info-section-title">📡 数据来源</div>
                <div class="info-item">• <strong>DEM</strong>：自建 GeoServer WCS 服务，数据源 FABDEM，空间分辨率 30m</div>
                <div class="info-item">• <strong>DOM</strong>：天地图 WMTS 影像服务，固定 Zoom 18 级，分辨率约 1.2m</div>
                <div class="info-section-title">🧭 3D 窗口操作</div>
                <div class="info-item">• 拖拽标题栏移动窗口，拖拽边缘调整窗口大小</div>
                <div class="info-item">• 鼠标左键旋转视角，右键平移，滚轮缩放</div>
                <div class="info-item">• 点击 <kbd>R</kbd> 重置相机视角，点击 <kbd>X</kbd> 关闭窗口</div>
                <div class="info-section-title">🔧 功能开关</div>
                <div class="info-item">• <strong>河流</strong> / <strong>桥梁</strong>：控制 3D 场景中河流线与桥梁标注的显示</div>
                <div class="info-item">• <strong>点击查询</strong>：开启后可点击 3D 地形或二维地图查询经纬度与高程信息</div>
                <div class="info-item">• <strong>显示坐标</strong>：左上角开关，鼠标悬停时实时显示地图坐标</div>
            </div>
            <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
                <span>📌</span>
            </div>
        </div>

        <!-- Simple Loading Overlay -->
        <div v-if="loading" class="loading-overlay">
            <div class="loading-spinner"></div>
            <div>Loading Data...</div>
        </div>

        <!-- 下载进度条 -->
        <div v-if="showDownloadProgress" class="progress-overlay">
            <div class="progress-container">
                <div class="progress-title">📥 正在下载瓦片...</div>
                <div class="progress-info">
                    <span>已下载: {{ loadedTiles }} / {{ totalTiles }}</span>
                    <span>{{ Math.round(downloadProgress) }}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: downloadProgress + '%' }"></div>
                </div>
            </div>
        </div>

        <!-- 确认对话框遮罩 -->
        <div v-if="showTileInfo" class="dialog-overlay">
            <div class="confirm-dialog">
                <div class="dialog-title">📊 确认下载</div>
                <div class="dialog-content">
                    <div class="dialog-item">瓦片数量: <strong>{{ tileCount }}</strong> 张</div>
                    <div class="dialog-item">Zoom等级: 18</div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn-confirm-dialog" @click="confirmDownload">✓ 确认下载</button>
                    <button class="btn-cancel-dialog" @click="cancelSelection">✕ 取消</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

import { clearOverLays, lngLatToTile, c_dom_img_cia_lv, setDEMUrl, setSourceBounds, getBbox, cal_riv_intersects } from './utills_tianditu.js'
import { c_mesh_dem, c_polyline_riv_animate, createScene, c_bridge, deleteGroup, calFontSizeByGeoBBox } from './utils_three.js'
import { dash_line_flow_vs2, dash_line_flow_fs2, ring_wave_vs2, ring_wave_fs2 } from '../../utils/riverShaders.js'

const riverShaderVS1 = `
            attribute float lineProgress;
            varying float vProgress;
            varying vec2 vUv;
            
            void main() {
                vProgress = lineProgress;
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

const riverShaderFS1 = `
            uniform sampler2D colorTexture;
            varying float vProgress;
            varying vec2 vUv;
            uniform float time;
            
            void main() {
                vec2 animatedTexCoord = vec2(fract(vProgress - time), vUv.y);
                vec4 textureColor = texture2D(colorTexture, animatedTexCoord);
                gl_FragColor = textureColor;
            }
        `;

// State
const showCoord = ref(false)
const coordInfo = ref('')
const show3DWindow = ref(false)
const showRiver = ref(true)
const showBridge = ref(true)
const showClickQuery = ref(false)
const showPageInfo = ref(true)
const loading = ref(false)
const threeContainer = ref(null)

// Download Progress State
const showTileInfo = ref(false)
const tileCount = ref(0)
const showDownloadProgress = ref(false)
const downloadProgress = ref(0)
const totalTiles = ref(0)
const loadedTiles = ref(0)

// Pending State
let pendingBbox = null

let map = null
let recTool = null
let demOverLayerList = []
let scene1, camera1, renderer1, control1
let animationId
let river_line_material = null
let brdige_lable_line_material = null
let click_query_label_line_material = null
let click_ring_material = null
let click_geo_marker_query = null
let click_geo_marker_ring = null
let currentRect = null

//2D_3D共享数据
let river_list = []
let bridge_list = []


const makeDraggableAndResizable = (el) => {
    if (!el) return;

    // Header for dragging
    const header = el.querySelector('.v_header');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseDown = (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = el.offsetLeft;
        initialTop = el.offsetTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault(); // Prevent text selection
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
        // Removed right/bottom constraints to allow free movement for now
    };

    const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    if (header) {
        header.style.cursor = 'move';
        header.addEventListener('mousedown', onMouseDown);
    }

    // Resizing (Multi-directional)
    const createHandle = (cursor, posStyles, direction) => {
        let h = document.createElement('div');
        h.className = `resize-handle-${direction}`;
        Object.assign(h.style, {
            position: 'absolute', zIndex: '10', cursor: cursor, ...posStyles
        });
        el.appendChild(h);
        h.addEventListener('mousedown', (e) => onResizeDown(e, direction));
        return h;
    };

    // Ensure handles exist
    if (!el.querySelector('.resize-handle-se')) {
        createHandle('se-resize', { width: '15px', height: '15px', right: '0', bottom: '0' }, 'se'); // Bottom-Right
        createHandle('e-resize', { width: '5px', height: '100%', right: '0', top: '0' }, 'e');   // Right
        createHandle('w-resize', { width: '5px', height: '100%', left: '0', top: '0' }, 'w');    // Left
        createHandle('sw-resize', { width: '15px', height: '15px', left: '0', bottom: '0' }, 'sw'); // Bottom-Left
    }

    let isResizing = false;
    let startW, startH, resizeStartX, resizeStartY, startLeft;
    let currentDir = '';

    const onResizeDown = (e, dir) => {
        isResizing = true;
        currentDir = dir;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        startW = el.offsetWidth;
        startH = el.offsetHeight;
        startLeft = el.offsetLeft;

        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeUp);
        e.stopPropagation();
        e.preventDefault();
    };

    const onResizeMove = (e) => {
        if (!isResizing) return;

        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;

        let newW = startW;
        let newH = startH;
        let newLeft = startLeft;

        // Handle Horizontal
        if (currentDir.includes('e')) {
            newW = startW + dx;
        } else if (currentDir.includes('w')) {
            newW = startW - dx;
            newLeft = startLeft + dx;
        }

        // Handle Vertical (only for bottom corners/edges ideally, but here corners handle height too)
        // User asked for "Left, Bottom-Left, Right" resizing. 
        // 'se', 'sw' involve height change. 'e', 'w' usually just width? 
        // Assuming 'Right' means drag right edge -> width change. 
        // 'Bottom-Left' means drag corner -> width & height change.
        if (currentDir.includes('s')) {
            newH = startH + dy;
        }

        // Apply constraints
        if (newW > 200 && newH > 200) {
            el.style.width = `${newW}px`;
            el.style.height = `${newH}px`;
            if (currentDir.includes('w')) {
                el.style.left = `${newLeft}px`;
            }

            // Update Three.js
            if (camera1 && renderer1) {
                camera1.aspect = (newW) / (newH - 40);
                camera1.updateProjectionMatrix();
                renderer1.setSize(newW, newH - 40);
            }
        }
    };

    const onResizeUp = () => {
        isResizing = false;
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeUp);
    };
}

// Main Functions
const toggleCoord = () => {
    showCoord.value = !showCoord.value
    if (showCoord.value) {
        map.addEventListener('mousemove', onMapMousemove)
    } else {
        map.removeEventListener('mousemove', onMapMousemove)
    }
}

const onMapMousemove = (e) => {
    const jd = e.lnglat.getLng().toFixed(5)
    const wd = e.lnglat.getLat().toFixed(5)
    coordInfo.value = `经度:${jd}:纬度${wd}`
}

const resetCamera = () => {
    if (camera1) camera1.position.set(0, 5, 6.5)
}

const close3DWindow = () => {
    show3DWindow.value = false
    clearOverLays(map, demOverLayerList)
    if (recTool) recTool.clear()
    // 清理点击查询 canvas 监听器
    if (renderer1 && renderer1.domElement._clickQueryCleanup) {
        renderer1.domElement._clickQueryCleanup()
        delete renderer1.domElement._clickQueryCleanup
    }
    click_query_label_line_material = null
    click_ring_material = null
    click_geo_marker_query = null
    click_geo_marker_ring = null
    currentRect = null
    showClickQuery.value = false
}

const startTerrainGeneration = async (bbox_geo_expand) => {
    // Reset progress
    downloadProgress.value = 0
    loadedTiles.value = 0
    showRiver.value = true  // 重置河流显示状态
    showBridge.value = true // 重置桥梁显示状态
    showClickQuery.value = false // 重置点击查询显示状态
    click_query_label_line_material = null
    click_ring_material = null
    click_geo_marker_query = null
    click_geo_marker_ring = null

    loading.value = true
    try {

        // Draw Rect
        const rectPts = [
            new window.T.LngLat(bbox_geo_expand.getSouthWest().getLng(), bbox_geo_expand.getSouthWest().getLat()),
            new window.T.LngLat(bbox_geo_expand.getSouthWest().getLng(), bbox_geo_expand.getNorthEast().getLat()),
            new window.T.LngLat(bbox_geo_expand.getNorthEast().getLng(), bbox_geo_expand.getNorthEast().getLat()),
            new window.T.LngLat(bbox_geo_expand.getNorthEast().getLng(), bbox_geo_expand.getSouthWest().getLat())
        ]
        const rect = new window.T.Polygon(rectPts, { fillColor: 'green', fillOpacity: 0.001 })
        map.addOverLay(rect)
        demOverLayerList.push(rect)
        currentRect = rect
        recTool.clear()

        // 计算并绘制bbox内的河流
        const river_ins_list = cal_riv_intersects(river_list, bbox_geo_expand, map, demOverLayerList)

        // Fetch DEM (Assuming the URL is constructed based on bbox_geo_expand, need to reconstruct it here)
        const minX = bbox_geo_expand.getSouthWest().lng
        const minY = bbox_geo_expand.getSouthWest().lat
        const maxX = bbox_geo_expand.getNorthEast().lng
        const maxY = bbox_geo_expand.getNorthEast().lat
        const layerName = 'elevation:sc_dem_fab'
        const DEMUrl = `${import.meta.env.VITE_API_BASE_URL}/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${layerName}&format=image/tiff&subset=Long(${minX},${maxX})&subset=Lat(${minY},${maxY})`

        const demResp = await fetch(DEMUrl)
        const demArrayBuffer = await demResp.arrayBuffer()

        // Clear Three Objects
        const old_mesh = scene1.getObjectByName('mesh_dem')
        if (old_mesh) {
            old_mesh.geometry.dispose()
            old_mesh.material.dispose()
            scene1.remove(old_mesh)
        }

        const [mesh_dem, minEle, maxEle, geometry] = await c_mesh_dem(demArrayBuffer, camera1, 'mesh_dem')

        const box3 = new THREE.Box3().setFromObject(mesh_dem);
        const textureLoader = new THREE.TextureLoader();
        const colorTexture = textureLoader.load('/images/spriteLine.png');

        river_line_material = new THREE.ShaderMaterial({
            uniforms: {
                // 定义一个颜色uniform
                colorTexture: { value: colorTexture },
                time: { value: 0 }
            },
            vertexShader: riverShaderVS1,
            fragmentShader: riverShaderFS1,
        });
        const riv_group = await c_polyline_riv_animate(scene1, mesh_dem, box3, river_ins_list, bbox_geo_expand, river_line_material)

        brdige_lable_line_material = await c_bridge(scene1, mesh_dem, bridge_list, bbox_geo_expand)
        const showProgress = totalTiles.value > 200
        if (showProgress) {
            showDownloadProgress.value = true
        }

        const domCanvas = await c_dom_img_cia_lv(bbox_geo_expand, 18, { showProgress, loadedTiles, totalTiles, downloadProgress })
        const texture = new THREE.CanvasTexture(domCanvas)
        texture.colorSpace = THREE.SRGBColorSpace

        const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
        mesh_dem.material = mat
        scene1.add(mesh_dem)

        // 初始化点击查询功能
        initThreeClick(currentRect, map, scene1, renderer1, camera1, mesh_dem, bbox_geo_expand, minEle, maxEle)

        show3DWindow.value = true
        // Enable dragging/resizing after showing
        setTimeout(() => {
            makeDraggableAndResizable(document.getElementById('Window_3D'))
        }, 100)

    } catch (e) {
        console.error(e)
        alert("Error loading data")
    } finally {
        loading.value = false
        showDownloadProgress.value = false
    }
}

const confirmDownload = () => {
    showTileInfo.value = false
    if (pendingBbox) {
        startTerrainGeneration(pendingBbox)
        pendingBbox = null // Clear after use
    }
}

const cancelSelection = () => {
    showTileInfo.value = false
    recTool.clear()
    pendingBbox = null
}

const HD1 = async () => {
    clearOverLays(map, demOverLayerList)
    show3DWindow.value = false // Reset visibility first
    if (recTool) {
        recTool.clear()
        recTool.open()
        const bbox_geo = await getBbox(recTool)

        const x_range = bbox_geo.getNorthEast().lng - bbox_geo.getSouthWest().lng
        const y_range = bbox_geo.getNorthEast().lat - bbox_geo.getSouthWest().lat

        if (x_range >= 0.08 || y_range >= 0.08) {
            alert('框选范围过大！请重新选择范围')
            recTool.clear()
            return
        } else if (x_range <= 0.0003 || y_range <= 0.0003) {
            alert('框选范围过小！请重新选择范围')
            recTool.clear()
            return
        }

        // Calculate Expanded BBox using setDEMUrl
        const [DEMUrl, bounds] = await setDEMUrl('elevation:sc_dem_fab', bbox_geo)
        const bbox_geo_expand = new window.T.LngLatBounds(
            new window.T.LngLat(bounds[0], bounds[1]),
            new window.T.LngLat(bounds[2], bounds[3])
        )

        // Calculate Tile Count using the EXPANDED BBox
        const zoom = 18
        const expMinX = bbox_geo_expand.getSouthWest().lng
        const expMinY = bbox_geo_expand.getSouthWest().lat
        const expMaxX = bbox_geo_expand.getNorthEast().lng
        const expMaxY = bbox_geo_expand.getNorthEast().lat

        const nw = lngLatToTile(expMinX, expMaxY, zoom)
        const ne = lngLatToTile(expMaxX, expMaxY, zoom)
        const sw = lngLatToTile(expMinX, expMinY, zoom)
        const se = lngLatToTile(expMaxX, expMinY, zoom)

        const minCol = Math.min(nw[0], sw[0])
        const maxCol = Math.max(ne[0], se[0])
        const minRow = Math.min(ne[1], se[1])
        const maxRow = Math.max(nw[1], sw[1])

        const count = (maxCol - minCol + 1) * (maxRow - minRow + 1)
        // Double the count because we download IMG and CIA
        tileCount.value = count * 2
        totalTiles.value = count * 2

        if (tileCount.value > 200) {
            pendingBbox = bbox_geo_expand
            showTileInfo.value = true
        } else {
            startTerrainGeneration(bbox_geo_expand)
        }
    }
}

const loadTianditu = () => {
    return new Promise((resolve) => {
        if (window.T) return resolve()
        const script = document.createElement('script')
        script.src = '/tianditu.api.js'
        script.onload = resolve
        document.head.appendChild(script)
    })
}

const toggleRiver = () => {
    if (!scene1) return
    const group = scene1.getObjectByName('river_group')
    if (group) {
        showRiver.value = !showRiver.value
        group.traverse(s => {
            s.visible = showRiver.value
        })
    }
}

const toggleBridge = () => {
    if (!scene1) return
    const group = scene1.getObjectByName('bridge_group')
    if (group) {
        showBridge.value = !showBridge.value
        group.traverse(s => {
            s.visible = showBridge.value
        })
    }
}

const toggleClickQuery = () => {
    if (!scene1) return
    const queryGroup = scene1.getObjectByName('three_click_query_group')
    const ringGroup = scene1.getObjectByName('three_click_ring_group')
    showClickQuery.value = !showClickQuery.value
    if (queryGroup) queryGroup.traverse(s => { s.visible = showClickQuery.value })
    if (ringGroup) ringGroup.traverse(s => { s.visible = showClickQuery.value })
    if (click_geo_marker_query) {
        if (showClickQuery.value) {
            click_geo_marker_query.show()
            click_geo_marker_ring.show()
        } else {
            click_geo_marker_query.hide()
            click_geo_marker_ring.hide()
        }
    }
}

function createCoordSprite(longitude, latitude, elevation, point, text_color, fontSize) {
    const scale = fontSize <= 8 ? 8 : 4
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const baseWidth = 256, baseHeight = 256
    canvas.width = baseWidth * scale
    canvas.height = baseHeight * scale
    context.scale(scale, scale)
    context.font = `bold ${fontSize}px Arial, sans-serif`
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    const lines = [`经度：${longitude}`, `纬度：${latitude}`, `高程：${elevation}`]
    const lineHeight = fontSize * 1.2
    const maxTextWidth = Math.max(...lines.map(l => context.measureText(l).width))
    const textHeight = lines.length * lineHeight
    const paddingH = Math.max(2, fontSize * 0.4)
    const paddingV = Math.max(1, fontSize * 0.3)
    const bgWidth = maxTextWidth + paddingH * 2
    const bgHeight = textHeight + paddingV * 2
    const centerX = baseWidth / 2, centerY = baseHeight / 2
    const alignedBgX = Math.floor(centerX - bgWidth / 2) + 0.5
    const alignedBgY = Math.floor(centerY - bgHeight / 2) + 0.5
    context.fillStyle = '#1e485a'
    context.fillRect(alignedBgX, alignedBgY, Math.floor(bgWidth), Math.floor(bgHeight))
    context.fillStyle = text_color
    lines.forEach((line, i) => {
        const textY = Math.floor(centerY - textHeight / 2 + lineHeight / 2 + i * lineHeight) + 0.5
        context.fillText(line, alignedBgX + paddingH, textY)
    })
    const texture = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(mat)
    sprite.position.copy(point)
    sprite.userData = { longitude, latitude, elevation, textColor: text_color, fontSize }
    return sprite
}

function updateCoordSprite(sprite, newPosition, newLon, newLat, newEle) {
    const material = sprite.material
    const oldTexture = material.map
    const { fontSize, textColor } = sprite.userData
    const scale = fontSize <= 8 ? 8 : 4
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const baseWidth = 256, baseHeight = 256
    canvas.width = baseWidth * scale
    canvas.height = baseHeight * scale
    context.scale(scale, scale)
    context.font = `bold ${fontSize}px Arial, sans-serif`
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    const lines = [`经度：${newLon}`, `纬度：${newLat}`, `高程：${newEle}`]
    const lineHeight = fontSize * 1.2
    const maxTextWidth = Math.max(...lines.map(l => context.measureText(l).width))
    const textHeight = lines.length * lineHeight
    const paddingH = Math.max(2, fontSize * 0.4)
    const paddingV = Math.max(1, fontSize * 0.3)
    const bgWidth = maxTextWidth + paddingH * 2
    const bgHeight = textHeight + paddingV * 2
    const centerX = baseWidth / 2, centerY = baseHeight / 2
    const alignedBgX = Math.floor(centerX - bgWidth / 2) + 0.5
    const alignedBgY = Math.floor(centerY - bgHeight / 2) + 0.5
    context.fillStyle = '#1e485a'
    context.fillRect(alignedBgX, alignedBgY, Math.floor(bgWidth), Math.floor(bgHeight))
    context.fillStyle = textColor
    lines.forEach((line, i) => {
        const textY = Math.floor(centerY - textHeight / 2 + lineHeight / 2 + i * lineHeight) + 0.5
        context.fillText(line, alignedBgX + paddingH, textY)
    })
    material.map = new THREE.CanvasTexture(canvas)
    material.needsUpdate = true
    if (oldTexture) oldTexture.dispose()
    if (newPosition) sprite.position.copy(newPosition)
    Object.assign(sprite.userData, { longitude: newLon, latitude: newLat, elevation: newEle })
}

const initThreeClick = (drawRect, tdtMap, sceneRef, renderRef, cameraRef, demMesh, bboxGeo, minEle, maxEle) => {
    deleteGroup(sceneRef, 'three_click_query_group')
    const clickQueryGroup = new THREE.Group()
    clickQueryGroup.name = 'three_click_query_group'
    deleteGroup(sceneRef, 'three_click_ring_group')
    const clickRingGroup = new THREE.Group()
    clickRingGroup.name = 'three_click_ring_group'

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const box3 = new THREE.Box3().setFromObject(demMesh)
    const fontSize = calFontSizeByGeoBBox(bboxGeo)

    const geo_min_x = bboxGeo.getSouthWest().getLng()
    const geo_min_y = bboxGeo.getSouthWest().getLat()
    const geo_max_x = bboxGeo.getNorthEast().getLng()
    const geo_max_y = bboxGeo.getNorthEast().getLat()
    const geo_w = geo_max_x - geo_min_x
    const geo_h = geo_max_y - geo_min_y
    const dem_w = box3.max.x - box3.min.x
    const dem_h = box3.max.z - box3.min.z
    const mesh_col = demMesh.geometry.parameters.widthSegments
    const mesh_row = demMesh.geometry.parameters.heightSegments
    const spere_radius = 100 / Math.min(mesh_col / geo_w, mesh_row / geo_h)

    // 指示线
    const dash_sp = new THREE.Vector3(0, 0, 0)
    const dash_ep = dash_sp.clone().setY(spere_radius * 6)
    const label_line_mat = new THREE.ShaderMaterial({
        vertexShader: dash_line_flow_vs2,
        fragmentShader: dash_line_flow_fs2,
        uniforms: { time: { value: 0.0 }, line_len: { value: dash_ep.distanceTo(dash_sp) } }
    })
    const label_line_mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([dash_sp, dash_ep]), label_line_mat)
    label_line_mesh.position.set(-99999, -99999, -99999)
    label_line_mesh.renderOrder = 999
    label_line_mesh.frustumCulled = false

    // 坐标标注 Sprite
    const query_info = createCoordSprite(0, 0, 0, new THREE.Vector3(-99999, -99999, -99999), '#ffffff', fontSize)
    query_info.renderOrder = 1000

    // 扩散圆环（与DEM共用geometry）
    const ring_mat = new THREE.ShaderMaterial({
        vertexShader: ring_wave_vs2,
        fragmentShader: ring_wave_fs2,
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
            circleCenter: { value: new THREE.Vector3(-99999, -99999, -99999) },
            circleRadius: { value: 0.5 },
            originalColor: { value: new THREE.Color('#436743') },
            time: { value: 0.0 }
        }
    })
    const ring_mesh = new THREE.Mesh(demMesh.geometry, ring_mat)
    ring_mesh.rotateX(-Math.PI / 2)
    ring_mesh.position.set(0, 0.0001, 0)

    clickQueryGroup.add(label_line_mesh)
    clickQueryGroup.add(query_info)
    clickRingGroup.add(ring_mesh)
    sceneRef.add(clickQueryGroup)
    sceneRef.add(clickRingGroup)

    // 初始隐藏（由开关控制）
    clickQueryGroup.traverse(s => { s.visible = false })
    clickRingGroup.traverse(s => { s.visible = false })

    // TDT 标注
    click_geo_marker_query = new window.T.Marker(new window.T.LngLat(0, 0))
    tdtMap.addOverLay(click_geo_marker_query)
    demOverLayerList.push(click_geo_marker_query)
    click_geo_marker_query.hide()

    click_geo_marker_ring = new window.T.Marker(new window.T.LngLat(0, 0))
    tdtMap.addOverLay(click_geo_marker_ring)
    demOverLayerList.push(click_geo_marker_ring)
    click_geo_marker_ring.hide()

    // 3D 窗口点击事件（mousedown + mouseup 区分拖拽与点击）
    const canvasEl = renderRef.domElement
    if (canvasEl._clickQueryCleanup) canvasEl._clickQueryCleanup()
    let mouseDownTime = 0
    const onMD = () => { mouseDownTime = Date.now() }
    const onMU = (e) => {
        if (Date.now() - mouseDownTime < 200) ThreeClickHD(e)
        mouseDownTime = 0
    }
    canvasEl.addEventListener('mousedown', onMD)
    canvasEl.addEventListener('mouseup', onMU)
    canvasEl._clickQueryCleanup = () => {
        canvasEl.removeEventListener('mousedown', onMD)
        canvasEl.removeEventListener('mouseup', onMU)
    }

    function calcGeoCoord(pointX, pointZ) {
        const p_x = pointX + dem_w / 2
        const p_z = dem_h / 2 - pointZ
        return [
            (geo_min_x + (p_x * geo_w) / dem_w).toFixed(5),
            (geo_min_y + (p_z * geo_h) / dem_h).toFixed(5)
        ]
    }

    function applyClickResult(point) {
        const ep = point.clone().setY(point.y + spere_radius * 6)
        const ele = (point.y * (maxEle - minEle) + minEle).toFixed(2)
        const [lon, lat] = calcGeoCoord(point.x, point.z)
        label_line_mesh.position.copy(point)
        ring_mat.uniforms.circleCenter.value = new THREE.Vector3(point.x, 0, point.z)
        updateCoordSprite(query_info, ep, lon, lat, ele)
        click_geo_marker_query.setLngLat(new window.T.LngLat(lon, lat))
        click_geo_marker_ring.setLngLat(new window.T.LngLat(lon, lat))
    }

    function ThreeClickHD(event) {
        if (!showClickQuery.value) return
        const rect = canvasEl.getBoundingClientRect()
        mouse.x = ((event.clientX - rect.left) / canvasEl.clientWidth) * 2 - 1
        mouse.y = -((event.clientY - rect.top) / canvasEl.clientHeight) * 2 + 1
        raycaster.setFromCamera(mouse, cameraRef)
        const hits = raycaster.intersectObjects([demMesh])
        if (hits.length > 0) applyClickResult(hits[0].point)
    }

    // TDT 地图点击事件
    if (drawRect) {
        drawRect.removeEventListener('mousedown')
        drawRect.addEventListener('mousedown', e => {
            if (!showClickQuery.value) return
            const jd = e.lnglat.lng
            const wd = e.lnglat.lat
            click_geo_marker_query.setLngLat(new window.T.LngLat(jd, wd))
            click_geo_marker_ring.setLngLat(new window.T.LngLat(jd, wd))
            const tx = ((jd - geo_min_x) * dem_w) / geo_w - dem_w / 2
            const tz = dem_h / 2 - ((wd - geo_min_y) * dem_h) / geo_h
            const startY = (demMesh.geometry.boundingBox ? demMesh.geometry.boundingBox.max.y : 2) + 10
            raycaster.set(new THREE.Vector3(tx, startY, tz), new THREE.Vector3(0, -1, 0))
            const hits = raycaster.intersectObjects([demMesh])
            if (hits.length > 0) {
                const point = hits[0].point
                const ep = point.clone().setY(point.y + spere_radius * 6)
                const ele = (point.y * (maxEle - minEle) + minEle).toFixed(2)
                const [lon, lat] = calcGeoCoord(point.x, point.z)
                label_line_mesh.position.copy(point)
                ring_mat.uniforms.circleCenter.value = new THREE.Vector3(point.x, 0, point.z)
                updateCoordSprite(query_info, ep, lon, lat, ele)
            }
        })
    }

    click_query_label_line_material = label_line_mat
    click_ring_material = ring_mat
}

const animate = () => {
    animationId = requestAnimationFrame(animate)
    if (river_line_material) river_line_material.uniforms.time.value += 0.001
    if (brdige_lable_line_material) brdige_lable_line_material.uniforms.time.value += 0.001
    if (click_query_label_line_material) click_query_label_line_material.uniforms.time.value += 0.001
    if (click_ring_material) click_ring_material.uniforms.time.value += 0.001
    if (control1) control1.update()
    if (renderer1 && scene1 && camera1) renderer1.render(scene1, camera1)
}

onMounted(async () => {
    await loadTianditu()

    // Init Map
    map = new window.T.Map('map')
    map.centerAndZoom(new window.T.LngLat(103, 30), 15)
    map.disableDoubleClickZoom()
    map.addControl(new window.T.Control.MapType({ position: window.T_ANCHOR_BOTTOM_RIGHT }))

    // Rec Tool
    recTool = new window.T.RectangleTool(map, { showLabel: false, fillColor: 'green', fillOpacity: 0.001 })

    setSourceBounds(`${import.meta.env.VITE_API_BASE_URL}/geoserver/elevation/wms?REQUEST=GetCapabilities`, 'sc_dem_fab', map)

    // 加载河流
    const fetchRiversInBounds = async () => {
        if (!map) return;
        const bounds = map.getBounds();
        if (!bounds) return;

        // 清除旧河流
        river_list.forEach(item => {
            map.removeOverLay(item[0]);
        });
        river_list = [];

        const minLng = bounds.getSouthWest().lng;
        const minLat = bounds.getSouthWest().lat;
        const maxLng = bounds.getNorthEast().lng;
        const maxLat = bounds.getNorthEast().lat;

        try {
            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
            const response = await fetch(`${apiBaseUrl}/get_geo_pg/geo/ya_rivers_bbox?minLng=${minLng}&minLat=${minLat}&maxLng=${maxLng}&maxLat=${maxLat}`)
            const result = await response.json()
            if (result.code === 200 && result.data) {
                result.data.forEach(riv => {
                    if (!riv.geometry) return;
                    const geom = JSON.parse(riv.geometry)
                    const coord_json = geom.coordinates
                    const riv_name = riv.name
                    
                    let lines = [];
                    if (geom.type === 'MultiLineString') {
                        lines = coord_json;
                    } else if (geom.type === 'LineString') {
                        lines = [coord_json];
                    }

                    lines.forEach(line_coords => {
                        const points = line_coords.map(p => new window.T.LngLat(p[0], p[1]))
                        const line = new window.T.Polyline(points, {
                            color: 'red',
                            weight: 0.8,
                            opacity: 0.8,
                            lineStyle: 'dash',
                        })
                        map.addOverLay(line)
                        river_list.push([line, riv_name])
                    })
                })
            }
        } catch (error) {
            console.error('加载河流失败:', error)
        }
    };

    setTimeout(fetchRiversInBounds, 500);
    map.addEventListener("moveend", fetchRiversInBounds);


    // 加载桥梁
    fetch(`${import.meta.env.VITE_API_BASE_URL}/get_geo_pg/geo/ya_bridges`)
        .then(res => res.json())
        .then(result => {
            if (result.code === 200 && result.data) {
                result.data.forEach(b => {
                    const coord_json = JSON.parse(b.geometry).coordinates
                    const b_jd = coord_json[0]
                    const b_wd = coord_json[1]
                    const point = new window.T.LngLat(b_jd, b_wd)
                    const marker = new window.T.Marker(point, {
                        icon: new window.T.Icon({
                            iconUrl: '/images/bridge.png',
                            iconSize: new window.T.Point(15, 15),
                            iconAnchor: new window.T.Point(7.5, 7.5)
                        })
                    })
                    map.addOverLay(marker)
                    bridge_list.push([b_jd, b_wd, b.bridgeName])
                })
            }
        })
        .catch(err => console.error('加载桥梁失败:', err))

    // Init Three
    camera1 = new THREE.PerspectiveCamera(45, 610 / 650, 0.1, 1000000)
    camera1.position.set(1, 0, 3)

    const [s, c, r] = createScene(threeContainer.value, camera1)
    scene1 = s; control1 = c; renderer1 = r;

    animate()
})

onUnmounted(() => {
    cancelAnimationFrame(animationId)
    if (renderer1) {
        renderer1.dispose()
        renderer1.forceContextLoss()
    }
})
</script>

<style scoped>
.test-page {
    width: 100%;
    height: 100%;
    position: relative;
    background-color: #000;
}

#map {
    width: 100%;
    height: 100%;
}

.no-select {
    user-select: none;
}

#getDem {
    position: absolute;
    bottom: 100px;
    left: 20px;
    z-index: 450;
    padding: 10px 15px;
    background-color: rgba(30, 30, 40, 0.75);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: all 0.3s ease;
}

#getDem:hover {
    background-color: rgba(60, 60, 80, 0.9);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transform: translateY(-2px);
}

#coordSwitchButton {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 450;
    display: flex;
    align-items: center;
    gap: 10px;
    color: white;
    background: rgba(0, 0, 0, 0.5);
    padding: 5px 10px;
    border-radius: 4px;
}

.switch {
    width: 40px;
    height: 20px;
    background: #333;
    border-radius: 10px;
    position: relative;
    border: none;
    cursor: pointer;
}

.switch_circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    position: absolute;
    top: 2px;
    transition: all 0.3s;
}

.circle_left {
    left: 2px;
    background: #999;
}

.circle_right {
    left: 22px;
    background: #5ECE90;
}

.switch_active {
    background: #1a6640;
}

.sh_ctr_group {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    border-radius: 0 0 12px 12px;
}

.sw_container {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: #ccc;
    user-select: none;
}

.sw_container:hover {
    background: rgba(255, 255, 255, 0.13);
    color: #fff;
}

#coordInfoContainer {
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 13px;
    white-space: nowrap;
}

.viewer_3d {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 610px;
    height: 650px;
    background-color: rgba(30, 30, 40, 0.75);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #fff;
    z-index: 500;
    user-select: none;
}

.v_header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 15px;
    background-color: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 14px;
}

.header_controls {
    display: flex;
    gap: 8px;
}

.viewer_ctrl_btns {
    width: 24px;
    height: 24px;
    border: none;
    background-color: rgba(255, 255, 255, 0.15);
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.viewer_ctrl_btns:hover {
    background-color: rgba(255, 255, 255, 0.3);
}

.viewer_ctrl_btns.close-btn:hover {
    background-color: rgba(255, 60, 60, 0.6);
}

.three_container {
    flex: 1;
    width: 100%;
    overflow: hidden;
    background-color: rgba(0, 0, 0, 0.2);
}

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 20px;
}

.loading-spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

/* 进度条样式 */
.progress-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.progress-container {
    background: white;
    padding: 20px;
    border-radius: 12px;
    width: 300px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.progress-title {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 15px;
    color: #333;
    display: flex;
    align-items: center;
    gap: 8px;
}

.progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
}

.progress-bar {
    height: 8px;
    background: #eee;
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea, #764ba2);
    transition: width 0.3s ease;
}

/* 确认对话框样式 */
.dialog-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.6);
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
}

.confirm-dialog {
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 320px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease;
}

.dialog-title {
    font-size: 18px;
    font-weight: bold;
    color: #333;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.dialog-content {
    margin-bottom: 24px;
    background: #f8f9fa;
    padding: 12px;
    border-radius: 8px;
}

.dialog-item {
    margin-bottom: 8px;
    color: #555;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.dialog-item:last-child {
    margin-bottom: 0;
}

.dialog-item strong {
    color: #667eea;
    font-size: 16px;
}

.dialog-buttons {
    display: flex;
    gap: 12px;
}

.btn-confirm-dialog,
.btn-cancel-dialog {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-confirm-dialog {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.btn-confirm-dialog:hover {
    opacity: 0.9;
    transform: translateY(-1px);
}

.btn-cancel-dialog {
    background: #f1f3f5;
    color: #495057;
}

.btn-cancel-dialog:hover {
    background: #e9ecef;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

/* Page Info Styles (Copied from CesiumMap.vue) */
.page-info {
    position: absolute;
    top: 80px;
    left: 20px;
    z-index: 550;
    /* Increased z-index to be above viewer_3d (500) */
    background: rgba(255, 255, 255, 0.95);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    padding: 15px 20px;
    min-width: 310px;
    backdrop-filter: blur(10px);
    user-select: none;
    pointer-events: auto;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-info.info-collapsed {
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    min-width: 0;
}

.info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    border-bottom: 2px solid #5ECE90;
    padding-bottom: 8px;
}

.page-info .info-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border-bottom: none;
    padding: 0;
    text-shadow: none;
    margin-bottom: 0;
}

.close-btn {
    cursor: pointer;
    font-size: 20px;
    color: #999;
    line-height: 1;
    padding: 0 5px;
    transition: color 0.2s;
}

.close-btn:hover {
    color: #333;
}

.info-collapsed-icon {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    cursor: pointer;
}

.info-collapsed-icon:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

.page-info .info-item {
    font-size: 12.5px;
    color: #555;
    line-height: 1.8;
    padding-left: 8px;
    text-shadow: none;
    user-select: none;
}

.page-info .info-item:hover {
    background-color: transparent;
}

.page-info .info-section-title {
    font-size: 12px;
    font-weight: 700;
    color: #2c6e8a;
    margin-top: 8px;
    margin-bottom: 2px;
    padding-left: 4px;
    letter-spacing: 0.03em;
    user-select: none;
}

.page-info kbd {
    display: inline-block;
    padding: 0 5px;
    font-size: 11px;
    font-family: monospace;
    line-height: 1.5;
    background: #f0f0f0;
    border: 1px solid #bbb;
    border-radius: 3px;
    color: #333;
}
</style>
