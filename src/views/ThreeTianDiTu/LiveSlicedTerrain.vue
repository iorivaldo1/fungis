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
        </div>

        <!-- 页面说明 -->
        <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
            <div class="info-container" v-if="showPageInfo">
                <div class="info-header">
                    <div class="info-title">📌 页面说明</div>
                    <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
                </div>
                <div class="info-item">1. 点击左下角 'T' 按钮激活框选工具,在地图上框选区域以生成3D地形</div>
                <div class="info-item">2. 服务器资源有限，地形数据范围为雅安市bbox(蓝色虚线框) </div>
                <div class="info-item">3. WCS服务怕把服务器拉垮，切片拉框大小限制为0.08度(1公里左右) </div>
                <div class="info-item">4. 地形数据为自建GeoServer发布的WCS服务，数据源来自FABDEM，精度为30米</div>
                <div class="info-item">5. DOM数据来自天地图WMTS服务，固定为18级，精度1.2米</div>
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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as GeoTIFF from 'geotiff'

// State
const showCoord = ref(false)
const coordInfo = ref('')
const show3DWindow = ref(false)
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

// Utils specific to this component (ported from f3d.js)

// TDT Utils
const clearOverLays = () => {
    if (demOverLayerList) {
        demOverLayerList.forEach(ov => map.removeOverLay(ov))
        demOverLayerList = []
    }
}

const lngLatToTile = (lng, lat, zoom) => {
    const x = (lng + 180) / 360
    const y = (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2
    const tileCount = Math.pow(2, zoom)
    const tileCol = Math.floor(x * tileCount)
    const tileRow = Math.floor(y * tileCount)
    return [tileCol, tileRow]
}

const tileToLngLat = (tileCol, tileRow, zoom) => {
    const n = Math.pow(2, zoom)
    const lng = (tileCol / n) * 360 - 180
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileRow) / n)))
    const lat = (latRad * 180) / Math.PI
    return [lng, lat]
}

const getTileWMTSUrlIMG = (tileCol, tileRow, zoom) => {
    const serviceNum = Math.floor(Math.random() * 8)
    return `https://t${serviceNum}.tianditu.gov.cn/img_w/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=image%2Fpng&tk=be50c7492442ecf4e61ca7bd578d6b8b&TILECOL=${tileCol}&TILEROW=${tileRow}&TILEMATRIX=${zoom}`
}

const getTileWMTSUrlCIA = (tileCol, tileRow, zoom) => {
    const serviceNum = Math.floor(Math.random() * 8)
    return `https://t${serviceNum}.tianditu.gov.cn/cia_w/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=image%2Fpng&tk=be50c7492442ecf4e61ca7bd578d6b8b&TILECOL=${tileCol}&TILEROW=${tileRow}&TILEMATRIX=${zoom}`
}

const calculateBounds = (tiles) => {
    const cols = tiles.map(t => t.col)
    const rows = tiles.map(t => t.row)
    return {
        minCol: Math.min(...cols),
        maxCol: Math.max(...cols),
        minRow: Math.min(...rows),
        maxRow: Math.max(...rows)
    }
}

const loadImage = (url, timeout = 50000) => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        const timer = setTimeout(() => reject(new Error(`Timeout: ${url}`)), timeout)
        img.onload = () => { clearTimeout(timer); resolve(img) }
        img.onerror = (err) => { clearTimeout(timer); reject(err) }
        img.src = url
    })
}

const getAllImages = async (tiles) => {
    const promises = tiles.map(tile => loadImage(tile.url).catch(e => { console.error(e); return null }))
    return Promise.all(promises)
}

const getAllImagesWithProgress = async (tiles, showProgress = false) => {
    const loadPromises = tiles.map((tile, index) =>
        loadImage(tile.url).then(img => {
            if (showProgress) {
                loadedTiles.value++
                downloadProgress.value = (loadedTiles.value / totalTiles.value) * 100
            }
            return img
        }).catch(error => {
            console.error(`加载瓦片失败: ${tile.url}`, error)
            if (showProgress) {
                loadedTiles.value++
                downloadProgress.value = (loadedTiles.value / totalTiles.value) * 100
            }
            return null
        })
    )
    const images = await Promise.all(loadPromises)
    return images
}

