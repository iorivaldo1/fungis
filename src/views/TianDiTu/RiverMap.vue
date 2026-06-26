<template>
  <div class="river-page">
    <div id="mapDiv"></div>

    <div id="layOpaCT">
      <span>WMTS图层透明度控制</span>
      <input type="range" min="0" max="100" v-model="opacity" @input="handleOpacityChange" class="opacity-slider" />
      <div class="opacity-value">{{ opacity }}%</div>
    </div>

    <!-- 页面说明 -->
    <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
      <div class="info-container" v-if="showPageInfo">
        <div class="info-header">
          <div class="info-title">📌 页面说明</div>
          <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
        </div>
        <div class="info-item">1. 加载Geoserver发布的WMTS河流图层</div>
        <div class="info-item">2. 支持调节图层透明度</div>
        <div class="info-item">3. 限制了显示范围，仅显示切片有效区域</div>
        <div class="info-item">4. 有四川全部河流数据，服务器资源有限，只显示雅安河流</div>
      </div>
      <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
        <span>📌</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const opacity = ref(100)
const showPageInfo = ref(true)
let map = null
let wmtsLayer = null

const goBack = () => {
  router.push('/')
}

const handleOpacityChange = () => {
  if (wmtsLayer) {
    wmtsLayer.setOpacity(opacity.value / 100)
  }
}

const loadTiandituScript = () => {
  return new Promise((resolve, reject) => {
    if (window.T) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = '/tianditu.api.js'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}



const initMap = () => {
  map = new window.T.Map("mapDiv")
  const zoom = 14
  const tileLevel = 18
  map.centerAndZoom(new window.T.LngLat(103, 30), zoom)

  const imageURL =
    import.meta.env.VITE_API_BASE_URL + '/geoserver/gwc/service/wmts?' +
    'Request=GetTile' +
    '&Service=WMTS' +
    '&Version=1.0.0' +
    '&LAYER=hydro%3Aya_river' +
    '&STYLE=' +
    '&Format=image%2Fpng' +
    '&TILEMATRIXSET=EPSG%3A900913' +
    '&TILEMATRIX=EPSG%3A900913%3A{z}' +
    '&TILEROW={y}' +
    '&TILECOL={x}'
  // '&authkey=' + '9cdfeadf8dfd3b043'

  //限制显示范围，只显示切片有效区域
  //否则会显示大片空白
  const southWest = new window.T.LngLat(101.9642680901, 28.862478591599995)
  const northEast = new window.T.LngLat(103.4113808093, 30.922261509850014)
  const f_bounds = new window.T.LngLatBounds(southWest, northEast)

  wmtsLayer = new window.T.TileLayer(imageURL, {
    minZoom: 1,
    maxZoom: tileLevel,
    bounds: f_bounds
  })
  wmtsLayer.setZIndex(1000)
  map.addLayer(wmtsLayer)

  const ctrl = new window.T.Control.MapType({
    position: window.T_ANCHOR_BOTTOM_RIGHT
  })
  map.addControl(ctrl)
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
.river-page {
  width: 100%;
  height: 100%;
  position: relative;
}

.header-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  padding: 0 20px;
  z-index: 1000;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.back-btn svg {
  width: 20px;
  height: 20px;
}

.header-bar h1 {
  color: white;
  font-size: 24px;
  margin-left: 30px;
  font-weight: 600;
}

#mapDiv {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

#layOpaCT {
  padding: 15px;
  z-index: 450;
  position: absolute;
  top: 20px;
  right: 20px;
  width: 220px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 14px;
  color: white;
  font-weight: 500;
}

.opacity-slider {
  width: 100%;
  margin-top: 15px;
  height: 6px;
  border-radius: 3px;
  background: rgba(10, 240, 232, 0.2);
  outline: none;
}

.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.opacity-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.opacity-value {
  text-align: center;
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
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

.info-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
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
</style>
