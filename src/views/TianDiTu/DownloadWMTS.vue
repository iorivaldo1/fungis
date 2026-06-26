<template>
  <div class="download-page">
    <div id="map"></div>

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
          <div class="dialog-item">Zoom等级: {{ savedSettings.zoomLevel }}</div>
        </div>
        <div class="dialog-buttons">
          <button class="btn-confirm-dialog" @click="confirmDownload">✓ 确认下载</button>
          <button class="btn-cancel-dialog" @click="cancelSelection">✕ 取消</button>
        </div>
      </div>
    </div>

    <!-- Canvas 2 容器 (仅保留裁切后的) -->
    <div id="container2" class="canvas-container" :class="{ show: showCanvas }">
      <button class="canvas-close-btn" @click="closeCanvas">✕</button>
      <div class="canvas-label">裁切结果</div>
      <canvas id="canvas2" ref="canvas2Ref"></canvas>
      <button class="download-btn" @click="downloadCanvas">📥 保存</button>
    </div>

    <!-- 页面说明 -->
    <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
      <div class="info-container" v-if="showPageInfo">
        <div class="info-header">
          <div class="info-title">📌 页面说明</div>
          <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
        </div>
        <div class="info-item">1. 设置中可自行选择图片格式(geotiff, png, jpg):geotiff较大时，保存会比较慢</div>
        <div class="info-item">2. 设置中可自行选择Zoom等级(1-18)</div>
        <div class="info-item">3. 默认每日下载量为50000张瓦片,最好使用自己的token</div>
        <div class="info-item">4. 默认叠加了CIA注记,可在设置中取消</div>
      </div>
      <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
        <span>📌</span>
      </div>
    </div>

    <!-- 设置按钮 -->
    <button id="settingsBtn" title="设置" @click="toggleSettings">⚙️</button>

    <!-- 设置面板 -->
    <div id="settingsPanel" class="settings-panel" :class="{ show: showSettings }">
      <div class="settings-item">
        <label>保存格式:</label>
        <select v-model="formatSelect">
          <option value="geotiff">GeoTIFF</option>
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
      </div>
      <div class="settings-item">
        <label>天地图Token:</label>
        <input type="text" v-model="tokenInput" placeholder="留空使用默认token">
      </div>
      <div class="settings-item">
        <label>Zoom等级:</label>
        <input type="number" v-model.number="zoomLevelInput" min="1" max="18" placeholder="默认18">
      </div>
      <div class="settings-item">
        <label>叠加注记:</label>
        <input type="checkbox" v-model="showCiaInput">
      </div>
      <div class="settings-buttons">
        <button class="btn-confirm" @click="confirmSettings">✓ 确定</button>
        <button class="btn-cancel" @click="cancelSettings">✕ 取消</button>
      </div>
    </div>

    <!-- 选取范围按钮 -->
    <button id="getDem" title="框选下载范围" @click="startSelection">🔽</button>

    <!-- 按钮说明 -->
    <div class="button-description">
      点击后框选区域
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as GeoTIFF from 'geotiff'

// 状态变量
const showCanvas = ref(false)
const showSettings = ref(false)
const formatSelect = ref('geotiff')
const tokenInput = ref('')
const zoomLevelInput = ref(18)
const showCiaInput = ref(true)
const canvas2Ref = ref(null)
const showTileInfo = ref(false)
const tileCount = ref(0)
const showDownloadProgress = ref(false)
const downloadProgress = ref(0)
const totalTiles = ref(0)

const loadedTiles = ref(0)
const showPageInfo = ref(true)

// 临时存储选中的瓦片信息
let pendingTiles = null
let pendingBounds = null
let pendingBbox = null

// 全局变量
let map = null
let recTool = null
let currentGeoInfo = null
const DEFAULT_TOKEN = 'be50c7492442ecf4e61ca7bd578d6b8b'

// 保存设置的临时变量
let savedSettings = {
  format: 'geotiff',
  token: '',
  zoomLevel: 18,
  showCia: true
}

// 工具函数
function lngLatToTile(lng, lat, zoom) {
  const x = (lng + 180) / 360
  const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) +
    1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2
  const tileCount = Math.pow(2, zoom)
  const tileCol = Math.floor(x * tileCount)
  const tileRow = Math.floor(y * tileCount)

  return [tileCol, tileRow]
}

function tileToLngLat(tileCol, tileRow, zoom) {
  const n = Math.pow(2, zoom)
  const lng = tileCol / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileRow / n)))
  const lat = latRad * 180 / Math.PI

  return [lng, lat]
}

