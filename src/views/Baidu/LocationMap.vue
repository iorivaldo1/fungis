<template>
  <div class="location-page">
    <div id="baiduMapContainer"></div>

    <!-- 顶部控制面板区域 -->
    <div class="top-panels-container">
      <!-- 点击信息面板 -->
      <ClickInfoPanel 
        :point="clickPoint" 
        v-model:checked="isClickChecked" 
        @change="handleClickCheckedChange" 
        crs="bd09" 
      />

      <!-- 坐标定位面板 -->
      <LocatePanel crs="bd09" @locate="handleLocate" @clear="handleClear" />

      <!-- SHP 文件面板 -->
      <ShpPanel 
        @add-layer="handleShpAddLayer" 
        @toggle-layer="handleShpToggleLayer" 
        @delete-layer="handleShpDeleteLayer" 
        @focus-layer="handleShpFocusLayer" 
        @focus-feature="handleShpFocusFeature"
        @toggle-label-field="handleShpToggleLabelField"
        @clear-all="handleShpClearAll" 
      />

      <!-- 定位结果表格面板 -->
      <LocationTablePanel 
        :points="locationList" 
        @toggle-visible="handleToggleVisible"
        @delete-item="handleDeleteItem"
        @focus-item="handleFocusItem"
        @clear-all="handleClear"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { loadBaiduMapScript, wgs84ToGcj02, gcj02ToBd09 } from '@/utils/baiduUtils'
import ClickInfoPanel from '@/components/ClickInfoPanel.vue'
import LocatePanel from '@/components/LocatePanel.vue'
import LocationTablePanel from '@/components/LocationTablePanel.vue'
import ShpPanel from '@/components/ShpPanel.vue'
import { renderGeoJsonToBaidu, flashFeatureBaidu, renderGeoJsonLabelsBaidu } from '@/utils/shpMapRenderer.js'

const BAIDU_AK = 'MUBHlQKKLvig0Ia3QEAOzio46qq6foiT'

const clickPoint = ref(null)
const isClickChecked = ref(false)
const locationList = ref([])

let map = null
let clickMarker = null
let idCounter = 1

const updateClickMarker = (pointObj) => {
  if (!map) return
  if (clickMarker) {
    map.removeOverlay(clickMarker)
    clickMarker = null
  }
  if (isClickChecked.value && clickPoint.value) {
    const BMap = window.BMap || window.BMapGL
    const pt = pointObj || new BMap.Point(clickPoint.value.lng, clickPoint.value.lat)
    if (typeof window.BMAP_SYMBOL_CIRCLE !== 'undefined') {
      const symbol = new BMap.Symbol(window.BMAP_SYMBOL_CIRCLE, {
        scale: 6,
        fillColor: '#ef4444',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2
      })
      clickMarker = new BMap.Marker(pt, { icon: symbol })
    } else {
      const icon = new BMap.Icon(
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2 IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iI2VmNDQ0NCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=',
        new BMap.Size(16, 16),
        { anchor: new BMap.Size(8, 8) }
      )
      clickMarker = new BMap.Marker(pt, { icon })
    }
    map.addOverlay(clickMarker)
  }
}

const handleClickCheckedChange = (val) => {
  isClickChecked.value = val
  updateClickMarker()
}

const initMap = async () => {
  await loadBaiduMapScript(BAIDU_AK)
  const BMap = window.BMap || window.BMapGL
  map = new BMap.Map("baiduMapContainer")

  const initGcj = wgs84ToGcj02(103.064, 30.01)
  const [initBdLng, initBdLat] = gcj02ToBd09(initGcj[0], initGcj[1])
  const centerPoint = new BMap.Point(initBdLng, initBdLat)
  map.centerAndZoom(centerPoint, 14)
  map.enableScrollWheelZoom(true)

  if (map.setDefaultCursor) {
    map.setDefaultCursor("default")
  }
  if (map.setDraggingCursor) {
    map.setDraggingCursor("default")
  }

  const mapTypeCtrl = new BMap.MapTypeControl({
    anchor: window.BMAP_ANCHOR_BOTTOM_RIGHT
  })
  map.addControl(mapTypeCtrl)

  map.addEventListener('click', (e) => {
    if (!isClickChecked.value) return
    if (e.point) {
      clickPoint.value = {
        lng: e.point.lng,
        lat: e.point.lat
      }
      updateClickMarker(e.point)
    }
  })
}

const handleLocate = ({ longitude, latitude, rawX, rawY }) => {
  const BMap = window.BMap || window.BMapGL
  const gcj = wgs84ToGcj02(longitude, latitude)
  const [bdLng, bdLat] = gcj02ToBd09(gcj[0], gcj[1])
  const point = new BMap.Point(bdLng, bdLat)
  const currentId = idCounter++

  // 添加蓝色定位圆点标记
  let marker
  if (typeof window.BMAP_SYMBOL_CIRCLE !== 'undefined') {
    const symbol = new BMap.Symbol(window.BMAP_SYMBOL_CIRCLE, {
      scale: 6,
      fillColor: '#3b82f6',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2
    })
    marker = new BMap.Marker(point, { icon: symbol })
  } else {
    const icon = new BMap.Icon(
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2 IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iIzNiODJmNiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=',
      new BMap.Size(16, 16),
      { anchor: new BMap.Size(8, 8) }
    )
    marker = new BMap.Marker(point, { icon })
  }
  map.addOverlay(marker)

  // 添加文字标签（标识 ID 和 坐标）
  const labelText = `ID: ${currentId} (${rawX.toFixed(2)}, ${rawY.toFixed(2)})`
  const label = new BMap.Label(labelText, {
    position: point,
    offset: new BMap.Size(-40, -35)
  })
  label.setStyle({
    color: '#1e293b',
    fontSize: '12px',
    fontWeight: 'bold',
    border: '1px solid #3b82f6',
    padding: '4px 8px',
    background: '#ffffff',
    borderRadius: '4px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
  })
  map.addOverlay(label)

  // 保存记录对象
  const item = {
    id: currentId,
    longitude,
    latitude,
    bdLng,
    bdLat,
    rawX,
    rawY,
    visible: true,
    markerOverlay: marker,
    labelOverlay: label
  }

  locationList.value.push(item)

  // 移动地图视角到该坐标点
  map.centerAndZoom(point, 15)
}

