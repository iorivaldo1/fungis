<template>
  <button
    id="locationBtn"
    class="location-btn"
    :class="{ 
      active: isActive, 
      loading: isLocating 
    }"
    :style="buttonStyle"
    @click="handleLocationToggle"
    :title="buttonTitle"
    type="button"
  >
    <IconLocation class="location-icon" width="28" height="28" />
  </button>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import * as Cesium from 'cesium'
import L from 'leaflet'
import IconLocation from '@/components/icons/IconLocation.vue'
import { wgs84ToGcj02, gcj02ToBd09 } from '@/utils/baiduUtils.js'

const props = defineProps({
  map: {
    type: [Object, Function],
    default: null
  },
  viewer: {
    type: [Object, Function],
    default: null
  },
  getMap: {
    type: Function,
    default: null
  },
  mapType: {
    type: String,
    default: 'auto' // 'auto' | 'cesium' | 'leaflet' | 'baidu' | 'tianditu'
  },
  crs: {
    type: String,
    default: 'auto' // 'auto' | 'wgs84' | 'bd09'
  },
  bottom: {
    type: [Number, String],
    default: 30
  },
  right: {
    type: [Number, String],
    default: 30
  },
  title: {
    type: String,
    default: '定位到当前位置'
  },
  zoom: {
    type: Number,
    default: 15
  },
  active: {
    type: Boolean,
    default: undefined
  },
  modelValue: {
    type: Boolean,
    default: undefined
  }
})

const emit = defineEmits(['locate', 'error', 'clear', 'change', 'update:active', 'update:modelValue'])

// 是否处于压下/激活状态
const internalActive = ref(false)

const isActive = computed({
  get() {
    if (props.active !== undefined) return props.active
    if (props.modelValue !== undefined) return props.modelValue
    return internalActive.value
  },
  set(val) {
    internalActive.value = val
    emit('update:active', val)
    emit('update:modelValue', val)
    emit('change', val)
  }
})

// 定位加载中动画状态
const isLocating = ref(false)

// 递增请求版本号，防止异步定位冲突
let locateRequestId = 0

// 标记对象引用
let leafletMarker = null
let baiduMarker = null
let tiandituMarker = null
let tiandituLabel = null

const buttonStyle = computed(() => {
  const b = typeof props.bottom === 'number' ? `${props.bottom}px` : props.bottom
  const r = typeof props.right === 'number' ? `${props.right}px` : props.right
  return {
    bottom: b,
    right: r
  }
})

const buttonTitle = computed(() => {
  if (isLocating.value) return '正在重新定位中...'
  if (isActive.value) return '已显示定位点 (再次点击取消定位)'
  return props.title || '定位到当前位置'
})

const resolveMap = () => {
  if (typeof props.getMap === 'function') return props.getMap()
  const m = props.map || props.viewer
  if (typeof m === 'function') return m()
  if (m && typeof m === 'object' && 'value' in m) return m.value
  return m
}

const detectMapType = (m) => {
  if (props.mapType && props.mapType !== 'auto') return props.mapType
  if (!m) return null
  if (m.camera && m.entities) return 'cesium'
  if (m.flyTo && m.addLayer) return 'leaflet'
  if (m.centerAndZoom && m.addOverlay && (window.BMap || window.BMapGL)) return 'baidu'
  if (m.centerAndZoom && m.addOverLay && window.T) return 'tianditu'
  return null
}

const wgs84ToBd09 = (lng, lat) => {
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat)
  return gcj02ToBd09(gcjLng, gcjLat)
}

/**
 * 清除地图上的定位点
 */