function calculateBounds(tiles) {
  const cols = tiles.map(t => t.col)
  const rows = tiles.map(t => t.row)

  return {
    minCol: Math.min(...cols),
    maxCol: Math.max(...cols),
    minRow: Math.min(...rows),
    maxRow: Math.max(...rows)
  }
}

function getBbox() {
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const bbox = e.currentBounds
      recTool.removeEventListener('draw', handler)
      resolve(bbox)
    }
    recTool.addEventListener('draw', handler)
  })
}

async function getAllImages(tiles) {
  const loadPromises = tiles.map(tile =>
    loadImage(tile.url).catch(error => {
      console.error(`加载瓦片失败: ${tile.url}`, error)
      return null
    })
  )
  const images = await Promise.all(loadPromises)
  return images
}

async function getAllImagesWithProgress(tiles, showProgress = false, isCia = false) {
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

function loadImage(url, timeout = 50000) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    const timer = setTimeout(() => {
      reject(new Error(`图片加载超时: ${url}`))
    }, timeout)

    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }

    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error(`图片加载失败: ${url}`))
    }

    img.src = url
  })
}

function getTileWMTSUrlIMG(tileCol, tileRow, zoom, token) {
  const serviceNum = Math.floor(Math.random() * 8)
  const baseUrl = `https://t${serviceNum}.tianditu.gov.cn/img_w/wmts?`
  const wmtsUrl =
    baseUrl +
    'REQUEST=GetTile' +
    '&SERVICE=WMTS' +
    '&VERSION=1.0.0' +
    '&LAYER=img' +
    '&STYLE=default' +
    '&TILEMATRIXSET=w' +
    '&FORMAT=image%2Fpng' +
    '&tk=' + token +
    '&TILECOL=' + tileCol +
    '&TILEROW=' + tileRow +
    '&TILEMATRIX=' + zoom
  return wmtsUrl
}

function getTileWMTSUrlCIA(tileCol, tileRow, zoom, token) {
  const serviceNum = Math.floor(Math.random() * 8)
  const baseUrl = `https://t${serviceNum}.tianditu.gov.cn/cia_w/wmts?`
  const wmtsUrl =
    baseUrl +
    'REQUEST=GetTile' +
    '&SERVICE=WMTS' +
    '&VERSION=1.0.0' +
    '&LAYER=cia' +
    '&STYLE=default' +
    '&TILEMATRIXSET=w' +
    '&FORMAT=image%2Fpng' +
    '&tk=' + token +
    '&TILECOL=' + tileCol +
    '&TILEROW=' + tileRow +
    '&TILEMATRIX=' + zoom
  return wmtsUrl
}

function getCurrentToken() {
  return savedSettings.token || DEFAULT_TOKEN
}

// 主要功能函数
const toggleSettings = () => {
  formatSelect.value = savedSettings.format
  tokenInput.value = savedSettings.token
  zoomLevelInput.value = savedSettings.zoomLevel
  showCiaInput.value = savedSettings.showCia
  showSettings.value = !showSettings.value
}

const confirmSettings = () => {
  savedSettings.format = formatSelect.value
  savedSettings.token = tokenInput.value.trim()
  savedSettings.zoomLevel = zoomLevelInput.value
  savedSettings.showCia = showCiaInput.value
  showSettings.value = false
  console.log('设置已保存:', savedSettings)
}

const cancelSettings = () => {
  formatSelect.value = savedSettings.format
  tokenInput.value = savedSettings.token
  zoomLevelInput.value = savedSettings.zoomLevel
  showCiaInput.value = savedSettings.showCia
  showSettings.value = false
}

const closeCanvas = () => {
  showCanvas.value = false
  const canvas = canvas2Ref.value
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    canvas.width = 0
    canvas.height = 0
  }
  currentGeoInfo = null
}

const startSelection = async () => {
  closeCanvas()
  hideTileInfo()

  recTool.removeEventListener('draw')
  recTool.clear()
  recTool.open()

  const bbox = await getBbox()

  const zoom = savedSettings.zoomLevel
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
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      tiles.push({
        url: getTileWMTSUrlIMG(col, row, zoom, getCurrentToken()),
        col: col,
        row: row,
      })
    }
  }

  // 保存瓦片信息供后续使用
  pendingTiles = tiles
  pendingBounds = calculateBounds(tiles)
  pendingBbox = bbox

  // 计算瓦片数量并显示确认对话框（包含img和cia）
  const ciaCount = savedSettings.showCia ? tiles.length : 0
  tileCount.value = tiles.length + ciaCount
  showTileInfo.value = true
}