const c_dom_img_cia_lv = async (bbox, lv, showProgress = false) => {
    const zoom = lv
    const tileSize = 256
    const minX = bbox.getSouthWest().lng
    const minY = bbox.getSouthWest().lat
    const maxX = bbox.getNorthEast().lng
    const maxY = bbox.getNorthEast().lat

    const nw = lngLatToTile(minX, maxY, zoom)
    const ne = lngLatToTile(maxX, maxY, zoom)
    const sw = lngLatToTile(minX, minY, zoom)
    const se = lngLatToTile(maxX, minY, zoom)

    const minCol = Math.min(nw[0], sw[0])
    const maxCol = Math.max(ne[0], se[0])
    const minRow = Math.min(ne[1], se[1])
    const maxRow = Math.max(nw[1], sw[1])

    const tiles = []
    const tiles2 = []
    for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
            tiles.push({ url: getTileWMTSUrlIMG(col, row, zoom), col, row })
            tiles2.push({ url: getTileWMTSUrlCIA(col, row, zoom), col, row })
        }
    }

    const bounds = calculateBounds(tiles)
    const canvasWidth = (bounds.maxCol - bounds.minCol + 1) * tileSize
    const canvasHeight = (bounds.maxRow - bounds.minRow + 1) * tileSize

    const canvas1 = document.createElement('canvas')
    const ctx1 = canvas1.getContext('2d', { willReadFrequently: true })
    canvas1.width = canvasWidth
    canvas1.height = canvasHeight

    const [firstTile_nw_x, firstTile_nw_y] = tileToLngLat(minCol, minRow, zoom)
    const [lastTile_se_x, lastTile_se_y] = tileToLngLat(maxCol + 1, maxRow + 1, zoom)
    const geo_width = lastTile_se_x - firstTile_nw_x
    const geo_height = lastTile_se_y - firstTile_nw_y
    const pixelsPerDegreeX = canvasWidth / geo_width
    const pixelsPerDegreeY = canvasHeight / geo_height
    const selectionPixelWidth = (maxX - minX) * pixelsPerDegreeX
    const selectionPixelHeight = (minY - maxY) * pixelsPerDegreeY

    const canvas2 = document.createElement('canvas')
    canvas2.width = Math.ceil(selectionPixelWidth)
    canvas2.height = Math.ceil(selectionPixelHeight)
    const ctx2 = canvas2.getContext('2d')

    const offset_x = (minX - firstTile_nw_x) * pixelsPerDegreeX
    const offset_y = (maxY - firstTile_nw_y) * pixelsPerDegreeY

    if (showProgress) {
        totalTiles.value = tiles.length + tiles2.length
        loadedTiles.value = 0
        downloadProgress.value = 0
    }

    const images = await getAllImagesWithProgress(tiles, showProgress)
    images.forEach((img, idx) => {
        if (img) {
            const tile = tiles[idx]
            const x = (tile.col - bounds.minCol) * tileSize
            const y = (tile.row - bounds.minRow) * tileSize
            ctx1.drawImage(img, x, y, tileSize, tileSize)
        }
    })
    const cias = await getAllImagesWithProgress(tiles2, showProgress)
    cias.forEach((cia, idx) => {
        if (cia) {
            const tile = tiles2[idx]
            const x = (tile.col - bounds.minCol) * tileSize
            const y = (tile.row - bounds.minRow) * tileSize
            ctx1.drawImage(cia, x, y, tileSize, tileSize)
        }
    })

    const imageData = ctx1.getImageData(Math.floor(offset_x), Math.floor(offset_y), canvas2.width, canvas2.height)
    ctx2.putImageData(imageData, 0, 0)
    return canvas2
}

