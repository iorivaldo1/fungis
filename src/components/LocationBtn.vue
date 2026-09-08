<template>
  <button
    id="locationBtn"
    class="location-btn"
    :class="{ loading: isLocating }"
    :style="buttonStyle"
    @click="handleLocation"
    :title="title"
    type="button"
  >
    <IconLocation width="28" height="28" />
  </button>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
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
  }
})

const emit = defineEmits(['locate', 'error'])

const isLocating = ref(false)

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

const handleLocation = () => {
  const isSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost'

  if (!navigator.geolocation) {
    alert('您的浏览器不支持地理定位功能')
    emit('error', new Error('浏览器不支持地理定位'))
    return
  }

  if (!isSecureContext) {
    if (confirm('当前为HTTP环境，浏览器限制了GPS定位。\n\n是否使用IP定位？（精度较低，误差可能在城市级别）')) {
      useIPLocation()
    } else {
      alert('提示：请使用HTTPS协议访问以启用精确GPS定位')
    }
    return
  }

  isLocating.value = true

  navigator.geolocation.getCurrentPosition(
    (position) => {
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
      isLocating.value = false
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
      alert('定位失败：' + errorMsg + '\n\n正在尝试IP定位...')
      useIPLocation()
      emit('error', error)
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  )
}

const useIPLocation = () => {
  isLocating.value = true

  fetch('https://ipapi.co/json/')
    .then((res) => res.json())
    .then((data) => {
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
      alert('IP定位服务不可用。\n\n请检查网络连接或使用HTTPS以获得GPS定位。')
      emit('error', err)
    })
    .finally(() => {
      isLocating.value = false
    })
}

const applyLocationToMap = ({ longitude, latitude, isIp, city }) => {
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
    m.entities.removeById('currentLocation')
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
      duration: 2,
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

onUnmounted(() => {
  const m = resolveMap()
  if (!m) return
  const currentMapType = detectMapType(m)
  if (currentMapType === 'cesium') {
    try {
      m.entities.removeById('currentLocation')
    } catch (_) {}
  } else if (currentMapType === 'leaflet' && leafletMarker) {
    try {
      leafletMarker.remove()
    } catch (_) {}
  } else if (currentMapType === 'baidu' && baiduMarker) {
    try {
      m.removeOverlay(baiduMarker)
    } catch (_) {}
  } else if (currentMapType === 'tianditu') {
    if (tiandituMarker) {
      try {
        m.removeOverLay(tiandituMarker)
      } catch (_) {}
    }
    if (tiandituLabel) {
      try {
        m.removeOverLay(tiandituLabel)
      } catch (_) {}
    }
  }
})
</script>

<style scoped>
.location-btn {
  position: absolute;
  width: 56px;
  height: 56px;
  background-color: #fff;
  border: 2px solid #3085d6;
  border-radius: 50%;
  cursor: pointer;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  color: #3085d6;
  padding: 0;
}

.location-btn:hover {
  background-color: #3085d6;
  color: white;
  transform: scale(1.1);
}

.location-btn svg {
  width: 28px;
  height: 28px;
  fill: #3085d6;
  transition: fill 0.3s ease;
}

.location-btn:hover svg {
  fill: #ffffff;
}

.location-btn.loading {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.06);
  }
}
</style>