const clearLocationFromMap = () => {
  const m = resolveMap()
  if (!m) return
  const currentMapType = detectMapType(m)

  if (currentMapType === 'cesium' && m.entities) {
    try {
      m.entities.removeById('currentLocation')
    } catch (_) {}
  } else if (currentMapType === 'leaflet') {
    if (leafletMarker) {
      try {
        leafletMarker.remove()
      } catch (_) {}
      leafletMarker = null
    }
  } else if (currentMapType === 'baidu') {
    if (baiduMarker && m.removeOverlay) {
      try {
        m.removeOverlay(baiduMarker)
      } catch (_) {}
      baiduMarker = null
    }
  } else if (currentMapType === 'tianditu') {
    if (tiandituMarker && m.removeOverLay) {
      try {
        m.removeOverLay(tiandituMarker)
      } catch (_) {}
      tiandituMarker = null
    }
    if (tiandituLabel && m.removeOverLay) {
      try {
        m.removeOverLay(tiandituLabel)
      } catch (_) {}
      tiandituLabel = null
    }
  }
}

/**
 * 按钮主点击事件处理
 * 点击后：如果在弹起状态，切换为压下状态并重新定位；
 * 如果已是压下状态，切换为弹起状态并清除地图上的定位点。
 */
const handleLocationToggle = () => {
  if (isActive.value) {
    // 当前已处于压下状态 -> 切换为弹起状态，清除定位点，取消当前定位
    locateRequestId++
    isLocating.value = false
    isActive.value = false
    clearLocationFromMap()
    emit('clear')
  } else {
    // 当前处于弹起状态 -> 切换为压下状态，并重新执行定位
    isActive.value = true
    // 每次按下都重新执行定位
    startLocation()
  }
}

/**
 * 发起全新定位
 */
const startLocation = () => {
  const isSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost'
  const currentRequestId = ++locateRequestId

  // 先清理可能存在的旧定位点
  clearLocationFromMap()

  if (!navigator.geolocation) {
    alert('您的浏览器不支持地理定位功能')
    isActive.value = false
    isLocating.value = false
    emit('error', new Error('浏览器不支持地理定位'))
    return
  }

  if (!isSecureContext) {
    if (confirm('当前为HTTP环境，浏览器限制了GPS定位。\n\n是否使用IP定位？（精度较低，误差可能在城市级别）')) {
      useIPLocation(currentRequestId)
    } else {
      alert('提示：请使用HTTPS协议访问以启用精确GPS定位')
      isActive.value = false
      isLocating.value = false
    }
    return
  }

  isLocating.value = true

  navigator.geolocation.getCurrentPosition(
    (position) => {
      // 检查请求是否过期或者已被用户取消（弹起）
      if (currentRequestId !== locateRequestId || !isActive.value) {
        return
      }

      const longitude = position.coords.longitude
      const latitude = position.coords.latitude

      applyLocationToMap({
        longitude,
        latitude,
        isIp: false
      })

      isLocating.value = false
    },
    (error) => {
      // 检查请求是否过期或者已被用户取消
      if (currentRequestId !== locateRequestId || !isActive.value) {
        return
      }

      let errorMsg = ''
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = '用户拒绝了地理定位请求'
          break
        case error.POSITION_UNAVAILABLE:
          errorMsg = '位置信息不可用'
          break
        case error.TIMEOUT:
          errorMsg = '获取位置信息超时'
          break
        default:
          errorMsg = '未知错误'
          break
      }

      console.warn('GPS定位失败: ' + errorMsg + '，正在尝试IP定位...')
      useIPLocation(currentRequestId)
      emit('error', error)
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0 // 保证获取实时位置，不使用缓存
    }
  )
}

/**
 * IP 定位回退
 */
const useIPLocation = (currentRequestId) => {
  isLocating.value = true

  fetch('https://ipapi.co/json/')
    .then((res) => res.json())
    .then((data) => {
      // 检查请求是否过期或者已被用户取消（弹起）
      if (currentRequestId !== locateRequestId || !isActive.value) {
        return
      }

      if (data.latitude && data.longitude) {
        const longitude = data.longitude
        const latitude = data.latitude
        const city = data.city || '未知城市'

        applyLocationToMap({
          longitude,
          latitude,
          isIp: true,
          city
        })
      } else {
        throw new Error('IP定位数据不完整')
      }
    })
    .catch((err) => {
      if (currentRequestId !== locateRequestId || !isActive.value) {
        return
      }
      alert('定位服务暂不可用。\n\n请检查网络连接或使用HTTPS环境重试。')
      isActive.value = false
      clearLocationFromMap()
      emit('error', err)
    })
    .finally(() => {
      if (currentRequestId === locateRequestId) {
        isLocating.value = false
      }
    })
}

