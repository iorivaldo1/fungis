<template>
  <div class="location-page">
    <div id="mapDiv"></div>

    <!-- 顶部控制面板区域 -->
    <div class="top-panels-container">
      <!-- 点击信息面板 -->
      <ClickInfoPanel 
        :point="clickPoint" 
        v-model:checked="isClickChecked" 
        @change="handleClickCheckedChange" 
        crs="wgs84" 
      />

      <!-- 坐标定位面板 -->
      <LocatePanel @locate="handleLocate" @clear="handleClear" />

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

      <!-- 地图测量工具面板 -->
      <MeasurePanel :map="mapInstance" />

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
import { loadTiandituScript } from '@/utils/tiandituToken.js'
import ClickInfoPanel from '@/components/ClickInfoPanel.vue'
import LocatePanel from '@/components/LocatePanel.vue'
import LocationTablePanel from '@/components/LocationTablePanel.vue'
import ShpPanel from '@/components/ShpPanel.vue'
import MeasurePanel from '@/components/MeasurePanel.vue'
import { renderGeoJsonToTianditu, flashFeatureTianditu, renderGeoJsonLabelsTianditu } from '@/utils/shpMapRenderer.js'

const clickPoint = ref(null)
const isClickChecked = ref(false)
const locationList = ref([])
const mapInstance = ref(null)

let map = null
let clickMarker = null
let idCounter = 1

const updateClickMarker = (lnglatObj) => {
  if (!map) return
  if (clickMarker) {
    map.removeOverLay(clickMarker)
    clickMarker = null
  }
  if (isClickChecked.value && clickPoint.value) {
    const pt = lnglatObj || new window.T.LngLat(clickPoint.value.lng, clickPoint.value.lat)
    const redDotIcon = new window.T.Icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2 IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iI2VmNDQ0NCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=',
      iconSize: new window.T.Point(16, 16),
      iconAnchor: new window.T.Point(8, 8)
    })
    clickMarker = new window.T.Marker(pt, { icon: redDotIcon })
    map.addOverLay(clickMarker)
  }
}

const handleClickCheckedChange = (val) => {
  isClickChecked.value = val
  updateClickMarker()
}

const initMap = () => {
  map = new window.T.Map("mapDiv")
  mapInstance.value = map
  const zoom = 14
  map.centerAndZoom(new window.T.LngLat(103.064, 30.01), zoom)

  if (map.setDefaultCursor) {
    map.setDefaultCursor("default")
  }
  if (map.setDraggingCursor) {
    map.setDraggingCursor("default")
  }

  const ctrl = new window.T.Control.MapType({
    position: window.T_ANCHOR_BOTTOM_RIGHT
  })
  map.addControl(ctrl)

  map.addEventListener('click', (e) => {
    if (!isClickChecked.value) return
    if (e.lnglat) {
      clickPoint.value = {
        lng: e.lnglat.getLng(),
        lat: e.lnglat.getLat()
      }
      updateClickMarker(e.lnglat)
    }
  })
}

const handleLocate = ({ longitude, latitude, rawX, rawY }) => {
  const point = new window.T.LngLat(longitude, latitude)
  const currentId = idCounter++

  // 添加蓝色定位圆点标记
  const blueDotIcon = new window.T.Icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2 IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iIzNiODJmNiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=',
    iconSize: new window.T.Point(16, 16),
    iconAnchor: new window.T.Point(8, 8)
  })
  const marker = new window.T.Marker(point, { icon: blueDotIcon })
  map.addOverLay(marker)

  // 添加包含 ID 和坐标信息的 HTML 文字标签
  const labelText = `<span style="background:#3b82f6;color:#ffffff;padding:2px 6px;border-radius:4px;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);">ID: ${currentId}</span> <span style="background:#ffffff;color:#1e293b;padding:2px 6px;border-radius:4px;font-size:12px;border:1px solid #cbd5e1;box-shadow:0 2px 4px rgba(0,0,0,0.15);">(${rawX.toFixed(2)}, ${rawY.toFixed(2)})</span>`
  const label = new window.T.Label({
    text: labelText,
    position: point,
    offset: new window.T.Point(-40, -35)
  })
  map.addOverLay(label)

  // 保存记录对象
  const item = {
    id: currentId,
    longitude,
    latitude,
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
    map.addOverLay(item.markerOverlay)
    map.addOverLay(item.labelOverlay)
  } else {
    map.removeOverLay(item.markerOverlay)
    map.removeOverLay(item.labelOverlay)
  }
}

const handleDeleteItem = (item) => {
  if (map) {
    map.removeOverLay(item.markerOverlay)
    map.removeOverLay(item.labelOverlay)
  }
  locationList.value = locationList.value.filter(i => i.id !== item.id)
}

const handleFocusItem = (item) => {
  if (map && item) {
    const point = new window.T.LngLat(item.longitude, item.latitude)
    map.centerAndZoom(point, 15)
  }
}

const handleClear = () => {
  locationList.value.forEach(item => {
    if (map) {
      map.removeOverLay(item.markerOverlay)
      map.removeOverLay(item.labelOverlay)
    }
  })
  locationList.value = []
}

// SHP 图层渲染与交互处理
const shpLayersMap = {}

const handleShpAddLayer = (layer) => {
  if (!map) return
  const { overlays, boundsPoints } = renderGeoJsonToTianditu(map, layer.geojson, layer.color)
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
      map.addOverLay(overlay)
    } else {
      map.removeOverLay(overlay)
    }
  })
}

const shpLabelOverlaysMap = {}

const handleShpToggleLabelField = ({ layer, field }) => {
  if (!map || !layer) return
  if (shpLabelOverlaysMap[layer.id]) {
    shpLabelOverlaysMap[layer.id].forEach(lbl => map.removeOverLay(lbl))
    delete shpLabelOverlaysMap[layer.id]
  }
  if (field) {
    const labels = renderGeoJsonLabelsTianditu(map, layer.geojson, field, '#1e293b')
    shpLabelOverlaysMap[layer.id] = labels
  }
}

const handleShpDeleteLayer = (layer) => {
  if (!map || !shpLayersMap[layer.id]) return
  const { overlays } = shpLayersMap[layer.id]
  overlays.forEach(overlay => map.removeOverLay(overlay))
  delete shpLayersMap[layer.id]
  if (shpLabelOverlaysMap[layer.id]) {
    shpLabelOverlaysMap[layer.id].forEach(lbl => map.removeOverLay(lbl))
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
  flashFeatureTianditu(map, feature)
}

const handleShpClearAll = () => {
  if (!map) return
  Object.keys(shpLayersMap).forEach(layerId => {
    const { overlays } = shpLayersMap[layerId]
    overlays.forEach(overlay => map.removeOverLay(overlay))
  })
  Object.keys(shpLayersMap).forEach(key => delete shpLayersMap[key])

  Object.keys(shpLabelOverlaysMap).forEach(layerId => {
    shpLabelOverlaysMap[layerId].forEach(lbl => map.removeOverLay(lbl))
  })
  Object.keys(shpLabelOverlaysMap).forEach(key => delete shpLabelOverlaysMap[key])
}

onMounted(async () => {
  try {
    await loadTiandituScript()
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
  mapInstance.value = null
})
</script>

<style scoped>
.location-page {
  width: 100%;
  height: 100%;
  position: relative;
}

#mapDiv {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

