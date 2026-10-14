<template>
  <div class="location-page">
    <!-- Leaflet 地图容器 -->
    <div id="map" ref="mapContainer"></div>

    <!-- 实时 Zoom 悬浮显示 DOM 控件 -->
    <div class="zoom-badge">
      <span class="zoom-label">Zoom Level</span>
      <span class="zoom-num">{{ zoomValue }}</span>
    </div>

    <!-- 右下角照片上传与定位公共组件 -->
    <UploadBtn :map="mapInstance" map-type="leaflet" crs="wgs84" :bottom="75" :right="100" />
    <LocationBtn :map="mapInstance" map-type="leaflet" crs="wgs84" :bottom="75" :right="30" />

    <!-- 顶部控制面板区域 -->
    <div class="top-panels-container">
      <!-- 点击信息面板 -->
      <ClickInfoPanel :point="clickPoint" v-model:checked="isClickChecked" @change="handleClickCheckedChange"
        crs="wgs84" theme="dark" />

      <!-- 图层控制面板（参考 Cesium 页面设计） -->
      <div class="layer-control" :class="{ collapsed: isLayerCollapsed }">
        <div class="info-title" @click="toggleLayerCollapse">
          <span>图层控制</span>
          <IconChevronDown class="collapse-icon" :class="{ rotated: isLayerCollapsed }" width="20" height="20" />
        </div>
        <transition name="slide-fade">
          <div v-show="!isLayerCollapsed" class="info-content layer-content">
            <div class="layer-section-title">专题图层</div>
            <div class="layer-item">
              <label class="layer-label">
                <input type="checkbox" v-model="showYaRiver" @change="toggleYaRiver">
                雅安河流
              </label>
            </div>
            <div class="layer-item">
              <label class="layer-label">
                <input type="checkbox" v-model="showScPeak" @change="toggleScPeak">
                四川山峰
              </label>
            </div>

            <div class="layer-divider"></div>
            <div class="layer-section-title">底图图层</div>
            <div class="layer-item">
              <label class="layer-label">
                <input type="radio" value="dom" v-model="activeBaseLayer" @change="switchBaseLayer">
                TooMap 影像底图
              </label>
            </div>
            <div class="layer-item">
              <label class="layer-label">
                <input type="radio" value="dlg" v-model="activeBaseLayer" @change="switchBaseLayer">
                TooMap 矢量底图
              </label>
            </div>
            <div class="layer-item">
              <label class="layer-label">
                <input type="checkbox" v-model="showCia" @change="toggleCia">
                天地图地名注记
              </label>
            </div>
          </div>
        </transition>
      </div>

      <!-- 坐标定位面板 -->
      <LocatePanel theme="dark" crs="wgs84" @locate="handleLocate" @clear="handleClear" />

      <!-- SHP 文件面板 -->
      <ShpPanel 
        ref="shpPanelRef"
        theme="dark" 
        default-crs="wgs84" 
        @add-layer="handleShpAddLayer" 
        @toggle-layer="handleShpToggleLayer"
        @delete-layer="handleShpDeleteLayer" 
        @focus-layer="handleShpFocusLayer" 
        @focus-feature="handleShpFocusFeature"
        @toggle-label-field="handleShpToggleLabelField" 
        @clear-all="handleShpClearAll" 
      />

      <!-- JSON 文件面板 -->
      <JsonPanel 
        ref="jsonPanelRef"
        theme="dark" 
        default-crs="wgs84" 
        @add-layer="handleJsonAddLayer" 
        @toggle-layer="handleJsonToggleLayer"
        @delete-layer="handleJsonDeleteLayer" 
        @focus-layer="handleJsonFocusLayer"
        @focus-feature="handleJsonFocusFeature" 
        @toggle-label-field="handleJsonToggleLabelField"
        @clear-all="handleJsonClearAll" 
      />

      <!-- 定位结果表格面板 -->
      <LocationTablePanel 
        ref="locationTablePanelRef"
        theme="dark" 
        :points="locationList" 
        :selected-id="selectedPointId"
        @toggle-visible="handleToggleVisible"
        @delete-item="handleDeleteItem" 
        @focus-item="handleFocusItem" 
        @clear-all="handleClear" 
      />
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import IconChevronDown from '@/components/icons/IconChevronDown.vue'
import UploadBtn from '@/components/UploadBtn.vue'
import LocationBtn from '@/components/LocationBtn.vue'
import ClickInfoPanel from '@/components/ClickInfoPanel.vue'
import LocatePanel from '@/components/LocatePanel.vue'
import LocationTablePanel from '@/components/LocationTablePanel.vue'
import ShpPanel from '@/components/ShpPanel.vue'
import JsonPanel from '@/components/JsonPanel.vue'

