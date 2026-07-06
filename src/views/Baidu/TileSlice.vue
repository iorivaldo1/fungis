<template>
  <div class="baidu-tile-slice-page">
    <div id="tileSliceMapContainer"></div>
    <div class="map-info-overlay">
      <div class="info-row">level: {{ zoomLevel }}</div>
      <div class="info-row">比例尺: {{ scaleText }}</div>
      <div class="info-row" v-if="centerText">中心: {{ centerText }}</div>
    </div>
    <div class="layer-control-panel">
      <div class="panel-title">WMTS 图层控制</div>
      <div class="layer-item" v-for="(layer, idx) in wmtsLayers" :key="idx">
        <label>
          <input type="checkbox" v-model="layer.visible" @change="toggleLayer(idx)" />
          {{ layer.name }}
        </label>
        <input type="range" min="0" max="1" step="0.05" v-model.number="layer.opacity" @input="updateLayerOpacity(idx)"
          class="opacity-slider" />
        <span class="opacity-val">{{ (layer.opacity * 100).toFixed(0) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, reactive } from 'vue'
import { loadBaiduMapScript } from '@/utils/baiduUtils'

const BAIDU_AK = 'MUBHlQKKLvig0Ia3QEAOzio46qq6foiT'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const WMTS_URL = `${API_BASE}/geoserver/gwc/service/wmts`
const TILEMATRIXSET = 'BD09MC'
const GRIDSET_MIN_X = -33554432 // -2^25
const GRIDSET_MIN_Y = -16777216 // -2^24
const GRIDSET_MAX_X = 33554432 //  2^25
const GRIDSET_MAX_Y = 16777216 //  2^24

const zoomLevel = ref('--')
const scaleText = ref('--')
const centerText = ref('')

let map = null
let BMap = null

/**
 * 百度切片坐标 (xb, yb, zb) -> WMTS TILECOL / TILEROW
 * 百度: y 轴向北递增；WMTS: TILEROW 从北向南递增
 */
function baiduTileToWmts(xb, yb, zb) {
  const tileSpan = 256 * Math.pow(2, 18 - zb)
  const TILECOL = Math.round((xb * tileSpan - GRIDSET_MIN_X) / tileSpan)
  const TILEROW = Math.round((GRIDSET_MAX_Y - (yb + 1) * tileSpan) / tileSpan)
  return { TILECOL, TILEROW }
}

/**
 * 工厂函数：创建 WMTS 瓦片图层
 */
function createWmtsLayer(layerName, zIndex = 1, format = 'image/png') {
  // 注意：如果是 jpeg 不支持透明，且 baidu map 的 isTransparentPng 可能有影响，但这里保留
  const layer = new BMap.TileLayer({ isTransparentPng: format === 'image/png', zIndex })
  layer.getTilesUrl = function (tileCoord, zoom) {
    const { TILECOL, TILEROW } = baiduTileToWmts(tileCoord.x, tileCoord.y, zoom)
    const params = new URLSearchParams({
      SERVICE: 'WMTS',
      REQUEST: 'GetTile',
      VERSION: '1.0.0',
      LAYER: layerName,
      STYLE: '',
      FORMAT: format,
      TILEMATRIXSET,
      TILEMATRIX: `EPSG:99001:${zoom}`,
      TILEROW,
      TILECOL
    })
    return `${WMTS_URL}?${params}`
  }
  return layer
}

/**
 * 在 addTileLayer 前后对比 DOM，捕获新创建的瓦片容器元素
 */
function addTileLayerAndCapture(layer) {
  if (!map) return
  const mapEl = map.getContainer()
  const before = new Set(mapEl.querySelectorAll('*'))
  map.addTileLayer(layer)
  const after = mapEl.querySelectorAll('*')
  for (const el of after) {
    if (!before.has(el) && el.tagName === 'DIV') {
      layer._tileContainer = el
      break
    }
  }
}

// 图层配置
const wmtsLayers = reactive([
  {
    name: '河流 (hydro:ya_river_bd09mc)',
    layerName: 'hydro:ya_river_bd09mc',
    format: 'image/png',
    zIndex: 2,
    visible: true,
    opacity: 1,
    instance: null
  },
  {
    name: '影像 (ya_yuchenqu_dom_l17)',
    layerName: 'imagery:ya_yuchenqu_dom_l17_bd09mc',
    // format: 'image/jpeg', // jpeg体积小，但是有白边，13.2kb
    // format: 'image/png', //png有alpha通道，可以透明处理，避免底图露出，但体积大 200kb
    format: 'image/png8', //通过算法强制缩减到只有 256 种颜色的调色板,同时保留了 1 位的全透明色 49.9kb
    zIndex: 1,
    visible: true,
    opacity: 1,
    instance: null
  }
])

function toggleLayer(idx) {
  const layerCfg = wmtsLayers[idx]
  if (!map) return
  if (layerCfg.visible) {
    if (!layerCfg.instance) {
      layerCfg.instance = createWmtsLayer(layerCfg.layerName, layerCfg.zIndex, layerCfg.format || 'image/png')
    }
    addTileLayerAndCapture(layerCfg.instance)
    // 重新应用当前透明度
    if (layerCfg.instance._tileContainer) {
      layerCfg.instance._tileContainer.style.opacity = layerCfg.opacity
    }
  } else {
    if (layerCfg.instance) {
      map.removeTileLayer(layerCfg.instance)
    }
  }
}

/**
 * 尝试获取 TileLayer 的瓦片容器 DOM 元素
 */
function getTileContainer(layer) {
  if (layer._tileContainer) return layer._tileContainer
  // 兜底：从地图 DOM 中查找尚未关联的瓦片容器
  if (!map) return null
  const mapEl = map.getContainer()
  const candidates = mapEl.querySelectorAll('div')
  for (const div of candidates) {
    if (div.children.length > 0 &&
      div.querySelector('img') &&
      div !== mapEl &&
      !div._layerClaimed) {
      // 检查是否已被其他 layer 占用
      const claimed = wmtsLayers.some(l => l.instance && l.instance._tileContainer === div)
      if (!claimed) {
        layer._tileContainer = div
        div._layerClaimed = true
        return div
      }
    }
  }
  return null
}

function updateLayerOpacity(idx) {
  const layerCfg = wmtsLayers[idx]
  const container = layerCfg.instance ? getTileContainer(layerCfg.instance) : null
  if (container) {
    container.style.opacity = layerCfg.opacity
  }
}

function formatScale(scaleDenominator) {
  const rounded = Math.round(scaleDenominator)
  return `1:${rounded.toLocaleString('zh-CN')}`
}

function updateMapInfo() {
  if (!map || !BMap) return
  const zoom = map.getZoom()
  zoomLevel.value = zoom

  const px1 = new BMap.Pixel(0, 0)
  const px2 = new BMap.Pixel(100, 0)
  const p1 = map.pixelToPoint(px1)
  const p2 = map.pixelToPoint(px2)

  if (p1 && p2) {
    const distanceMeters = map.getDistance(p1, p2)
    const metersPerPixel = distanceMeters / 100
    const dpi = 96
    const scaleDenominator = metersPerPixel * (dpi / 0.0254)
    if (Number.isFinite(scaleDenominator) && scaleDenominator > 0) {
      scaleText.value = formatScale(scaleDenominator)
    }
  }

  const center = map.getCenter()
  if (center) {
    centerText.value = `${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}`
  }
}

onMounted(async () => {
  try {
    await loadBaiduMapScript(BAIDU_AK)
    BMap = window.BMap || window.BMapGL

    map = new BMap.Map('tileSliceMapContainer')
    const center = new BMap.Point(103.05, 30.02)
    map.centerAndZoom(center, 16)
    map.enableScrollWheelZoom(true)

    map.setMapStyleV2({
      styleJson: [
        {
          featureType: 'districtlabel',
          elementType: 'all',
          stylers: { visibility: 'off' }
        }
      ]
    })

    // 添加 WMTS 图层（逐个添加并捕获容器 DOM）
    wmtsLayers.forEach(layerCfg => {
      layerCfg.instance = createWmtsLayer(layerCfg.layerName, layerCfg.zIndex, layerCfg.format || 'image/png')
      addTileLayerAndCapture(layerCfg.instance)
    })

    map.addEventListener('zoomend', updateMapInfo)
    map.addEventListener('moveend', updateMapInfo)
    map.addEventListener('tilesloaded', updateMapInfo)
    updateMapInfo()
  } catch (error) {
    console.error('加载百度地图失败:', error)
  }
})

onUnmounted(() => {
  if (map) {
    wmtsLayers.forEach(layerCfg => {
      if (layerCfg.instance) {
        map.removeTileLayer(layerCfg.instance)
        layerCfg.instance = null
      }
    })
    map = null
    BMap = null
  }
})
</script>

<style scoped>
.baidu-tile-slice-page {
  position: relative;
  width: 100%;
  height: 100%;
}

#tileSliceMapContainer {
  position: absolute;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

.map-info-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 6px;
  z-index: 999;
  font-size: 13px;
  line-height: 1.6;
  font-family: 'Courier New', monospace;
  pointer-events: none;
}

.info-row {
  white-space: nowrap;
}

.layer-control-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  z-index: 999;
  font-size: 13px;
  color: #333;
  min-width: 240px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  color: #222;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 6px;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.layer-item label {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.opacity-slider {
  width: 60px;
  cursor: pointer;
}

.opacity-val {
  font-size: 11px;
  color: #666;
  min-width: 32px;
  text-align: right;
}
</style>
