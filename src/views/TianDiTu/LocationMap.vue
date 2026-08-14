<template>
  <div class="location-page">
    <div id="mapDiv"></div>

    <!-- 顶部控制面板区域 -->
    <div class="top-panels-container">
      <!-- 点击信息面板 -->
      <ClickInfoPanel :point="clickPoint" crs="wgs84" />

      <!-- 坐标定位面板 -->
      <LocatePanel @locate="handleLocate" @clear="handleClear" />

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

const clickPoint = ref(null)
const locationList = ref([])

let map = null
let clickMarker = null
let idCounter = 1

const initMap = () => {
  map = new window.T.Map("mapDiv")
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
    if (e.lnglat) {
      clickPoint.value = {
        lng: e.lnglat.getLng(),
        lat: e.lnglat.getLat()
      }

      if (clickMarker) {
        map.removeOverLay(clickMarker)
      }
      const redDotIcon = new window.T.Icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2 IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iI2VmNDQ0NCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=',
        iconSize: new window.T.Point(16, 16),
        iconAnchor: new window.T.Point(8, 8)
      })
      clickMarker = new window.T.Marker(e.lnglat, { icon: redDotIcon })
      map.addOverLay(clickMarker)
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

#mapDiv,
#mapDiv :deep(*) {
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