import {
  renderGeoJsonToLeaflet,
  flashFeatureLeaflet,
  renderGeoJsonLabelsLeaflet,
  clearGeoJsonLabelsLeaflet
} from '@/utils/shpMapRenderer.js'

const mapContainer = ref(null)
const mapInstance = shallowRef(null)
const zoomValue = ref('--')

const clickPoint = ref(null)
const isClickChecked = ref(false)
const locationList = ref([])
const selectedPointId = ref(null)
const locationTablePanelRef = ref(null)
const shpPanelRef = ref(null)
const jsonPanelRef = ref(null)

// 图层控制状态
const isLayerCollapsed = ref(true)
const showYaRiver = ref(false)
const showScPeak = ref(false)
const activeBaseLayer = ref('dom')
const showCia = ref(true)

let map = null
let clickMarker = null
let idCounter = 1

// 底图与专题图层实例
let toomapDomLayer = null
let toomapDlgLayer = null
let ciaLayer = null
let yaRiverLayer = null
let scPeakLayer = null

// 目标项目精细矩形范围 [106.66214, 31.77465, 106.87585, 31.96320]
const targetBounds = L.latLngBounds(
  [26.04, 97.34],
  [34.16, 108.55]
)
const safeBounds = targetBounds.pad(0.3)

const updateZoomDisplay = () => {
  if (!map) return
  const z = map.getZoom()
  zoomValue.value = Number.isInteger(z) ? z : z.toFixed(1)
}

const handleResize = () => {
  if (map) {
    map.invalidateSize()
  }
}

const toggleLayerCollapse = () => {
  isLayerCollapsed.value = !isLayerCollapsed.value
}

// 切换底图
const switchBaseLayer = () => {
  if (!map) return
  if (activeBaseLayer.value === 'dom') {
    if (toomapDlgLayer && map.hasLayer(toomapDlgLayer)) map.removeLayer(toomapDlgLayer)
    if (toomapDomLayer && !map.hasLayer(toomapDomLayer)) map.addLayer(toomapDomLayer)
  } else {
    if (toomapDomLayer && map.hasLayer(toomapDomLayer)) map.removeLayer(toomapDomLayer)
    if (toomapDlgLayer && !map.hasLayer(toomapDlgLayer)) map.addLayer(toomapDlgLayer)
  }
}

// 切换天地图地名注记
const toggleCia = () => {
  if (!map || !ciaLayer) return
  if (showCia.value) {
    if (!map.hasLayer(ciaLayer)) map.addLayer(ciaLayer)
  } else {
    if (map.hasLayer(ciaLayer)) map.removeLayer(ciaLayer)
  }
}

// 切换雅安河流
const toggleYaRiver = () => {
  if (!map) return
  if (showYaRiver.value) {
    if (!yaRiverLayer) {
      const apiBase = import.meta.env.VITE_API_BASE_URL || ''
      yaRiverLayer = L.tileLayer.wms(`${apiBase}/geoserver/hydro/wms`, {
        layers: 'hydro:ya_river',
        format: 'image/png',
        transparent: true,
        crs: L.CRS.EPSG4326,
        minZoom: 2,
        maxZoom: 18,
        zIndex: 10
      })
    }
    if (!map.hasLayer(yaRiverLayer)) {
      map.addLayer(yaRiverLayer)
    }
  } else {
    if (yaRiverLayer && map.hasLayer(yaRiverLayer)) {
      map.removeLayer(yaRiverLayer)
    }
  }
}

// 切换四川山峰
const toggleScPeak = () => {
  if (!map) return
  if (showScPeak.value) {
    if (!scPeakLayer) {
      const apiBase = import.meta.env.VITE_API_BASE_URL || ''
      scPeakLayer = L.tileLayer.wms(`${apiBase}/geoserver/basemap/wms`, {
        layers: 'basemap:sc_peak',
        format: 'image/png',
        transparent: true,
        crs: L.CRS.EPSG4326,
        minZoom: 2,
        maxZoom: 18,
        zIndex: 11
      })
    }
    if (!map.hasLayer(scPeakLayer)) {
      map.addLayer(scPeakLayer)
    }
  } else {
    if (scPeakLayer && map.hasLayer(scPeakLayer)) {
      map.removeLayer(scPeakLayer)
    }
  }
}