const handleToggleVisible = (item) => {
  item.visible = !item.visible
  if (!map) return

  if (item.visible) {
    map.addOverlay(item.markerOverlay)
    map.addOverlay(item.labelOverlay)
  } else {
    map.removeOverlay(item.markerOverlay)
    map.removeOverlay(item.labelOverlay)
  }
}

const handleDeleteItem = (item) => {
  if (map) {
    map.removeOverlay(item.markerOverlay)
    map.removeOverlay(item.labelOverlay)
  }
  locationList.value = locationList.value.filter(i => i.id !== item.id)
}

const handleFocusItem = (item) => {
  if (map && item) {
    const BMap = window.BMap || window.BMapGL
    const point = new BMap.Point(item.bdLng, item.bdLat)
    map.centerAndZoom(point, 15)
  }
}

const handleClear = () => {
  locationList.value.forEach(item => {
    if (map) {
      map.removeOverlay(item.markerOverlay)
      map.removeOverlay(item.labelOverlay)
    }
  })
  locationList.value = []
}

// SHP 图层渲染与交互处理
const shpLayersMap = {}

const handleShpAddLayer = (layer) => {
  if (!map) return
  const { overlays, boundsPoints } = renderGeoJsonToBaidu(map, layer.geojson, layer.color)
  shpLayersMap[layer.id] = { overlays, boundsPoints }
  if (boundsPoints.length > 0) {
    map.setViewport(boundsPoints)
  }
}

const handleShpToggleLayer = (layer) => {
  if (!map || !shpLayersMap[layer.id]) return
  const { overlays } = shpLayersMap[layer.id]
  overlays.forEach(overlay => {
    if (layer.visible) {
      map.addOverlay(overlay)
    } else {
      map.removeOverlay(overlay)
    }
  })
}

const shpLabelOverlaysMap = {}

const handleShpToggleLabelField = ({ layer, field }) => {
  if (!map || !layer) return
  if (shpLabelOverlaysMap[layer.id]) {
    shpLabelOverlaysMap[layer.id].forEach(lbl => map.removeOverlay(lbl))
    delete shpLabelOverlaysMap[layer.id]
  }
  if (field) {
    const labels = renderGeoJsonLabelsBaidu(map, layer.geojson, field, '#1e293b')
    shpLabelOverlaysMap[layer.id] = labels
  }
}

const handleShpDeleteLayer = (layer) => {
  if (!map || !shpLayersMap[layer.id]) return
  const { overlays } = shpLayersMap[layer.id]
  overlays.forEach(overlay => map.removeOverlay(overlay))
  delete shpLayersMap[layer.id]
  if (shpLabelOverlaysMap[layer.id]) {
    shpLabelOverlaysMap[layer.id].forEach(lbl => map.removeOverlay(lbl))
    delete shpLabelOverlaysMap[layer.id]
  }
}

const handleShpFocusLayer = (layer) => {
  if (!map || !shpLayersMap[layer.id]) return
  const { boundsPoints } = shpLayersMap[layer.id]
  if (boundsPoints && boundsPoints.length > 0) {
    map.setViewport(boundsPoints)
  }
}

const handleShpFocusFeature = (feature) => {
  if (!map) return
  flashFeatureBaidu(map, feature)
}

const handleShpClearAll = () => {
  if (!map) return
  Object.keys(shpLayersMap).forEach(layerId => {
    const { overlays } = shpLayersMap[layerId]
    overlays.forEach(overlay => map.removeOverlay(overlay))
  })
  Object.keys(shpLayersMap).forEach(key => delete shpLayersMap[key])

  Object.keys(shpLabelOverlaysMap).forEach(layerId => {
    shpLabelOverlaysMap[layerId].forEach(lbl => map.removeOverlay(lbl))
  })
  Object.keys(shpLabelOverlaysMap).forEach(key => delete shpLabelOverlaysMap[key])
}

onMounted(async () => {
  try {
    await initMap()
  } catch (error) {
    console.error('加载资源失败:', error)
    alert('加载百度地图资源失败，请刷新页面重试')
  }
})

onUnmounted(() => {
  if (map) {
    map = null
  }
})
</script>

<style scoped>
.location-page {
  width: 100%;
  height: 100%;
  position: relative;
}

#baiduMapContainer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

#baiduMapContainer,
#baiduMapContainer :deep(*) {
  cursor: default !important;
}

.top-panels-container {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 450;
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  align-items: flex-start;
  pointer-events: none;
}

.top-panels-container > * {
  pointer-events: auto;
}
</style>