const setDEMUrl = async (layerName, bbox) => {
    const resolution = 0.00027777778
    const minX = bbox.getSouthWest().lng
    const minY = bbox.getSouthWest().lat
    const maxX = bbox.getNorthEast().lng
    const maxY = bbox.getNorthEast().lat

    // Use absolute URL that works (from f3d.js) - assuming 43.138.206.113 is accessible
    // Fallback to localhost if needed, but original code prioritized 8.155...
    let wcsURL = `${import.meta.env.VITE_API_BASE_URL}/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${layerName}&format=image/tiff&subset=Long(${minX},${maxX})&subset=Lat(${minY},${maxY})`

    // In f3d.js, it fetches first to get range, then expands.
    try {
        const demData = await fetch(wcsURL)
        const arrayBuffer = await demData.arrayBuffer()
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
        const image = await tiff.getImage()
        const dem_range = image.getBoundingBox()
        let [dem_minX, dem_minY, dem_maxX, dem_maxY] = dem_range

        if (minX < dem_minX) dem_minX -= resolution
        if (minY < dem_minY) dem_minY -= resolution
        if (maxX > dem_maxX) dem_maxX += resolution
        if (maxY > dem_maxY) dem_maxY += resolution

        wcsURL = `${import.meta.env.VITE_API_BASE_URL}/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${layerName}&format=image/tiff&subset=Long(${dem_minX},${dem_maxX})&subset=Lat(${dem_minY},${dem_maxY})`
        return [wcsURL, [dem_minX, dem_minY, dem_maxX, dem_maxY]]
    } catch (e) {
        console.error("Failed to fetch DEM for bounds calculation", e)
        return [wcsURL, [minX, minY, maxX, maxY]]
    }
}

const setSourceBounds = async (url, layerName) => {
    try {
        const response = await fetch(url)
        const xmlText = await response.text()
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
        const layerElements = xmlDoc.getElementsByTagName('Layer')
        for (let layerElem of layerElements) {
            const name = layerElem.getElementsByTagName('Name')[0]?.textContent
            if (name == layerName) {
                const bbox = layerElem.getElementsByTagName('BoundingBox')[0]
                if (bbox) {
                    const minX = parseFloat(bbox.getAttribute('minx'))
                    const minY = parseFloat(bbox.getAttribute('miny'))
                    const maxX = parseFloat(bbox.getAttribute('maxx'))
                    const maxy = parseFloat(bbox.getAttribute('maxy'))
                    const points = [
                        new window.T.LngLat(minX, maxy),
                        new window.T.LngLat(maxX, maxy),
                        new window.T.LngLat(maxX, minY),
                        new window.T.LngLat(minX, minY),
                        new window.T.LngLat(minX, maxy)
                    ]
                    const line = new window.T.Polyline(points, { color: '#049ef4', weight: 1, opacity: 0.7, lineStyle: 'dashed' })
                    map.addOverLay(line)
                }
            }
        }
    } catch (e) {
        console.warn("SetSourceBounds failed", e)
    }
}

const c_mesh_dem = async (demData, camera, m_meshname) => {
    const tiff = await GeoTIFF.fromArrayBuffer(demData)
    const image = await tiff.getImage()
    const rasters = await image.readRasters()
    const width = image.getWidth()
    const height = image.getHeight()
    const elevationData = new Float32Array(rasters[0])
    const geometry = new THREE.PlaneGeometry(5, 5 * height / width, width - 1, height - 1)

    let maxElevation = -Infinity
    let minElevation = Infinity
    for (let i = 0; i < elevationData.length; i++) {
        const val = elevationData[i]
        if (val > maxElevation) maxElevation = val
        if (val !== 0 && val < minElevation) minElevation = val
    }

    const positions = geometry.attributes.position.array
    for (let i = 0; i < elevationData.length; i++) {
        if (maxElevation === minElevation) {
            positions[i * 3 + 2] = 0
        } else {
            positions[i * 3 + 2] = (elevationData[i] - minElevation) / (maxElevation - minElevation)
        }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    const meshMaterial = new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true })
    const mesh_dem = new THREE.Mesh(geometry, meshMaterial)
    mesh_dem.name = m_meshname
    mesh_dem.rotation.x = -Math.PI / 2
    camera.position.set(0, 5, 3.5)
    return [mesh_dem, minElevation, maxElevation, geometry]
}

const getBbox = () => {
    return new Promise((resolve) => {
        const handler = (e) => {
            const bbox = e.currentBounds
            recTool.removeEventListener('draw', handler)
            resolve(bbox)
        }
        recTool.addEventListener('draw', handler)
    })
}

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