const updateClickMarker = (latlng) => {
  if (!map) return
  if (clickMarker) {
    map.removeLayer(clickMarker)
    clickMarker = null
  }
  if (isClickChecked.value && latlng) {
    const redDotIcon = L.divIcon({
      className: 'click-red-pin',
      html: '<div style="width:16px;height:16px;background:#ef4444;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 12px rgba(239,68,68,0.95);cursor:pointer;transition:transform 0.2s;"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
    clickMarker = L.marker(latlng, { icon: redDotIcon }).addTo(map)

    // 点击查询标记点绑定弹出窗，支持一键添加到定位列表并直接联动跳转
    const popupDiv = document.createElement('div')
    popupDiv.style.cssText = 'padding: 6px 4px; text-align: center; font-family: sans-serif;'
    popupDiv.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:#1e293b;margin-bottom:6px;">
        📍 (${latlng.lng.toFixed(5)}, ${latlng.lat.toFixed(5)})
      </div>
      <button id="btn-add-click-loc" style="background:#2563eb;color:#ffffff;border:none;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,0.3);white-space:nowrap;">
        ➕ 添加为定位点并查看记录
      </button>
    `
    const addBtn = popupDiv.querySelector('#btn-add-click-loc')
    addBtn.addEventListener('click', () => {
      handleLocate({
        longitude: Number(latlng.lng.toFixed(6)),
        latitude: Number(latlng.lat.toFixed(6)),
        rawX: Number(latlng.lng.toFixed(6)),
        rawY: Number(latlng.lat.toFixed(6))
      })
      map.closePopup()
    })

    clickMarker.bindPopup(popupDiv, { offset: [0, -8] })
  }
}

const handleClickCheckedChange = (val) => {
  if (!val && clickMarker) {
    map.removeLayer(clickMarker)
    clickMarker = null
  }
}

onMounted(() => {
  if (!mapContainer.value) return

  // 1. 根据 TooMap 官方规范创建 Leaflet 地图对象
  // TooMap 栅格瓦片为 CGCS2000 (EPSG:4490 / 4326) 经纬度体系，必须设置 crs 为 L.CRS.EPSG4326
  map = L.map(mapContainer.value, {
    crs: L.CRS.EPSG4326,
    zoom: 15,
    minZoom: 2,
    maxZoom: 17,
    maxBounds: safeBounds,
    maxBoundsViscosity: 1.0,
    zoomControl: true,
    attributionControl: false
  })

  // 视角定位至目标区域
  map.fitBounds(targetBounds)

  // TooMap 开发者令牌 (ak)
  const tooMapAK = '2d2ff68e27AXNpzlye66b334f70181f1'

  // 2. TooMap 栅格影像瓦片底图 (newtianditudom)
  const toomapDomUrl = `https://www.scgis.net/services/newtianditudom/wmts?service=wmts&request=gettile&version=1.0.0&layer=defaultLayer&style=default&tilematrixset=GetTileMatrix&tilematrix={z}&tilerow={y}&tilecol={x}&ak=${tooMapAK}`
  toomapDomLayer = L.tileLayer(toomapDomUrl, {
    minZoom: 2,
    maxZoom: 17,
    zoomOffset: 1,
    attribution: '四川省自然资源投资集团 / TooMap'
  }).addTo(map)

  // 3. TooMap 栅格矢量瓦片底图 (newtianditudlg)
  const toomapDlgUrl = `https://www.scgis.net/services/newtianditudlg/wmts?service=wmts&request=gettile&version=1.0.0&layer=defaultLayer&style=default&tilematrixset=GetTileMatrix&tilematrix={z}&tilerow={y}&tilecol={x}&ak=${tooMapAK}`
  toomapDlgLayer = L.tileLayer(toomapDlgUrl, {
    minZoom: 2,
    maxZoom: 17,
    zoomOffset: 1,
    attribution: '四川省自然资源投资集团 / TooMap'
  })

  // 4. 国家天地图经纬度版影像注记 (cia_c)
  const tk = '73a87062ca36baaed0feebe7989f453a'
  const ciaUrl = `https://t{s}.tianditu.gov.cn/cia_c/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=c&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${tk}`
  ciaLayer = L.tileLayer(ciaUrl, {
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    minZoom: 2,
    maxZoom: 17,
    zoomOffset: 1
  }).addTo(map)

  // 初始视角中心 [30.691294, 104.302553]
  const centerLatLng = [30.691294, 104.302553]
  map.setView(centerLatLng, 15)

  updateZoomDisplay()
  map.on('zoom zoomend move', updateZoomDisplay)

  // 地图点击事件
  map.on('click', (e) => {
    const lng = Number(e.latlng.lng.toFixed(6))
    const lat = Number(e.latlng.lat.toFixed(6))
    clickPoint.value = { lng, lat }

    // 若开启了“点击查询”，更新红点标记并弹出窗口
    if (isClickChecked.value) {
      updateClickMarker(e.latlng)
    }
  })

  mapInstance.value = map
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (map) {
    map.remove()
    map = null
  }
  mapInstance.value = null
})

// 弹跳动画高亮地图标记（作用于内部元素，不破坏 Leaflet translate3d 坐标）
const flashMarker = (item) => {
  if (!item || !item.markerOverlay) return
  const el = item.markerOverlay.getElement()
  if (el) {
    const inner = el.querySelector('.locate-combined-marker') || el
    inner.classList.remove('marker-bounce')
    void inner.offsetWidth
    inner.classList.add('marker-bounce')
  }
}

// 核心跳转函数：联动列表框定位展开、平滑滚动、高亮对应记录
const jumpToTableRecord = (item) => {
  if (!item) return
  selectedPointId.value = item.id
  if (locationTablePanelRef.value?.scrollToItem) {
    locationTablePanelRef.value.scrollToItem(item.id)
  }
  flashMarker(item)
}

// 坐标定位处理：生成地图标记并联动列表
const handleLocate = ({ longitude, latitude, rawX, rawY }) => {
  if (!map) return

  const currentId = idCounter++
  const latlng = [latitude, longitude]

  // 单一复合标记（上方为 ID 和坐标信息标签，下方为红针 SVG），hitbox 充盈，锚点精准对齐针尖
  const markerHtml = `
    <div class="locate-combined-marker" title="点击在列表框中查看记录 #${currentId}">
      <div class="locate-label-badge">
        <span class="badge-id">ID: ${currentId}</span>
        <span class="badge-coord">(${Number(rawX).toFixed(2)}, ${Number(rawY).toFixed(2)})</span>
      </div>
      <div class="locate-pin-icon">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="#ef4444" stroke="#ffffff" stroke-width="1.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    </div>
  `

  const pinIcon = L.divIcon({
    className: 'locate-marker-icon',
    html: markerHtml,
    iconSize: [180, 52],
    iconAnchor: [90, 52]
  })

  const marker = L.marker(latlng, { icon: pinIcon, interactive: true, riseOnHover: true }).addTo(map)

  const item = {
    id: currentId,
    longitude,
    latitude,
    rawX,
    rawY,
    visible: true,
    markerOverlay: marker
  }

  // 绑定地图标记点击事件：在 map 中点击生成的点，触发在列表框中跳转并高亮该条记录
  marker.on('click', (e) => {
    if (e && e.originalEvent) {
      L.DomEvent.stopPropagation(e)
    }
    jumpToTableRecord(item)
  })

  locationList.value.push(item)
  map.setView(latlng, 15)

  // 自动跳转并高亮当前新生成的点
  jumpToTableRecord(item)
}

const handleToggleVisible = (item) => {
  item.visible = !item.visible
  if (!map) return

  if (item.visible) {
    if (!map.hasLayer(item.markerOverlay)) map.addLayer(item.markerOverlay)
  } else {
    if (map.hasLayer(item.markerOverlay)) map.removeLayer(item.markerOverlay)
  }
}

const handleDeleteItem = (item) => {
  if (map && item && item.markerOverlay) {
    if (map.hasLayer(item.markerOverlay)) map.removeLayer(item.markerOverlay)
  }
  if (selectedPointId.value === item.id) {
    selectedPointId.value = null
  }
  locationList.value = locationList.value.filter(i => i.id !== item.id)
}

const handleFocusItem = (item) => {
  if (map && item) {
    selectedPointId.value = item.id
    map.setView([item.latitude, item.longitude], 15)
    flashMarker(item)
  }
}

const handleClear = () => {
  locationList.value.forEach(item => {
    if (map && item.markerOverlay && map.hasLayer(item.markerOverlay)) {
      map.removeLayer(item.markerOverlay)
    }
  })
  locationList.value = []
  selectedPointId.value = null
}

// SHP 图层渲染与交互处理
const shpLayersMap = {}
const shpLabelOverlaysMap = {}

const handleShpAddLayer = (layer) => {
  if (!map) return
  const onFeatureClick = (feature) => {
    // 1. 地图高亮闪烁该要素
    flashFeatureLeaflet(map, feature)
    // 2. 联动打开/定位对应 SHP 属性表弹窗，自动翻页并高亮该行记录
    if (shpPanelRef.value?.locateFeature) {
      shpPanelRef.value.locateFeature(layer, feature)
    }
  }
  const { layerGroup, bounds } = renderGeoJsonToLeaflet(map, layer.geojson, layer.color, onFeatureClick)
  shpLayersMap[layer.id] = { layerGroup, bounds }
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
  }
}

const handleShpToggleLayer = (layer) => {
  if (!map || !shpLayersMap[layer.id]) return
  const { layerGroup } = shpLayersMap[layer.id]
  if (layer.visible) {
    if (!map.hasLayer(layerGroup)) map.addLayer(layerGroup)
  } else {
    if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup)
  }
}