const hideTileInfo = () => {
  showTileInfo.value = false
  tileCount.value = 0
}

const cancelSelection = () => {
  hideTileInfo()
  recTool.clear()
  pendingTiles = null
  pendingBounds = null
  pendingBbox = null
}

const confirmDownload = async () => {
  if (!pendingTiles || !pendingBounds || !pendingBbox) {
    alert('没有待下载的数据')
    return
  }

  hideTileInfo()

  const zoom = savedSettings.zoomLevel
  const tileSize = 256
  const bbox = pendingBbox
  const tiles = pendingTiles
  const bounds = pendingBounds

  const minX = bbox.getSouthWest().lng
  const minY = bbox.getSouthWest().lat
  const maxX = bbox.getNorthEast().lng
  const maxY = bbox.getNorthEast().lat
  const minCol = bounds.minCol
  const maxCol = bounds.maxCol
  const minRow = bounds.minRow
  const maxRow = bounds.maxRow

  const canvasWidth = (bounds.maxCol - bounds.minCol + 1) * tileSize
  const canvasHeight = (bounds.maxRow - bounds.minRow + 1) * tileSize

  const canvas1 = document.createElement('canvas')
  const ctx1 = canvas1.getContext('2d', { willReadFrequently: true })
  canvas1.width = canvasWidth
  canvas1.height = canvasHeight
  ctx1.fillStyle = 'transparent'
  ctx1.fillRect(0, 0, canvasWidth, canvasHeight)

  const [firstTile_nw_x, firstTile_nw_y] = tileToLngLat(minCol, minRow, zoom)
  const [lastTile_se_x, lastTile_se_y] = tileToLngLat(maxCol + 1, maxRow + 1, zoom)
  const geoWidth = lastTile_se_x - firstTile_nw_x
  const geoHeight = lastTile_se_y - firstTile_nw_y
  const pixelsPerDegreeX = canvasWidth / geoWidth
  const pixelsPerDegreeY = canvasHeight / geoHeight
  const selectionPixelWidth = (maxX - minX) * pixelsPerDegreeX
  const selectionPixelHeight = (minY - maxY) * pixelsPerDegreeY

  const canvas2 = canvas2Ref.value
  // 固定显示尺寸为 800x600，内部保持原始像素
  const displayWidth = 800
  const displayHeight = 600
  canvas2.style.width = displayWidth + 'px'
  canvas2.style.height = displayHeight + 'px'
  canvas2.width = Math.ceil(selectionPixelWidth)
  canvas2.height = Math.ceil(selectionPixelHeight)
  const ctx2 = canvas2.getContext('2d')

  // 如果瓦片数量超过200，显示进度条
  const showProgress = tiles.length > 200
  if (showProgress) {
    showDownloadProgress.value = true
    downloadProgress.value = 0
    totalTiles.value = tiles.length + (savedSettings.showCia ? tiles.length : 0)
    loadedTiles.value = 0
  }

  const images = await getAllImagesWithProgress(tiles, showProgress)

  images.forEach((img, index) => {
    const tile = tiles[index]
    const x = (tile.col - bounds.minCol) * tileSize
    const y = (tile.row - bounds.minRow) * tileSize
    ctx1.drawImage(img, x, y, tileSize, tileSize)
  })

  // 绘制CIA注记瓦片（叠加在img之上）- 根据设置决定是否绘制
  if (savedSettings.showCia) {
    const ciaTiles = tiles.map(tile => ({
      url: getTileWMTSUrlCIA(tile.col, tile.row, zoom, getCurrentToken()),
      col: tile.col,
      row: tile.row
    }))
    const cias = await getAllImagesWithProgress(ciaTiles, showProgress, true)
    cias.forEach((cia, index) => {
      const tile = ciaTiles[index]
      const x = (tile.col - bounds.minCol) * tileSize
      const y = (tile.row - bounds.minRow) * tileSize
      ctx1.drawImage(cia, x, y, tileSize, tileSize)
    })
  }

  // 下载完成后隐藏进度条
  if (showProgress) {
    showDownloadProgress.value = false
  }

  const offset_x = (minX - firstTile_nw_x) * pixelsPerDegreeX
  const offset_y = (maxY - firstTile_nw_y) * pixelsPerDegreeY

  const imageData = ctx1.getImageData(
    Math.floor(offset_x),
    Math.floor(offset_y),
    canvas2.width,
    canvas2.height
  )
  ctx2.putImageData(imageData, 0, 0)

  currentGeoInfo = {
    minX: minX,
    maxX: maxX,
    minY: minY,
    maxY: maxY,
    width: canvas2.width,
    height: canvas2.height
  }

  // 清除选框和临时数据
  recTool.clear()
  pendingTiles = null
  pendingBounds = null
  pendingBbox = null

  showCanvas.value = true
}

