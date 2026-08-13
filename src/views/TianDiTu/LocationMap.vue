<template>
  <div class="location-page">
    <div id="mapDiv"></div>

    <!-- 顶部控制面板区域 -->
    <div class="top-panels-container">
      <!-- 点击信息面板 -->
      <div class="click-info" :class="{ collapsed: isClickCollapsed }">
        <div class="info-title" @click="toggleClickCollapse">
          <span>点击信息</span>
          <IconChevronDown class="collapse-icon" :class="{ rotated: isClickCollapsed }" width="20" height="20" />
        </div>
        <transition name="slide-fade">
          <div v-show="!isClickCollapsed" class="info-content">
            <div class="info-item">经度: {{ clickInfo.longitude }}</div>
            <div class="info-item">纬度: {{ clickInfo.latitude }}</div>
          </div>
        </transition>
      </div>

      <!-- 坐标定位面板 -->
      <div class="locate-control" :class="{ collapsed: isLocateCollapsed }">
        <div class="info-title" @click="toggleLocateCollapse">
          <span>坐标定位</span>
          <IconChevronDown class="collapse-icon" :class="{ rotated: isLocateCollapsed }" width="20" height="20" />
        </div>
        <transition name="slide-fade">
          <div v-show="!isLocateCollapsed" class="info-content locate-content">
            <div class="locate-item">
              <label>坐标系:</label>
              <select v-model="locateForm.type" class="locate-select">
                <option value="WGS84">WGS84 (经纬度)</option>
                <option value="CGCS2000">CGCS2000 投影</option>
              </select>
            </div>
            <div class="locate-item" v-if="locateForm.type === 'WGS84'">
              <label>格 式:</label>
              <select v-model="locateForm.format" class="locate-select">
                <option value="degree">度 (DD)</option>
                <option value="dms">度分秒 (DMS)</option>
              </select>
            </div>
            <div class="locate-item" v-if="locateForm.type === 'CGCS2000'">
              <label>分带号:</label>
              <select v-model="locateForm.zone" class="locate-select">
                <option v-for="z in 21" :key="z + 24" :value="z + 24">{{ z + 24 }}带 (中央经线{{ (z + 24) * 3 }}°)</option>
              </select>
            </div>
            <div class="locate-item" v-if="locateForm.type !== 'WGS84' || locateForm.format === 'degree'">
              <label>{{ locateForm.type === 'CGCS2000' ? 'X:' : '经度:' }}</label>
              <input type="number" v-model="locateForm.x" class="locate-input" :placeholder="locateForm.type === 'CGCS2000' ? '输入X坐标' : '输入经度'">
            </div>
            <div class="locate-item" v-if="locateForm.type !== 'WGS84' || locateForm.format === 'degree'">
              <label>{{ locateForm.type === 'CGCS2000' ? 'Y:' : '纬度:' }}</label>
              <input type="number" v-model="locateForm.y" class="locate-input" :placeholder="locateForm.type === 'CGCS2000' ? '输入Y坐标' : '输入纬度'">
            </div>
            <div class="locate-item dms-item" v-if="locateForm.type === 'WGS84' && locateForm.format === 'dms'">
              <label>经度:</label>
              <div class="dms-inputs">
                <input type="number" v-model="locateForm.dms.x_deg" class="dms-input" placeholder="度">°
                <input type="number" v-model="locateForm.dms.x_min" class="dms-input" placeholder="分">'
                <input type="number" v-model="locateForm.dms.x_sec" class="dms-input" placeholder="秒" step="0.01">"
              </div>
            </div>
            <div class="locate-item dms-item" v-if="locateForm.type === 'WGS84' && locateForm.format === 'dms'">
              <label>纬度:</label>
              <div class="dms-inputs">
                <input type="number" v-model="locateForm.dms.y_deg" class="dms-input" placeholder="度">°
                <input type="number" v-model="locateForm.dms.y_min" class="dms-input" placeholder="分">'
                <input type="number" v-model="locateForm.dms.y_sec" class="dms-input" placeholder="秒" step="0.01">"
              </div>
            </div>
            <div class="locate-actions">
              <button class="locate-btn" @click="flyToInputPoint">定位</button>
              <button class="locate-btn clear-btn" @click="clearInputPoints">清除</button>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import proj4 from 'proj4'
import { loadTiandituScript } from '@/utils/tiandituToken.js'
import IconChevronDown from '@/components/icons/IconChevronDown.vue'

const isClickCollapsed = ref(true)
const isLocateCollapsed = ref(true)

const clickInfo = ref({
  longitude: '--',
  latitude: '--'
})

const locateForm = ref({
  type: 'WGS84',
  format: 'degree',
  x: '',
  y: '',
  zone: 34,
  dms: {
    x_deg: '', x_min: '', x_sec: '',
    y_deg: '', y_min: '', y_sec: ''
  }
})

let map = null
let inputOverlays = []

const toggleClickCollapse = () => {
  isClickCollapsed.value = !isClickCollapsed.value
}

const toggleLocateCollapse = () => {
  isLocateCollapsed.value = !isLocateCollapsed.value
}