const handleShpToggleLabelField = ({ layer, field }) => {
  if (!map || !layer) return
  if (shpLabelOverlaysMap[layer.id]) {
    clearGeoJsonLabelsLeaflet(map, shpLabelOverlaysMap[layer.id])
    delete shpLabelOverlaysMap[layer.id]
  }
  if (field) {
    const labels = renderGeoJsonLabelsLeaflet(map, layer.geojson, field, '#1e293b')
    shpLabelOverlaysMap[layer.id] = labels
  }
}

const handleShpDeleteLayer = (layer) => {
  if (!map || !shpLayersMap[layer.id]) return
  const { layerGroup } = shpLayersMap[layer.id]
  if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup)
  delete shpLayersMap[layer.id]

  if (shpLabelOverlaysMap[layer.id]) {
    clearGeoJsonLabelsLeaflet(map, shpLabelOverlaysMap[layer.id])
    delete shpLabelOverlaysMap[layer.id]
  }
}

const handleShpFocusLayer = (layer) => {
  if (!map || !shpLayersMap[layer.id]) return
  const { bounds } = shpLayersMap[layer.id]
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
  }
}

const handleShpFocusFeature = (feature) => {
  if (!map) return
  flashFeatureLeaflet(map, feature)
}

const handleShpClearAll = () => {
  if (!map) return
  Object.keys(shpLayersMap).forEach(layerId => {
    const { layerGroup } = shpLayersMap[layerId]
    if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup)
  })
  Object.keys(shpLayersMap).forEach(key => delete shpLayersMap[key])

  Object.keys(shpLabelOverlaysMap).forEach(layerId => {
    clearGeoJsonLabelsLeaflet(map, shpLabelOverlaysMap[layerId])
  })
  Object.keys(shpLabelOverlaysMap).forEach(key => delete shpLabelOverlaysMap[key])
}

