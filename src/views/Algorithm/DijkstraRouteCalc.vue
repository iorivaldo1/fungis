<template>
  <div class="leaflet-container" :class="{ 'picking-cursor': pickingMode !== null }">
    <!-- 纯净全屏地图容器 -->
    <div id="map" ref="mapContainer"></div>

    <!-- 路径规划控制面板 -->
    <div class="route-panel">
      <div class="panel-header">
        <span class="panel-title">🛣️ PostgreSQL Dijkstra 路径规划</span>
      </div>

      <div class="form-group">
        <div class="form-label">
          <span>🌐 选择路网数据集</span>
          <button
            type="button"
            class="pick-btn btn-manage-badge"
            @click="openManageModal"
          >
            ⚙️ 路网管理
          </button>
        </div>
        <select
          v-model="selectedNetworkId"
          class="coord-input full-width-select"
          @change="onNetworkChange"
        >
          <option v-if="networksLoading" value="">加载路网配置中...</option>
          <option v-else-if="networksList.length === 0" value="">暂无可用路网配置</option>
          <option
            v-for="net in networksList"
            :key="net.id"
            :value="net.id"
          >
            {{ net.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <div class="form-label">
          <span>📍 起点 (经度, 纬度)</span>
          <button
            type="button"
            class="pick-btn btn-manage-badge"
            :class="{ active: pickingMode === 'start' }"
            @click="togglePickMode('start')"
          >
            {{ pickingMode === 'start' ? '📍 正在选点...' : '🎯 地图选点' }}
          </button>
        </div>
        <div class="coord-row">
          <div class="coord-field">
            <span class="coord-tag">经度</span>
            <input
              type="text"
              inputmode="decimal"
              v-model.number="startLng"
              class="coord-input"
              placeholder="例: 104.114"
              @change="updateMarkers"
            />
          </div>
          <div class="coord-field">
            <span class="coord-tag">纬度</span>
            <input
              type="text"
              inputmode="decimal"
              v-model.number="startLat"
              class="coord-input"
              placeholder="例: 30.632"
              @change="updateMarkers"
            />
          </div>
        </div>
      </div>

      <div class="form-group">
        <div class="form-label">
          <span>🏁 终点 (经度, 纬度)</span>
          <button
            type="button"
            class="pick-btn btn-manage-badge"
            :class="{ active: pickingMode === 'end' }"
            @click="togglePickMode('end')"
          >
            {{ pickingMode === 'end' ? '🏁 正在选点...' : '🎯 地图选点' }}
          </button>
        </div>
        <div class="coord-row">
          <div class="coord-field">
            <span class="coord-tag">经度</span>
            <input
              type="text"
              inputmode="decimal"
              v-model.number="endLng"
              class="coord-input"
              placeholder="例: 104.120"
              @change="updateMarkers"
            />
          </div>
          <div class="coord-field">
            <span class="coord-tag">纬度</span>
            <input
              type="text"
              inputmode="decimal"
              v-model.number="endLat"
              class="coord-input"
              placeholder="例: 30.638"
              @change="updateMarkers"
            />
          </div>
        </div>
      </div>

      <label class="option-row">
        <input type="checkbox" v-model="chkShowBaseMap" @change="toggleBaseMap" />
        <span>🗺️ 显示天地图底图</span>
      </label>

      <label class="option-row">
        <input type="checkbox" v-model="chkShowRoads" @change="toggleRoadLayer" />
        <span>👁️ 显示数据源 (WMTS 瓦片)</span>
      </label>

      <label class="option-row">
        <input type="checkbox" v-model="chkDirected" />
        <span>🧭 有向路径规划 (考虑单行道)</span>
      </label>

      <div class="action-row">
        <button
          type="button"
          class="btn-submit"
          :disabled="isPlanning"
          @click="planRoute"
        >
          {{ isPlanning ? '⏳ 计算中...' : '🚀 开始规划路径' }}
        </button>
        <button type="button" class="btn-reset" @click="resetRoute">
          🔄 重置
        </button>
      </div>

      <!-- 结果反馈区域 -->
      <div class="result-card" :class="{ show: showResultCard }">
        <div class="result-item">
          <span class="result-key">计算状态:</span>
          <span class="result-val" :style="{ color: resStatusColor }">{{ resStatus }}</span>
        </div>
        <div class="result-item">
          <span class="result-key">全线总里程:</span>
          <span class="result-val">{{ resDistance }}</span>
        </div>
        <div class="result-item">
          <span class="result-key">拓扑匹配节点:</span>
          <span class="result-val">{{ resNodes }}</span>
        </div>
      </div>
    </div>

    <!-- 实时 Zoom 状态显示 DOM 节点 -->
    <div id="zoomIndicator" class="zoom-badge">
      <span class="zoom-label">Zoom Level</span>
      <span class="zoom-num">{{ zoomValue }}</span>
    </div>

    <!-- 路网管理 Modal 弹窗 -->
    <div v-if="showManageModal" class="modal-overlay" @click.self="showManageModal = false">
      <div class="modal-content manage-modal-width">
        <div class="modal-header">
          <span class="modal-title">⚙️ 数据库路网数据集管理</span>
          <span class="modal-close" @click="showManageModal = false">&times;</span>
        </div>
        <div class="modal-body max-modal-body">
          <div class="manage-sub-header">
            <span class="sub-header-desc">包含新建、名称修改与物理删除管理：</span>
            <button
              type="button"
              class="btn-submit btn-sm"
              @click="openUploadFromManage"
            >
              📁 + 上传 SHP 文件夹新建路网
            </button>
          </div>
          <table class="manage-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>显示名称 (可编辑)</th>
                <th class="text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="networksList.length === 0">
                <td colspan="3" class="text-center empty-td">暂无配置的路网数据</td>
              </tr>
              <tr v-for="net in editableNetworks" :key="net.id">
                <td class="net-id-cell">{{ net.id }}</td>
                <td>
                  <input
                    type="text"
                    v-model="net.editingName"
                    class="coord-input edit-name-input"
                  />
                </td>
                <td class="text-center">
                  <button
                    type="button"
                    class="pick-btn btn-sm-action"
                    @click="saveNetworkName(net)"
                  >
                    💾 保存名称
                  </button>
                  <span v-if="net.id === 'shjd_road'" class="protected-badge">系统保护</span>
                  <button
                    v-else
                    type="button"
                    class="pick-btn btn-del-net"
                    @click="deleteNetwork(net)"
                  >
                    🗑️ 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-reset" @click="showManageModal = false">
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- 上传 SHP 文件夹构建路网 Modal 弹窗 -->
    <div v-if="showUploadModal" class="modal-overlay" @click.self="showUploadModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-title">📁 上传 SHP 文件夹新建路网</span>
          <span class="modal-close" @click="showUploadModal = false">&times;</span>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">📂 选择本地 SHP 文件夹 (.shp, .dbf, .shx, .prj)</label>
            <input
              type="file"
              ref="shpFileInput"
              class="coord-input full-width-input"
              webkitdirectory
              directory
              multiple
              @change="handleFolderSelect"
            />
          </div>
          <div class="form-group">
            <label class="form-label">🏷️ 路网 Code (仅含字母数字下划线)</label>
            <input
              type="text"
              v-model="uploadNetId"
              class="coord-input full-width-input"
              placeholder="例: cd_road"
            />
          </div>
          <div class="form-group">
            <label class="form-label">📝 路网显示名称</label>
            <input
              type="text"
              v-model="uploadNetName"
              class="coord-input full-width-input"
              placeholder="例: 成都高新区路网"
            />
          </div>
          <div class="form-group">
            <label class="form-label">🔤 属性字符编码</label>
            <select v-model="uploadEncoding" class="coord-input full-width-select">
              <option value="GBK">GBK (推荐中文标准)</option>
              <option value="UTF-8">UTF-8</option>
            </select>
          </div>
          <div
            v-if="uploadMsg.show"
            class="upload-msg"
            :style="{ color: uploadMsg.color }"
          >
            {{ uploadMsg.text }}
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn-submit"
            :disabled="isUploading"
            @click="submitUpload"
          >
            {{ isUploading ? '⏳ 构建中...' : '🚀 开始构建路网' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const mapContainer = ref(null)
const shpFileInput = ref(null)

const zoomValue = ref('--')
const selectedNetworkId = ref('')
const networksList = ref([])
const editableNetworks = ref([])
const networksLoading = ref(true)

const startLng = ref('')
const startLat = ref('')
const endLng = ref('')
const endLat = ref('')

const chkShowBaseMap = ref(false)
const chkShowRoads = ref(true)
const chkDirected = ref(true)

const pickingMode = ref(null) // 'start' | 'end' | null
const isPlanning = ref(false)

const showResultCard = ref(false)
const resStatus = ref('未运行')
const resStatusColor = ref('#38bdf8')
const resDistance = ref('-- km')
const resNodes = ref('-- -> --')

const showManageModal = ref(false)
const showUploadModal = ref(false)

const uploadNetId = ref('')
const uploadNetName = ref('')
const uploadEncoding = ref('GBK')
const selectedFiles = ref([])
const isUploading = ref(false)
const uploadMsg = reactive({
  show: false,
  text: '',
  color: ''
})

let map = null
let vecLayer = null
let cvaLayer = null
let baseMapGroup = null
let startMarker = null
let endMarker = null
let wmtsRoadLayer = null
let xzqHighlightLayer = null
let routeGlowLayer = null
let routeCoreLayer = null
let startDashLayer = null
let endDashLayer = null
let routeArrowLayer = null
let currentRouteCoords = null

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
const routeApiBase = `${apiBaseUrl}/get_geo_pg/geo/route`
const tk = '73a87062ca36baaed0feebe7989f453a'

const iconStart = L.divIcon({
  className: 'pin-start',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
})

const iconEnd = L.divIcon({
  className: 'pin-end',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
})

function updateZoomDisplay() {
  if (!map) return
  const z = map.getZoom()
  zoomValue.value = Number.isInteger(z) ? z : z.toFixed(1)
}

function updateMarkers() {
  if (!map) return
  const sLon = parseFloat(startLng.value)
  const sLat = parseFloat(startLat.value)
  const eLon = parseFloat(endLng.value)
  const eLat = parseFloat(endLat.value)

  if (!isNaN(sLon) && !isNaN(sLat)) {
    if (startMarker) map.removeLayer(startMarker)
    startMarker = L.marker([sLat, sLon], { icon: iconStart }).addTo(map)
  } else if (startMarker) {
    map.removeLayer(startMarker)
    startMarker = null
  }

  if (!isNaN(eLon) && !isNaN(eLat)) {
    if (endMarker) map.removeLayer(endMarker)
    endMarker = L.marker([eLat, eLon], { icon: iconEnd }).addTo(map)
  } else if (endMarker) {
    map.removeLayer(endMarker)
    endMarker = null
  }
}

function togglePickMode(mode) {
  if (pickingMode.value === mode) {
    resetPickingMode()
  } else {
    pickingMode.value = mode
  }
}

function resetPickingMode() {
  pickingMode.value = null
}

function handleMapClick(e) {
  if (!pickingMode.value) return

  const lon = parseFloat(e.latlng.lng.toFixed(6))
  const lat = parseFloat(e.latlng.lat.toFixed(6))

  if (pickingMode.value === 'start') {
    startLng.value = lon
    startLat.value = lat
  } else if (pickingMode.value === 'end') {
    endLng.value = lon
    endLat.value = lat
  }

  updateMarkers()
  resetPickingMode()
}

function toggleBaseMap() {
  if (!map || !baseMapGroup) return
  if (chkShowBaseMap.value) {
    if (!map.hasLayer(baseMapGroup)) map.addLayer(baseMapGroup)
  } else {
    if (map.hasLayer(baseMapGroup)) map.removeLayer(baseMapGroup)
  }
}

function toggleRoadLayer() {
  if (!map || !wmtsRoadLayer) return
  if (chkShowRoads.value) {
    if (!map.hasLayer(wmtsRoadLayer)) map.addLayer(wmtsRoadLayer)
  } else {
    if (map.hasLayer(wmtsRoadLayer)) map.removeLayer(wmtsRoadLayer)
  }
}

function renderRouteArrows(coords, targetMap) {
  if (routeArrowLayer) {
    targetMap.removeLayer(routeArrowLayer)
    routeArrowLayer = null
  }
  if (!coords || coords.length < 2) return

  const arrowMarkers = []
  const minPixelDistance = 75
  let lastPixelPoint = null

  for (let i = 0; i < coords.length - 1; i++) {
    const p1LatLng = L.latLng(coords[i][1], coords[i][0])
    const p2LatLng = L.latLng(coords[i + 1][1], coords[i + 1][0])

    const pt1 = targetMap.latLngToContainerPoint(p1LatLng)
    const pt2 = targetMap.latLngToContainerPoint(p2LatLng)

    const dx = pt2.x - pt1.x
    const dy = pt2.y - pt1.y
    const segLenSq = dx * dx + dy * dy

    if (segLenSq < 100) continue

    if (!lastPixelPoint || Math.pow(pt2.x - lastPixelPoint.x, 2) + Math.pow(pt2.y - lastPixelPoint.y, 2) >= minPixelDistance * minPixelDistance) {
      const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI)
      const midLatLng = L.latLng((p1LatLng.lat + p2LatLng.lat) / 2, (p1LatLng.lng + p2LatLng.lng) / 2)

      const arrowIcon = L.divIcon({
        className: 'route-arrow-icon',
        html: `<div style="transform: rotate(${angleDeg}deg); width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                   <path d="M4 3L20 12L4 21L8 12L4 3Z" fill="#ffffff" stroke="#f43f5e" stroke-width="2.5" stroke-linejoin="round"/>
                 </svg>
               </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })

      const marker = L.marker(midLatLng, { icon: arrowIcon, interactive: false })
      arrowMarkers.push(marker)
      lastPixelPoint = pt2
    }
  }

  if (arrowMarkers.length > 0) {
    routeArrowLayer = L.layerGroup(arrowMarkers).addTo(targetMap)
  }
}

async function fetchRoadNetworks(targetSelectId = null) {
  networksLoading.value = true
  try {
    const response = await fetch(`${routeApiBase}/networks`)
    const res = await response.json()
    if (res.code === 200 && Array.isArray(res.data) && res.data.length > 0) {
      networksList.value = res.data
      editableNetworks.value = res.data.map(net => ({
        ...net,
        editingName: net.name || net.id
      }))
      if (targetSelectId && res.data.some(n => n.id === targetSelectId)) {
        selectedNetworkId.value = targetSelectId
      } else if (!selectedNetworkId.value || !res.data.some(n => n.id === selectedNetworkId.value)) {
        selectedNetworkId.value = res.data[0].id
      }
      loadRoadNetworkRange(selectedNetworkId.value)
    } else {
      networksList.value = []
      editableNetworks.value = []
      loadRoadNetworkRange(null)
    }
  } catch (err) {
    console.error('获取路网配置列表异常:', err)
    networksList.value = []
    editableNetworks.value = []
    loadRoadNetworkRange(null)
  } finally {
    networksLoading.value = false
  }
}

function onNetworkChange() {
  resetRoute()
  loadRoadNetworkRange(selectedNetworkId.value)
}

async function loadXzqBoundary(networkId) {
  if (!networkId) {
    if (xzqHighlightLayer && map) { map.removeLayer(xzqHighlightLayer); xzqHighlightLayer = null }
    return
  }

  let url = ''
  if (networkId.startsWith('xzq_county_')) {
    const featureId = networkId.replace('xzq_county_', '')
    url = `${routeApiBase}/xzq/detail?level=county&featureId=${featureId}`
  } else if (networkId.startsWith('xzq_town_')) {
    const featureId = networkId.replace('xzq_town_', '')
    url = `${routeApiBase}/xzq/detail?level=town&featureId=${featureId}`
  } else if (networkId.startsWith('xzq_village_')) {
    const featureId = networkId.replace('xzq_village_', '')
    url = `${routeApiBase}/xzq/detail?level=village&featureId=${featureId}`
  } else {
    url = `${routeApiBase}/xzq/boundary?networkId=${networkId}`
  }

  try {
    const res = await fetch(url).then(r => r.json())
    let hasFitted = false
    if (res.code === 200 && res.data && res.data.geojson) {
      const geoData = typeof res.data.geojson === 'string' ? JSON.parse(res.data.geojson) : res.data.geojson
      if (xzqHighlightLayer && map) map.removeLayer(xzqHighlightLayer)

      if (map) {
        xzqHighlightLayer = L.geoJSON(geoData, {
          renderer: L.svg({ padding: 2.0 }),
          style: {
            stroke: true,
            color: '#38bdf8',
            weight: 3,
            opacity: 1.0,
            dashArray: '8, 8',
            fill: false,
            fillOpacity: 0
          }
        }).addTo(map)

        if (res.data.bbox && Array.isArray(res.data.bbox) && res.data.bbox.length === 4) {
          const bounds = L.latLngBounds(
            [res.data.bbox[1], res.data.bbox[0]],
            [res.data.bbox[3], res.data.bbox[2]]
          )
          map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 0.8 })
          hasFitted = true
        }
      }
    } else {
      if (xzqHighlightLayer && map) { map.removeLayer(xzqHighlightLayer); xzqHighlightLayer = null }
    }

    if (!hasFitted && Array.isArray(networksList.value) && map) {
      const targetNet = networksList.value.find(n => n.id === networkId)
      if (targetNet && targetNet.centerLat && targetNet.centerLng) {
        const zoom = targetNet.defaultZoom || 15
        map.setView([targetNet.centerLat, targetNet.centerLng], zoom, { animate: true, duration: 0.8 })
      }
    }
  } catch (err) {
    console.error('Fetch boundary error:', err)
  }
}

async function loadRoadNetworkRange(networkId) {
  await loadXzqBoundary(networkId)
}

function resetRoute() {
  resetPickingMode()
  startLng.value = ''
  startLat.value = ''
  endLng.value = ''
  endLat.value = ''
  updateMarkers()

  if (map) {
    if (routeGlowLayer) { map.removeLayer(routeGlowLayer); routeGlowLayer = null }
    if (routeCoreLayer) { map.removeLayer(routeCoreLayer); routeCoreLayer = null }
    if (startDashLayer) { map.removeLayer(startDashLayer); startDashLayer = null }
    if (endDashLayer) { map.removeLayer(endDashLayer); endDashLayer = null }
    if (routeArrowLayer) { map.removeLayer(routeArrowLayer); routeArrowLayer = null }
  }
  currentRouteCoords = null
  showResultCard.value = false
  resStatus.value = '已重置'
  resStatusColor.value = '#38bdf8'
}

async function planRoute() {
  resetPickingMode()

  const sLng = parseFloat(startLng.value)
  const sLat = parseFloat(startLat.value)
  const eLng = parseFloat(endLng.value)
  const eLat = parseFloat(endLat.value)

  if (isNaN(sLng) || isNaN(sLat) || isNaN(eLng) || isNaN(eLat)) {
    alert('请先在地图上点击选点或输入有效的起点与终点经纬度坐标！')
    return
  }

  if (map) {
    if (routeGlowLayer) { map.removeLayer(routeGlowLayer); routeGlowLayer = null }
    if (routeCoreLayer) { map.removeLayer(routeCoreLayer); routeCoreLayer = null }
    if (startDashLayer) { map.removeLayer(startDashLayer); startDashLayer = null }
    if (endDashLayer) { map.removeLayer(endDashLayer); endDashLayer = null }
    if (routeArrowLayer) { map.removeLayer(routeArrowLayer); routeArrowLayer = null }
  }
  currentRouteCoords = null

  showResultCard.value = true
  resStatusColor.value = '#38bdf8'
  resStatus.value = '计算中...'
  resDistance.value = '-- km'
  resNodes.value = '-- -> --'
  isPlanning.value = true

  const payload = {
    networkId: selectedNetworkId.value || null,
    startLng: sLng,
    startLat: sLat,
    endLng: eLng,
    endLat: eLat,
    directed: chkDirected.value
  }

  try {
    const response = await fetch(`${routeApiBase}/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`HTTP 错误: status ${response.status}`)
    }

    const res = await response.json()
    isPlanning.value = false

    if (res.code === 200 && res.data && res.data.geometry && map) {
      resStatusColor.value = '#10b981'
      resStatus.value = '规划成功'

      const distanceKm = (res.data.totalDistance / 1000).toFixed(2)
      resDistance.value = `${distanceKm} km`
      resNodes.value = `${res.data.startNode} -> ${res.data.endNode}`

      // 1. 绘制底层红色发光光晕线
      routeGlowLayer = L.geoJSON(res.data.geometry, {
        renderer: L.canvas({ padding: 0.5 }),
        style: {
          color: '#dc2626',
          weight: 10,
          opacity: 0.6,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(map)

      // 2. 绘制上层亮红核心导向线
      routeCoreLayer = L.geoJSON(res.data.geometry, {
        renderer: L.canvas({ padding: 0.5 }),
        style: {
          color: '#f43f5e',
          weight: 5,
          opacity: 1.0,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(map)

      // 3. 提取起点与终点 Marker 到路网弧段吸附点的坐标，绘制蓝色虚线
      const routeGeo = res.data.geometry
      let startSnap = null
      let endSnap = null
      currentRouteCoords = []

      if (routeGeo && routeGeo.features && routeGeo.features.length > 0) {
        routeGeo.features.forEach(feat => {
          if (feat.geometry) {
            if (feat.geometry.type === 'LineString') {
              currentRouteCoords.push(...feat.geometry.coordinates)
            } else if (feat.geometry.type === 'MultiLineString') {
              feat.geometry.coordinates.forEach(line => {
                currentRouteCoords.push(...line)
              })
            }
          }
        })

        if (currentRouteCoords && currentRouteCoords.length > 0) {
          const firstPt = currentRouteCoords[0]
          const lastPt = currentRouteCoords[currentRouteCoords.length - 1]
          startSnap = [firstPt[1], firstPt[0]]
          endSnap = [lastPt[1], lastPt[0]]
        }
      }

      if (startSnap && (Math.abs(startSnap[0] - sLat) > 1e-6 || Math.abs(startSnap[1] - sLng) > 1e-6)) {
        startDashLayer = L.polyline([[sLat, sLng], startSnap], {
          color: '#38bdf8',
          weight: 2.5,
          dashArray: '6, 6',
          opacity: 0.95,
          lineCap: 'round'
        }).addTo(map)
      }

      if (endSnap && (Math.abs(endSnap[0] - eLat) > 1e-6 || Math.abs(endSnap[1] - eLng) > 1e-6)) {
        endDashLayer = L.polyline([[eLat, eLng], endSnap], {
          color: '#38bdf8',
          weight: 2.5,
          dashArray: '6, 6',
          opacity: 0.95,
          lineCap: 'round'
        }).addTo(map)
      }

      // 4. 绘制沿路径的方向示向箭头
      if (currentRouteCoords && currentRouteCoords.length > 1) {
        renderRouteArrows(currentRouteCoords, map)
      }

      // 5. 自适应缩放居中整条路线及辅助线
      const fitGroup = L.featureGroup([
        routeCoreLayer,
        ...(startDashLayer ? [startDashLayer] : []),
        ...(endDashLayer ? [endDashLayer] : [])
      ])
      const bounds = fitGroup.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], animate: true, duration: 1.2 })
      }
    } else {
      resStatusColor.value = '#ef4444'
      resStatus.value = res.msg || '路径寻找失败'
    }
  } catch (err) {
    isPlanning.value = false
    resStatusColor.value = '#ef4444'
    resStatus.value = `请求异常: ${err.message}`
    console.error('Route API error:', err)
  }
}

function openManageModal() {
  editableNetworks.value = networksList.value.map(net => ({
    ...net,
    editingName: net.name || net.id
  }))
  showManageModal.value = true
}

function openUploadFromManage() {
  showManageModal.value = false
  uploadMsg.show = false
  uploadNetId.value = ''
  uploadNetName.value = ''
  selectedFiles.value = []
  if (shpFileInput.value) shpFileInput.value.value = ''
  showUploadModal.value = true
}

function handleFolderSelect(e) {
  selectedFiles.value = Array.from(e.target.files || [])
}

async function saveNetworkName(net) {
  const newName = net.editingName ? net.editingName.trim() : ''
  if (!newName) {
    alert('路网名称不能为空！')
    return
  }

  try {
    const url = `${routeApiBase}/update-name?networkId=${net.id}&name=${encodeURIComponent(newName)}`
    const response = await fetch(url, { method: 'POST' })
    const res = await response.json()
    if (res.code === 200) {
      alert(`✅ ${res.msg || '名称更新成功！'}`)
      fetchRoadNetworks()
    } else {
      alert(`❌ 更新失败: ${res.msg}`)
    }
  } catch (err) {
    alert(`❌ 请求异常: ${err.message}`)
  }
}

async function deleteNetwork(net) {
  if (!confirm(`⚠️ 危险操作确认：\n确认要彻底删除路网【${net.name}】及其 PostgreSQL 数据库物理表 (${net.id}_base 和 ${net.id}_base_noded) 吗？\n此操作不可撤销！`)) {
    return
  }

  try {
    const url = `${routeApiBase}/delete?networkId=${net.id}`
    const response = await fetch(url, { method: 'POST' })
    const res = await response.json()
    if (res.code === 200) {
      alert(`✅ ${res.msg || '删除成功！'}`)
      fetchRoadNetworks()
    } else {
      alert(`❌ 删除失败: ${res.msg}`)
    }
  } catch (err) {
    alert(`❌ 请求异常: ${err.message}`)
  }
}

async function submitUpload() {
  const files = selectedFiles.value
  const netId = uploadNetId.value.trim()
  const netName = uploadNetName.value.trim()
  const encoding = uploadEncoding.value

  if (!files || files.length === 0) {
    alert('请先选择包含 .shp 文件的本地文件夹！')
    return
  }
  if (!netId) {
    alert('请输入路网标识 Code（例: cd_road）！')
    return
  }

  const shpRelatedExtensions = ['.shp', '.dbf', '.shx', '.prj', '.cpg', '.sbn', '.sbx']
  let hasShp = false
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) {
    const fname = files[i].name.toLowerCase()
    const ext = fname.substring(fname.lastIndexOf('.'))
    if (shpRelatedExtensions.includes(ext)) {
      formData.append('files', files[i])
      if (ext === '.shp') hasShp = true
    }
  }

  if (!hasShp) {
    alert('选择的文件夹中未找到核心 .shp 图层文件，请检查并选择包含 Shapefile 的文件夹！')
    return
  }

  formData.append('networkId', netId)
  formData.append('networkName', netName || netId)
  formData.append('encoding', encoding)

  uploadMsg.show = true
  uploadMsg.color = '#38bdf8'
  uploadMsg.text = '⏳ 正转换并构建拓扑路网中（拆线、打断节点、构建拓扑），请稍候...'
  isUploading.value = true

  try {
    const response = await fetch(`${routeApiBase}/upload-shp-folder`, {
      method: 'POST',
      body: formData
    })
    const res = await response.json()
    isUploading.value = false
    if (res.code === 200) {
      uploadMsg.color = '#10b981'
      uploadMsg.text = '✅ ' + (res.data ? res.data.msg : '路网构建成功！')
      setTimeout(() => {
        showUploadModal.value = false
        fetchRoadNetworks(netId)
      }, 1500)
    } else {
      uploadMsg.color = '#ef4444'
      uploadMsg.text = '❌ ' + (res.msg || '构建失败')
    }
  } catch (err) {
    isUploading.value = false
    uploadMsg.color = '#ef4444'
    uploadMsg.text = `❌ 请求异常: ${err.message}`
    console.error('Upload Error:', err)
  }
}

onMounted(() => {
  const targetBounds = L.latLngBounds(
    [26.04, 97.34],
    [34.16, 108.55]
  )
  const safeBounds = targetBounds.pad(0.3)

  map = L.map(mapContainer.value, {
    center: [30.632, 104.114],
    zoom: 17,
    minZoom: 6,
    maxZoom: 18,
    maxBounds: safeBounds,
    maxBoundsViscosity: 1.0,
    zoomControl: true,
    attributionControl: false,
    preferCanvas: true
  })

  const vecUrl = `https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${tk}`
  vecLayer = L.tileLayer(vecUrl, {
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    minZoom: 1,
    maxZoom: 18,
    attribution: '天地图'
  })

  const cvaUrl = `https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${tk}`
  cvaLayer = L.tileLayer(cvaUrl, {
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    minZoom: 1,
    maxZoom: 18
  })

  baseMapGroup = L.layerGroup([vecLayer, cvaLayer])

  // WMTS 路网背景瓦片
  const wmtsTileUrl = `${apiBaseUrl || 'http://localhost:8080'}/geoserver/gwc/service/wmts?` +
    'Request=GetTile&Service=WMTS&Version=1.0.0' +
    '&LAYER=basemap:sc_road&STYLE=&Format=image%2Fpng' +
    '&TILEMATRIXSET=EPSG%3A900913&TILEMATRIX=EPSG%3A900913%3A{z}' +
    '&TILEROW={y}&TILECOL={x}'

  wmtsRoadLayer = L.tileLayer(wmtsTileUrl, {
    minZoom: 1,
    maxZoom: 18,
    opacity: 0.85,
    zIndex: 300
  })

  if (chkShowRoads.value) {
    wmtsRoadLayer.addTo(map)
  }

  updateZoomDisplay()
  map.on('zoom zoomend move', updateZoomDisplay)
  map.on('click', handleMapClick)
  map.on('zoomend', () => {
    if (currentRouteCoords && currentRouteCoords.length > 1) {
      renderRouteArrows(currentRouteCoords, map)
    }
  })

  fetchRoadNetworks()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
.leaflet-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: #0b1120;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

#map {
  width: 100%;
  height: 100%;
  background-color: #0b1120;
}

.picking-cursor {
  cursor: crosshair !important;
}

/* 路径规划浮动控制面板 */
.route-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;
  width: 340px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 18px;
  color: #f8fafc;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #38bdf8;
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 7px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  line-height: 1.2;
}

.coord-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.coord-field {
  flex: 1;
  display: flex;
  align-items: center;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.coord-field:focus-within {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
  background: rgba(30, 41, 59, 0.95);
}

.coord-tag {
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.6);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
  white-space: nowrap;
}

.coord-field .coord-input {
  flex: 1;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 6px 8px;
  color: #e2e8f0;
  font-size: 12px;
  font-family: 'Courier New', Courier, monospace;
  outline: none;
  min-width: 0;
  width: 100%;
  box-shadow: none;
}

.coord-input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 6px 10px;
  color: #e2e8f0;
  font-size: 12px;
  font-family: 'Courier New', Courier, monospace;
  outline: none;
  transition: all 0.2s ease;
}

.coord-input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
}

.full-width-select {
  width: 100%;
  cursor: pointer;
}

.full-width-input {
  width: 100%;
}

select.coord-input option {
  background-color: #0f172a;
  color: #f8fafc;
}

.pick-btn {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 11.5px;
  line-height: 18px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pick-btn:hover {
  background: rgba(56, 189, 248, 0.3);
}

.pick-btn.active {
  background: #0284c7;
  color: #ffffff;
  border-color: #38bdf8;
  box-shadow: 0 0 10px rgba(2, 132, 199, 0.6);
}

.btn-manage-badge {
  padding: 2px 10px;
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.4);
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-size: 12px;
  color: #cbd5e1;
  cursor: pointer;
}

.option-row input {
  cursor: pointer;
  accent-color: #0284c7;
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.btn-submit {
  flex: 2;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: none;
  color: #ffffff;
  font-weight: 600;
  border-radius: 8px;
  padding: 9px;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
  transition: all 0.2s ease;
}

.btn-submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(2, 132, 199, 0.6);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-reset {
  flex: 1;
  background: rgba(51, 65, 85, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  border-radius: 8px;
  padding: 9px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-reset:hover {
  background: rgba(71, 85, 105, 0.8);
  color: #ffffff;
}

/* 结果展示卡片 */
.result-card {
  margin-top: 14px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  display: none;
}

.result-card.show {
  display: block;
}

.result-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.result-item:last-child {
  margin-bottom: 0;
}

.result-key {
  color: #94a3b8;
}

.result-val {
  color: #38bdf8;
  font-weight: 700;
  font-family: 'Courier New', Courier, monospace;
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

/* Modal 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(11, 17, 32, 0.75);
  backdrop-filter: blur(8px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  padding: 20px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  color: #f8fafc;
}

.manage-modal-width {
  max-width: 680px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: #38bdf8;
}

.modal-close {
  font-size: 20px;
  cursor: pointer;
  color: #94a3b8;
}

.modal-close:hover {
  color: #ffffff;
}

.max-modal-body {
  max-height: 60vh;
  overflow-y: auto;
}

.manage-sub-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.sub-header-desc {
  font-size: 13px;
  color: #94a3b8;
}

.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
  flex: none;
  width: auto;
}

.manage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.manage-table thead tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  text-align: left;
}

.manage-table th,
.manage-table td {
  padding: 8px;
}

.manage-table tbody tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.net-id-cell {
  font-family: monospace;
  color: #38bdf8;
}

.edit-name-input {
  width: 180px;
  padding: 3px 8px;
  font-size: 12px;
}

.text-center {
  text-align: center;
}

.btn-sm-action {
  padding: 2px 8px;
  margin-right: 4px;
}

.protected-badge {
  font-size: 11px;
  color: #64748b;
  padding: 2px 6px;
}

.btn-del-net {
  padding: 2px 8px;
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.4);
}

.modal-footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.empty-td {
  padding: 12px;
  color: #94a3b8;
}

.upload-msg {
  margin-top: 10px;
  font-size: 12px;
}
</style>