// Three Scenes
const createScene = (container, camera) => {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)

    const loader = new THREE.TextureLoader()
    const texture = loader.load('/images/bg1.jpeg', () => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        texture.colorSpace = THREE.SRGBColorSpace
        scene.background = texture
    })

    const ambientLight = new THREE.AmbientLight(0x404040)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(1, 1, 1)
    scene.add(ambientLight)
    scene.add(directionalLight)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const control = new OrbitControls(camera, renderer.domElement)
    control.enablePan = true

    return [scene, control, renderer]
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
    clearOverLays()
    if (recTool) recTool.clear()
}

const startTerrainGeneration = async (bbox_geo) => {
    // Reset progress
    downloadProgress.value = 0
    loadedTiles.value = 0

    loading.value = true
    try {
        const [DEMUrl, bounds] = await setDEMUrl('elevation:sc_dem_fab', bbox_geo)
        const bbox_geo_expand = new window.T.LngLatBounds(
            new window.T.LngLat(bounds[0], bounds[1]),
            new window.T.LngLat(bounds[2], bounds[3])
        )

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
        recTool.clear()

        // Fetch DEM
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

        // Texture
        // Calculate total tiles for progress bar
        const showProgress = totalTiles.value > 200
        if (showProgress) {
            showDownloadProgress.value = true
        }

        const domCanvas = await c_dom_img_cia_lv(bbox_geo_expand, 18, showProgress)
        const texture = new THREE.CanvasTexture(domCanvas)
        texture.colorSpace = THREE.SRGBColorSpace

        const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
        mesh_dem.material = mat
        scene1.add(mesh_dem)

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
    clearOverLays()
    show3DWindow.value = false // Reset visibility first
    if (recTool) {
        recTool.clear()
        recTool.open()
        const bbox_geo = await getBbox()

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

        // Calculate Tile Count
        const zoom = 18
        const minX = bbox_geo.getSouthWest().lng
        const minY = bbox_geo.getSouthWest().lat
        const maxX = bbox_geo.getNorthEast().lng
        const maxY = bbox_geo.getNorthEast().lat

        const nw = lngLatToTile(minX, maxY, zoom)
        const ne = lngLatToTile(maxX, maxY, zoom)
        const sw = lngLatToTile(minX, minY, zoom)
        const se = lngLatToTile(maxX, minY, zoom)

        const minCol = Math.min(nw[0], sw[0])
        const maxCol = Math.max(ne[0], se[0])
        const minRow = Math.min(ne[1], se[1])
        const maxRow = Math.max(nw[1], sw[1])

        const count = (maxCol - minCol + 1) * (maxRow - minRow + 1)
        // Double the count because we download IMG and CIA
        tileCount.value = count * 2
        totalTiles.value = count * 2

        if (tileCount.value > 200) {
            pendingBbox = bbox_geo
            showTileInfo.value = true
        } else {
            startTerrainGeneration(bbox_geo)
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

const animate = () => {
    animationId = requestAnimationFrame(animate)
    if (control1) control1.update()
    if (renderer1 && scene1 && camera1) renderer1.render(scene1, camera1)
}

onMounted(async () => {
    await loadTianditu()

    // Init Map
    map = new window.T.Map('map')
    map.centerAndZoom(new window.T.LngLat(102.809, 30.118), 15)
    map.disableDoubleClickZoom()
    map.addControl(new window.T.Control.MapType({ position: window.T_ANCHOR_BOTTOM_RIGHT }))

    // Rec Tool
    recTool = new window.T.RectangleTool(map, { showLabel: false, fillColor: 'green', fillOpacity: 0.001 })

    setSourceBounds(`${import.meta.env.VITE_API_BASE_URL}/geoserver/elevation/wms?REQUEST=GetCapabilities`, 'sc_dem_fab')

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
    border-radius: 0 0 12px 12px;
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

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1000;
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
    min-width: 250px;
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
    font-size: 13px;
    color: #555;
    line-height: 1.8;
    padding-left: 8px;
    text-shadow: none;
    user-select: none;
}

.page-info .info-item:hover {
    background-color: transparent;
}
</style>