// JSON 图层渲染与交互处理
const jsonLayersMap = {}
const jsonLabelOverlaysMap = {}

const handleJsonAddLayer = (layer) => {
  if (!map) return
  const onFeatureClick = (feature) => {
    // 1. 地图高亮闪烁该要素
    flashFeatureLeaflet(map, feature)
    // 2. 联动打开/定位对应 JSON 属性表弹窗，自动翻页并高亮该行记录
    if (jsonPanelRef.value?.locateFeature) {
      jsonPanelRef.value.locateFeature(layer, feature)
    }
  }
  const { layerGroup, bounds } = renderGeoJsonToLeaflet(map, layer.geojson, layer.color, onFeatureClick)
  jsonLayersMap[layer.id] = { layerGroup, bounds }
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
  }
}

const handleJsonToggleLayer = (layer) => {
  if (!map || !jsonLayersMap[layer.id]) return
  const { layerGroup } = jsonLayersMap[layer.id]
  if (layer.visible) {
    if (!map.hasLayer(layerGroup)) map.addLayer(layerGroup)
  } else {
    if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup)
  }
}

const handleJsonToggleLabelField = ({ layer, field }) => {
  if (!map || !layer) return
  if (jsonLabelOverlaysMap[layer.id]) {
    clearGeoJsonLabelsLeaflet(map, jsonLabelOverlaysMap[layer.id])
    delete jsonLabelOverlaysMap[layer.id]
  }
  if (field) {
    const labels = renderGeoJsonLabelsLeaflet(map, layer.geojson, field, '#1e293b')
    jsonLabelOverlaysMap[layer.id] = labels
  }
}