/**
 * 将定位渲染并聚焦至地图
 */
const applyLocationToMap = ({ longitude, latitude, isIp, city }) => {
  // 如果此时已变成弹起状态，则不渲染
  if (!isActive.value) {
    return
  }

  const m = resolveMap()
  const currentMapType = detectMapType(m)
  const isBaiduCrs = props.crs === 'bd09' || currentMapType === 'baidu'

  let targetLng = longitude
  let targetLat = latitude

  if (isBaiduCrs) {
    const [bdLng, bdLat] = wgs84ToBd09(longitude, latitude)
    targetLng = bdLng
    targetLat = bdLat
  }

  emit('locate', {
    longitude: targetLng,
    latitude: targetLat,
    rawLongitude: longitude,
    rawLatitude: latitude,
    isIp,
    city,
    mapType: currentMapType
  })

  if (!m) return

  if (currentMapType === 'cesium') {
    try {
      m.entities.removeById('currentLocation')
    } catch (_) {}

    m.entities.add({
      id: 'currentLocation',
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
      point: {
        color: isIp ? Cesium.Color.ORANGE : Cesium.Color.BLUE,
        pixelSize: 10,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: isIp ? `IP定位: ${city}` : '当前位置',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })

    const offsetDistance = isIp ? 10000 : 800
    const offsetLat = latitude - offsetDistance / 111320

    m.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, offsetLat, isIp ? 20000 : 1500),
      duration: 1.5,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-60),
        roll: 0.0
      }
    })
  } else if (currentMapType === 'leaflet') {
    if (leafletMarker) {
      leafletMarker.remove()
      leafletMarker = null
    }

    leafletMarker = L.circleMarker([latitude, longitude], {
      radius: 9,
      fillColor: isIp ? '#f97316' : '#2563eb',
      fillOpacity: 0.95,
      color: '#ffffff',
      weight: 3
    })

    leafletMarker.bindPopup(
      `<div style="font-size:13px; line-height:1.6;"><b>${isIp ? 'IP定位: ' + city : '当前位置'}</b><br>经度: ${longitude.toFixed(6)}<br>纬度: ${latitude.toFixed(6)}</div>`
    ).openPopup()

    leafletMarker.addTo(m)
    m.flyTo([latitude, longitude], props.zoom || 15)
  } else if (currentMapType === 'baidu') {
    const BMap = window.BMap || window.BMapGL
    if (baiduMarker) {
      m.removeOverlay(baiduMarker)
      baiduMarker = null
    }

    const pt = new BMap.Point(targetLng, targetLat)
    if (typeof window.BMAP_SYMBOL_CIRCLE !== 'undefined') {
      const symbol = new BMap.Symbol(window.BMAP_SYMBOL_CIRCLE, {
        scale: 7,
        fillColor: isIp ? '#f97316' : '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2
      })
      baiduMarker = new BMap.Marker(pt, { icon: symbol })
    } else {
      baiduMarker = new BMap.Marker(pt)
    }

    const label = new BMap.Label(isIp ? `IP定位: ${city}` : '当前位置', {
      offset: new BMap.Size(12, -10)
    })
    label.setStyle({
      color: '#1e293b',
      fontSize: '12px',
      border: '1px solid #3b82f6',
      borderRadius: '4px',
      padding: '2px 6px',
      backgroundColor: '#ffffff',
      fontWeight: 'bold',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
    })
    baiduMarker.setLabel(label)
    m.addOverlay(baiduMarker)
    m.centerAndZoom(pt, props.zoom || 15)
  } else if (currentMapType === 'tianditu') {
    if (tiandituMarker) {
      m.removeOverLay(tiandituMarker)
      tiandituMarker = null
    }
    if (tiandituLabel) {
      m.removeOverLay(tiandituLabel)
      tiandituLabel = null
    }

    const pt = new window.T.LngLat(targetLng, targetLat)
    const dotIcon = new window.T.Icon({
      iconUrl: isIp
        ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iI2Y5NzMxNiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4='
        : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNiIgZmlsbD0iIzNiODJmNiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=',
      iconSize: new window.T.Point(16, 16),
      iconAnchor: new window.T.Point(8, 8)
    })
    tiandituMarker = new window.T.Marker(pt, { icon: dotIcon })
    m.addOverLay(tiandituMarker)

    const labelText = `<span style="background:${isIp ? '#f97316' : '#3b82f6'};color:#ffffff;padding:2px 6px;border-radius:4px;font-weight:bold;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.2);">${isIp ? 'IP定位: ' + city : '当前位置'}</span>`
    tiandituLabel = new window.T.Label({
      text: labelText,
      position: pt,
      offset: new window.T.Point(12, -10)
    })
    m.addOverLay(tiandituLabel)
    m.centerAndZoom(pt, props.zoom || 15)
  }
}

