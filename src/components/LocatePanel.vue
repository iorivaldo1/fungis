<template>
  <div class="locate-control-panel" :class="[theme, { collapsed: isCollapsed }]">
    <div class="info-title" @click="toggleCollapse">
      <span>{{ title }}</span>
      <IconChevronDown class="collapse-icon" :class="{ rotated: isCollapsed }" width="20" height="20" />
    </div>
    <transition name="slide-fade">
      <div v-show="!isCollapsed" class="info-content locate-content">
        <div class="locate-item">
          <label>坐标系:</label>
          <select v-model="locateForm.type" class="locate-select">
            <option v-for="item in crsOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
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
          <button class="locate-btn" @click="handleLocate">定位</button>
          <button class="locate-btn clear-btn" @click="handleClear">清除</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import proj4 from 'proj4'
import { bd09ToWgs84 } from '@/utils/baiduUtils'
import IconChevronDown from '@/components/icons/IconChevronDown.vue'

const props = defineProps({
  title: {
    type: String,
    default: '坐标定位'
  },
  theme: {
    type: String,
    default: 'light' // 'light' | 'dark'
  },
  crs: {
    type: String,
    default: 'wgs84' // 'wgs84' | 'bd09'
  },
  defaultCollapsed: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['locate', 'clear'])

const isCollapsed = ref(props.defaultCollapsed)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// 根据父组件坐标系调整显示顺序
const crsOptions = computed(() => {
  if (props.crs === 'bd09') {
    return [
      { label: 'BD09 (百度坐标)', value: 'BD09' },
      { label: 'WGS84 (经纬度)', value: 'WGS84' },
      { label: 'CGCS2000 投影', value: 'CGCS2000' }
    ]
  } else {
    return [
      { label: 'WGS84 (经纬度)', value: 'WGS84' },
      { label: 'BD09 (百度坐标)', value: 'BD09' },
      { label: 'CGCS2000 投影', value: 'CGCS2000' }
    ]
  }
})

const initialType = props.crs === 'bd09' ? 'BD09' : 'WGS84'

const locateForm = ref({
  type: initialType,
  format: 'degree',
  x: '',
  y: '',
  zone: 34,
  dms: {
    x_deg: '', x_min: '', x_sec: '',
    y_deg: '', y_min: '', y_sec: ''
  }
})

const handleLocate = () => {
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
  } else if (locateForm.value.type === 'BD09') {
    const [wLng, wLat] = bd09ToWgs84(x, y)
    longitude = wLng
    latitude = wLat
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

  emit('locate', {
    longitude,
    latitude,
    rawX: x,
    rawY: y,
    type: locateForm.value.type
  })
}

const handleClear = () => {
  emit('clear')
}
</script>

<style scoped>
.locate-control-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 450;
  border-radius: 12px;
  overflow: hidden;
  min-width: 240px;
  transition: all 0.3s ease;
}

/* Light Theme (TianDiTu / Baidu) */
.locate-control-panel.light {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.locate-control-panel.light.collapsed {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.locate-control-panel.light .info-title {
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

.locate-control-panel.light .info-title:hover {
  background: #e2e8f0;
}

.locate-control-panel.light .collapse-icon {
  color: #64748b;
}

.locate-control-panel.light label {
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.locate-control-panel.light .locate-select,
.locate-control-panel.light .locate-input,
.locate-control-panel.light .dms-input {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
}

.locate-control-panel.light .dms-inputs {
  color: #334155;
}

/* Dark Theme (Cesium) */
.locate-control-panel.dark {
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.locate-control-panel.dark.collapsed {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.locate-control-panel.dark .info-title {
  color: white;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(60, 60, 60, 0.6) 0%, rgba(80, 80, 80, 0.5) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.3s ease;
}

.locate-control-panel.dark .info-title:hover {
  background: linear-gradient(135deg, rgba(70, 70, 70, 0.7) 0%, rgba(90, 90, 90, 0.6) 100%);
}

.locate-control-panel.dark .collapse-icon {
  color: #ffffff;
}

.locate-control-panel.dark label {
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.locate-control-panel.dark .locate-select,
.locate-control-panel.dark .locate-input,
.locate-control-panel.dark .dms-input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
}

.locate-control-panel.dark .locate-select option {
  background: #1e293b;
  color: #f8fafc;
}

.locate-control-panel.dark .dms-inputs {
  color: rgba(255, 255, 255, 0.9);
}

/* Common Inner Form Styles */
.collapse-icon {
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.collapse-icon.rotated {
  transform: rotate(-180deg);
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

.locate-select,
.locate-input {
  width: 145px;
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

.dms-inputs {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
}

.dms-input {
  width: 36px;
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
