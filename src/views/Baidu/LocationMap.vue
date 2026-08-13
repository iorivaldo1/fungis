<template>
  <div class="location-page">
    <div id="baiduMapContainer"></div>

    <!-- 顶部控制面板区域 -->
    <div class="top-panels-container">
      <!-- 点击信息面板 -->
      <ClickInfoPanel :point="clickPoint" crs="bd09" />

      <!-- 坐标定位面板 -->
      <LocatePanel crs="bd09" @locate="handleLocate" @clear="handleClear" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { loadBaiduMapScript, wgs84ToGcj02, gcj02ToBd09 } from '@/utils/baiduUtils'
import ClickInfoPanel from '@/components/ClickInfoPanel.vue'
import LocatePanel from '@/components/LocatePanel.vue'

const BAIDU_AK = 'MUBHlQKKLvig0Ia3QEAOzio46qq6foiT'

const clickPoint = ref(null)

let map = null
let inputOverlays = []
let clickMarker = null

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
    if (e.point) {
      clickPoint.value = {
        lng: e.point.lng,
        lat: e.point.lat
      }

      if (clickMarker) {
        map.removeOverlay(clickMarker)
      }
      const BMap = window.BMap || window.BMapGL
      if (typeof window.BMAP_SYMBOL_CIRCLE !== 'undefined') {
        const symbol = new BMap.Symbol(window.BMAP_SYMBOL_CIRCLE, {
          scale: 6,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        })
        clickMarker = new BMap.Marker(e.point, { icon: symbol })
      } else {
        const icon = new BMap.Icon(
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2 IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iI2VmNDQ0NCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=',
          new BMap.Size(16, 16),
          { anchor: new BMap.Size(8, 8) }
        )
        clickMarker = new BMap.Marker(e.point, { icon })
      }
      map.addOverlay(clickMarker)
    }
  })
}

const handleLocate = ({ longitude, latitude, rawX, rawY }) => {
  const BMap = window.BMap || window.BMapGL
  const gcj = wgs84ToGcj02(longitude, latitude)
  const [bdLng, bdLat] = gcj02ToBd09(gcj[0], gcj[1])
  const point = new BMap.Point(bdLng, bdLat)

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
  inputOverlays.push(marker)

  // 添加文字标签
  const labelText = `定位点 (${rawX.toFixed(2)}, ${rawY.toFixed(2)})`
  const label = new BMap.Label(labelText, {
    position: point,
    offset: new BMap.Size(-30, -35)
  })
  label.setStyle({
    color: '#1e293b',
    fontSize: '12px',
    border: '1px solid #cbd5e1',
    padding: '4px 8px',
    background: '#ffffff',
    borderRadius: '4px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
  })
  map.addOverlay(label)
  inputOverlays.push(label)

  // 移动地图视角到该坐标点
  map.centerAndZoom(point, 15)
}

const handleClear = () => {
  inputOverlays.forEach(overlay => {
    if (map) {
      map.removeOverlay(overlay)
    }
  })
  inputOverlays = []
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