// 外部如果主动更改 active 状态
watch(
  () => props.active ?? props.modelValue,
  (newVal) => {
    if (newVal !== undefined && newVal !== internalActive.value) {
      if (newVal) {
        internalActive.value = true
        startLocation()
      } else {
        internalActive.value = false
        locateRequestId++
        isLocating.value = false
        clearLocationFromMap()
      }
    }
  }
)

onUnmounted(() => {
  locateRequestId++
  isLocating.value = false
  clearLocationFromMap()
})

// 暴露操作方法供外部直接调用
defineExpose({
  isActive,
  isLocating,
  locate: () => {
    if (!isActive.value) {
      handleLocationToggle()
    } else {
      startLocation()
    }
  },
  clear: () => {
    if (isActive.value) {
      handleLocationToggle()
    } else {
      clearLocationFromMap()
    }
  }
})
</script>

<style scoped>
.location-btn {
  position: absolute;
  width: 56px;
  height: 56px;
  background-color: #ffffff;
  border: 2px solid #3085d6;
  border-radius: 50%;
  cursor: pointer;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(48, 133, 214, 0.2);
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  color: #3085d6;
  padding: 0;
  outline: none;
  user-select: none;
}

/* 默认弹起状态下的悬浮状态 */
.location-btn:hover {
  background-color: #f0f7ff;
  color: #2563eb;
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28), 0 4px 10px rgba(48, 133, 214, 0.3);
}

/* 压下状态（激活状态）：凹陷内阴影、深色背景、白色图标、轻微下沉 */
.location-btn.active {
  background-color: #2563eb;
  border-color: #1d4ed8;
  color: #ffffff;
  transform: translateY(2px) scale(0.94);
  box-shadow: 
    inset 0 4px 8px rgba(0, 0, 0, 0.45),
    inset 0 1px 3px rgba(0, 0, 0, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.2);
}

/* 压下状态下的悬停状态：保持凹陷质感与下沉感，微加深背景色 */
.location-btn.active:hover {
  background-color: #1d4ed8;
  border-color: #1e40af;
  color: #ffffff;
  transform: translateY(2px) scale(0.94);
  box-shadow: 
    inset 0 5px 10px rgba(0, 0, 0, 0.55),
    inset 0 2px 4px rgba(0, 0, 0, 0.35),
    0 1px 2px rgba(0, 0, 0, 0.2);
}

/* 图标过渡与样式 */
.location-icon {
  width: 28px;
  height: 28px;
  stroke: currentColor;
  transition: transform 0.2s ease, stroke 0.2s ease;
}

/* 定位中加载动画（旋转 + 脉冲呼吸效果） */
.location-btn.loading {
  animation: pulse-active 1.4s infinite ease-in-out;
}

.location-btn.loading .location-icon {
  animation: spin-icon 1.2s infinite linear;
}

@keyframes pulse-active {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(37, 99, 235, 0.5));
    opacity: 1;
  }
  50% {
    filter: drop-shadow(0 0 10px rgba(37, 99, 235, 0.85));
    opacity: 0.82;
  }
}

@keyframes spin-icon {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