const downloadCanvas = async () => {
  const canvas = canvas2Ref.value
  if (!canvas) {
    alert('Canvas未找到')
    return
  }

  if (canvas.width === 0 || canvas.height === 0) {
    alert('请先框选区域生成图片')
    return
  }

  const format = savedSettings.format
  const timestamp = new Date().getTime()

  if (format === 'geotiff') {
    if (!currentGeoInfo) {
      alert('地理信息缺失')
      return
    }
    await saveAsGeoTIFF(canvas, currentGeoInfo, `裁切结果_${timestamp}.tif`)
  } else {
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
    const extension = format === 'png' ? '.png' : '.jpg'
    canvas.toBlob(function (blob) {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `裁切结果_${timestamp}${extension}`
      link.href = url
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, mimeType)
  }
}

const saveAsGeoTIFF = async (canvas, geoInfo, filename) => {
  try {
    if (!GeoTIFF || typeof GeoTIFF.writeArrayBuffer !== 'function') {
      throw new Error('当前引入的 geotiff.js 不支持写入（缺少 GeoTIFF.writeArrayBuffer）。请确认引用的是 geotiff@2.x 的 browser 版本，或使用示例文件中的 geotiff.js。')
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data, width, height } = imageData

    const raster = new Uint8Array(width * height * 3)
    const totalPixels = width * height
    for (let i = 0; i < totalPixels; i++) {
      const srcIdx = i * 4
      const dstIdx = i * 3
      raster[dstIdx] = data[srcIdx]
      raster[dstIdx + 1] = data[srcIdx + 1]
      raster[dstIdx + 2] = data[srcIdx + 2]
    }

    const pixelSizeX = (geoInfo.maxX - geoInfo.minX) / width
    const pixelSizeY = (geoInfo.maxY - geoInfo.minY) / height

    const arrayBuffer = await GeoTIFF.writeArrayBuffer(raster, {
      width,
      height,
      ModelPixelScale: [pixelSizeX, pixelSizeY, 0],
      ModelTiepoint: [0, 0, 0, geoInfo.minX, geoInfo.maxY, 0],
      GTModelTypeGeoKey: 2,
      GeographicTypeGeoKey: 4326,
    })

    const blob = new Blob([arrayBuffer], { type: 'image/tiff' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = filename
    link.href = url
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    console.log('GeoTIFF保存成功')
    console.log('地理范围信息:')
    console.log(`  左上角坐标: (${geoInfo.minX}, ${geoInfo.maxY})`)
    console.log(`  右下角坐标: (${geoInfo.maxX}, ${geoInfo.minY})`)
    console.log(`  像素分辨率: X=${pixelSizeX}, Y=${pixelSizeY}`)

  } catch (error) {
    console.error('保存GeoTIFF失败:', error)
    alert('GeoTIFF保存失败：' + (error && error.message ? error.message : error) + '\n\n可临时改用 PNG/JPG 验证流程是否正常。')
  }
}

// 加载外部脚本
const loadScripts = () => {
  return new Promise((resolve, reject) => {
    if (window.T) {
      resolve()
      return
    }

    const loadScript = (src) => {
      return new Promise((res, rej) => {
        if (src.includes('tianditu') && window.T) {
          res()
          return
        }
        const script = document.createElement('script')
        script.src = src
        script.onload = res
        script.onerror = rej
        document.head.appendChild(script)
      })
    }

    // 只加载天地图
    loadScript('/tianditu.api.js')
      .then(resolve)
      .catch(reject)
  })
}

const initMap = () => {
  map = new window.T.Map('map', { tileSize: 512 })
  map.centerAndZoom(new window.T.LngLat(103, 30), 18)
  //   map.disableScrollWheelZoom()
  const ctrl = new window.T.Control.MapType({ position: window.T_ANCHOR_BOTTOM_RIGHT })
  map.addControl(ctrl)

  recTool = new window.T.RectangleTool(map, { showLabel: false })
}

onMounted(async () => {
  try {
    await loadScripts()
    initMap()
  } catch (error) {
    console.error('加载资源失败:', error)
    alert('加载地图资源失败，请刷新页面重试')
  }
})

onUnmounted(() => {
  if (map) {
    map = null
  }
  if (recTool) {
    recTool = null
  }
})
</script>

<style scoped>
.download-page {
  width: 100%;
  height: 100%;
  position: relative;
}

#map {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 下拉框选取按钮样式 */
#getDem {
  position: absolute;
  bottom: 100px;
  left: 20px;
  z-index: 450;
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
}

#getDem:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

#getDem:active {
  transform: translateY(0);
}

/* Canvas容器样式 */
.canvas-container {
  position: absolute;
  z-index: 450;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  padding: 15px;
  display: none;
  flex-direction: column;
  gap: 10px;
  top: 50px;
  right: 50px;
}

.canvas-container.show {
  display: flex;
}

canvas {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background: #f8f9fa;
}

/* 下载按钮样式 */
.download-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.download-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.download-btn:active {
  transform: translateY(0);
}

.canvas-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  margin-bottom: -5px;
}