const initMap = () => {
  map = new window.T.Map("mapDiv")
  const zoom = 14
  map.centerAndZoom(new window.T.LngLat(103.064, 30.01), zoom)

  const ctrl = new window.T.Control.MapType({
    position: window.T_ANCHOR_BOTTOM_RIGHT
  })
  map.addControl(ctrl)

  map.addEventListener('click', (e) => {
    if (e.lnglat) {
      clickInfo.value = {
        longitude: e.lnglat.getLng().toFixed(6),
        latitude: e.lnglat.getLat().toFixed(6)
      }
    }
  })
}

const flyToInputPoint = () => {
  let x, y

  if (locateForm.value.type === 'WGS84' && locateForm.value.format === 'dms') {
    const parseDMS = (deg, min, sec) => {
      const d = parseFloat(deg || 0)
      const m = Math.abs(parseFloat(min || 0))
      const s = Math.abs(parseFloat(sec || 0))
      const sign = d < 0 || Object.is(d, -0) ? -1 : 1
      return sign * (Math.abs(d) + m / 60 + s / 3600)
    }
    x = parseDMS(locateForm.value.dms.x_deg, locateForm.value.dms.x_min, locateForm.value.dms.x_sec)
    y = parseDMS(locateForm.value.dms.y_deg, locateForm.value.dms.y_min, locateForm.value.dms.y_sec)
  } else {
    x = parseFloat(locateForm.value.x)
    y = parseFloat(locateForm.value.y)
  }

  if (isNaN(x) || isNaN(y)) {
    alert('请输入有效的坐标数值')
    return
  }

  let longitude, latitude

  if (locateForm.value.type === 'WGS84') {
    longitude = x
    latitude = y
  } else if (locateForm.value.type === 'CGCS2000') {
    const zone = locateForm.value.zone
    const centralMeridian = zone * 3
    const cgcs2000Str = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`
    const wgs84Str = `+proj=longlat +datum=WGS84 +no_defs`

    let actualX = x
    if (x > 10000000) {
      actualX = x % 1000000
    }

    try {
      const [lng, lat] = proj4(cgcs2000Str, wgs84Str, [actualX, y])
      longitude = lng
      latitude = lat
    } catch (e) {
      alert('坐标转换失败，请检查输入')
      return
    }
  }

  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    alert('坐标转换或输入有误，经纬度超出范围')
    return
  }

  const point = new window.T.LngLat(longitude, latitude)

  // 添加标记点
  const marker = new window.T.Marker(point)
  map.addOverLay(marker)
  inputOverlays.push(marker)

  // 添加文字标签
  const labelText = `定位点 (${x.toFixed(2)}, ${y.toFixed(2)})`
  const label = new window.T.Label({
    text: labelText,
    position: point,
    offset: new window.T.Point(0, -30)
  })
  map.addOverLay(label)
  inputOverlays.push(label)

  // 移动地图视角到该坐标点
  map.centerAndZoom(point, 15)
}

const clearInputPoints = () => {
  inputOverlays.forEach(overlay => {
    if (map) {
      map.removeOverLay(overlay)
    }
  })
  inputOverlays = []
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

.click-info,
.locate-control {
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 450;
  background: rgba(255, 255, 255, 0.95);
  padding: 0;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  min-width: 240px;
  transition: all 0.3s ease;
}

.click-info.collapsed,
.locate-control.collapsed {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.info-title {
  color: #1a202c;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  padding: 10px 16px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.3s ease;
}

.info-title:hover {
  background: #e2e8f0;
}

.collapse-icon {
  transition: transform 0.3s ease;
  flex-shrink: 0;
  color: #64748b;
}

.collapse-icon.rotated {
  transform: rotate(-180deg);
}

.info-content {
  display: flex;
  flex-direction: column;
}

.info-item {
  color: #334155;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  padding: 8px 16px;
  transition: background-color 0.2s ease;
}

.info-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.locate-content {
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.locate-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.locate-item label {
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.locate-select,
.locate-input {
  width: 145px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.locate-select:focus,
.locate-input:focus {
  border-color: #3b82f6;
}

.locate-select option {
  background: #ffffff;
  color: #1e293b;
}

.dms-inputs {
  display: flex;
  align-items: center;
  gap: 2px;
  color: #334155;
  font-size: 13px;
}

.dms-input {
  width: 36px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  padding: 5px 4px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  text-align: center;
  transition: border-color 0.2s;
}

.dms-input:focus {
  border-color: #3b82f6;
}

.dms-input[placeholder="秒"] {
  width: 48px;
}

.dms-input::-webkit-outer-spin-button,
.dms-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.dms-input[type=number] {
  -moz-appearance: textfield;
}

.locate-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  gap: 10px;
}

.locate-btn {
  flex: 1;
  background: #3b82f6;
  color: white;
  border: none;
  padding: 7px 0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.2s;
}

.locate-btn:hover {
  background: #2563eb;
}

.clear-btn {
  background: #ef4444;
}

.clear-btn:hover {
  background: #dc2626;
}

/* 过渡动画 */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-5px);
  opacity: 0;
}
</style>