const handleJsonDeleteLayer = (layer) => {
  if (!map || !jsonLayersMap[layer.id]) return
  const { layerGroup } = jsonLayersMap[layer.id]
  if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup)
  delete jsonLayersMap[layer.id]

  if (jsonLabelOverlaysMap[layer.id]) {
    clearGeoJsonLabelsLeaflet(map, jsonLabelOverlaysMap[layer.id])
    delete jsonLabelOverlaysMap[layer.id]
  }
}

const handleJsonFocusLayer = (layer) => {
  if (!map || !jsonLayersMap[layer.id]) return
  const { bounds } = jsonLayersMap[layer.id]
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
  }
}

const handleJsonFocusFeature = (feature) => {
  if (!map) return
  flashFeatureLeaflet(map, feature)
}

const handleJsonClearAll = () => {
  if (!map) return
  Object.keys(jsonLayersMap).forEach(layerId => {
    const { layerGroup } = jsonLayersMap[layerId]
    if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup)
  })
  Object.keys(jsonLayersMap).forEach(key => delete jsonLayersMap[key])

  Object.keys(jsonLabelOverlaysMap).forEach(layerId => {
    clearGeoJsonLabelsLeaflet(map, jsonLabelOverlaysMap[layerId])
  })
  Object.keys(jsonLabelOverlaysMap).forEach(key => delete jsonLabelOverlaysMap[key])
}
</script>

<style scoped>
.location-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: #0b1120;
}

#map {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

/* 实时 Zoom 悬浮显示 DOM 控件 */
.zoom-badge {
  position: absolute;
  bottom: 20px;
  left: 20px;
  z-index: 1000;
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 6px 14px;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  user-select: none;
}

.zoom-label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.zoom-num {
  font-weight: 700;
  color: #38bdf8;
  font-family: 'Courier New', Courier, monospace;
  font-size: 15px;
}

/* 顶部控制面板容器 */
.top-panels-container {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  pointer-events: none;
}

.top-panels-container>* {
  pointer-events: auto;
}

/* 图层控制面板（暗色玻璃拟态风格，与 Cesium 页面保持统一） */
.layer-control {
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 450;
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
  padding: 0;
  border-radius: 12px;
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  min-width: 200px;
  transition: all 0.3s ease;
}

.layer-control.collapsed {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.info-title {
  color: white;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  padding: 10px 16px;
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

.info-title:hover {
  background: linear-gradient(135deg, rgba(70, 70, 70, 0.7) 0%, rgba(90, 90, 90, 0.6) 100%);
}

.collapse-icon {
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.collapse-icon.rotated {
  transform: rotate(-180deg);
}

.layer-content {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
}

.layer-section-title {
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.layer-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}

.layer-item {
  padding: 6px 16px;
  transition: background-color 0.2s ease;
}

.layer-item:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.layer-label {
  color: rgba(255, 255, 255, 0.95);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.layer-label input[type="checkbox"],
.layer-label input[type="radio"] {
  cursor: pointer;
  accent-color: #3b82f6;
  width: 14px;
  height: 14px;
}

/* 定位点复合标记样式 */
:deep(.locate-marker-icon) {
  background: transparent !important;
  border: none !important;
}

:deep(.locate-combined-marker) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  width: 180px;
  height: 52px;
  cursor: pointer;
  user-select: none;
  pointer-events: auto;
}

:deep(.locate-label-badge) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  margin-bottom: 2px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
  transition: transform 0.2s ease;
}

:deep(.badge-id) {
  background: #3b82f6;
  color: #ffffff;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

:deep(.badge-coord) {
  background: #ffffff;
  color: #1e293b;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid #cbd5e1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

:deep(.locate-pin-icon) {
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.5));
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

:deep(.locate-combined-marker:hover .locate-pin-icon) {
  transform: scale(1.18) translateY(-2px);
}

:deep(.locate-combined-marker:hover .locate-label-badge) {
  transform: translateY(-2px);
}

@keyframes markerBounce {
  0%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-14px) scale(1.12);
  }
  60% {
    transform: translateY(-5px) scale(1.05);
  }
}

:deep(.marker-bounce) {
  animation: markerBounce 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

:deep(.click-red-pin) {
  cursor: pointer;
}
</style>