/* 按钮说明文字样式 */
.button-description {
  position: absolute;
  bottom: 100px;
  left: 80px;
  z-index: 449;
  background: rgba(255, 255, 255, 0.95);
  padding: 10px 15px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  font-size: 14px;
  color: #333;
  pointer-events: none;
  max-width: 200px;
  line-height: 1.5;
}

.button-description strong {
  color: #667eea;
  display: block;
  margin-bottom: 5px;
}

/* 关闭按钮样式 */
.canvas-close-btn {
  position: absolute;
  top: 5px;
  right: 10px;
  width: 28px;
  height: 28px;
  background: #ff4757;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: white;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 2px 6px rgba(255, 71, 87, 0.3);
}

.canvas-close-btn:hover {
  background: #ee5a6f;
  transform: scale(1.1);
  box-shadow: 0 3px 10px rgba(255, 71, 87, 0.5);
}

/* 页面说明样式 */
.page-info {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 450;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 15px 20px;
  max-width: 320px;
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

.info-title {
  font-size: 16px;
  font-weight: 700;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: none;
  padding-bottom: 0;
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





.info-item {
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  padding-left: 8px;
}

/* 设置按钮样式 */
#settingsBtn {
  position: absolute;
  bottom: 170px;
  left: 20px;
  z-index: 450;
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #265498 0%, #073264 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
}

#settingsBtn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 87, 108, 0.6);
}

#settingsBtn:active {
  transform: translateY(0);
}

/* 设置面板样式 */
.settings-panel {
  position: absolute;
  bottom: 230px;
  left: 20px;
  z-index: 449;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  padding: 15px;
  display: none;
  flex-direction: column;
  gap: 10px;
  min-width: 200px;
}

.settings-panel.show {
  display: flex;
}

.settings-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-item label {
  font-size: 14px;
  color: #333;
  flex: 1;
}

.settings-item select {
  padding: 5px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.settings-item input[type="text"] {
  padding: 5px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  flex: 1;
  min-width: 0;
}

.settings-item input[type="text"]:focus {
  outline: none;
  border-color: #667eea;
}

.settings-item input[type="number"] {
  padding: 5px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  width: 80px;
}

.settings-item input[type="number"]:focus {
  outline: none;
  border-color: #667eea;
}

.settings-item input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: #667eea;
}

/* 设置面板按钮组 */
.settings-buttons {
  display: flex;
  gap: 10px;
  margin-top: 5px;
}

.settings-buttons button {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.btn-confirm {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.btn-confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.btn-cancel {
  background: #e0e0e0;
  color: #666;
}

.btn-cancel:hover {
  background: #d0d0d0;
}

/* 确认对话框遮罩 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 确认对话框 */
.confirm-dialog {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 30px 40px;
  min-width: 320px;
  text-align: center;
}

.dialog-title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-bottom: 20px;
}

.dialog-content {
  margin-bottom: 25px;
}

.dialog-item {
  font-size: 16px;
  color: #555;
  line-height: 2;
}

.dialog-item strong {
  color: #667eea;
  font-size: 24px;
}

.dialog-buttons {
  display: flex;
  gap: 15px;
  justify-content: center;
}

.dialog-buttons button {
  padding: 12px 30px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.3s ease;
  min-width: 120px;
}

.btn-confirm-dialog {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-confirm-dialog:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.btn-cancel-dialog {
  background: #e0e0e0;
  color: #666;
}

.btn-cancel-dialog:hover {
  background: #d0d0d0;
}

/* 下载进度条样式 */
.progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 30px 40px;
  min-width: 400px;
  text-align: center;
}

.progress-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 20px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  font-size: 14px;
  color: #666;
}

.progress-bar {
  width: 100%;
  height: 12px;
  background: #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 6px;
  transition: width 0.3s ease;
}
</style>
