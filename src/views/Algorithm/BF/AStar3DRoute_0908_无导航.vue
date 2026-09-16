<template>
  <div class="leaflet-container" :class="{ 'picking-cursor': pickingMode !== null || isContinuousPicking }">
    <!-- 纯净全屏地图容器 -->
    <div id="map" ref="mapContainer"></div>

    <!-- 路径规划控制面板 -->
    <div class="route-panel">
      <!-- 顶部固定栏：面板标题与模式 Badge -->
      <div class="route-panel-header">
        <div class="panel-header">
          <span class="panel-title">pgRouting A* 算法</span>
          <span class="mode-badge" :class="paradigmBadgeClass">{{ paradigmBadgeText }}</span>
        </div>
      </div>

      <!-- 主体滚动区 -->
      <div class="route-panel-body">
        <!-- 选择路网数据集 -->
        <div class="form-group">
          <div class="form-label">
            <span>🌐 选择路网数据集</span>
            <button type="button" class="pick-btn btn-manage-badge" @click="openManageModal">
              ⚙️ 路网管理
            </button>
          </div>
          <!-- 行政级别单选切换 (市级、区县、乡镇、街道) -->
          <div class="level-radio-group">
            <label class="level-radio-item" :class="{ active: selectedLevelFilter === 'city' }">
              <input type="radio" name="levelFilter" value="city" v-model="selectedLevelFilter"
                @change="onLevelFilterChange" />
              <span class="radio-dot"></span>
              <span class="radio-text">市级</span>
            </label>
            <label class="level-radio-item" :class="{ active: selectedLevelFilter === 'county' }">
              <input type="radio" name="levelFilter" value="county" v-model="selectedLevelFilter"
                @change="onLevelFilterChange" />
              <span class="radio-dot"></span>
              <span class="radio-text">区县</span>
            </label>
            <label class="level-radio-item" :class="{ active: selectedLevelFilter === 'town' }">
              <input type="radio" name="levelFilter" value="town" v-model="selectedLevelFilter"
                @change="onLevelFilterChange" />
              <span class="radio-dot"></span>
              <span class="radio-text">乡镇</span>
            </label>
            <label class="level-radio-item" :class="{ active: selectedLevelFilter === 'village' }">
              <input type="radio" name="levelFilter" value="village" v-model="selectedLevelFilter"
                @change="onLevelFilterChange" />
              <span class="radio-dot"></span>
              <span class="radio-text">街道</span>
            </label>
          </div>

          <select v-model="selectedNetworkId" class="coord-input full-width-select" @change="onNetworkChange">
            <option v-if="networksLoading" value="">加载路网配置中...</option>
            <option v-else-if="filteredNetworksList.length === 0" value="">当前级别暂无 3D 立体路网配置</option>
            <option v-for="net in filteredNetworksList" :key="net.id" :value="net.id">
              {{ net.name }}
            </option>
          </select>
        </div>

        <!-- 寻路范式单选切换 (1:1 / 1:N / N:1) -->
        <div class="form-group">
          <div class="form-label">
            <span>🎯 规划范式</span>
          </div>
          <div class="paradigm-selector-group">
            <div class="paradigm-item" :class="{ active: currentParadigm === '1_to_1' }"
              @click="switchParadigm('1_to_1')">
              <span>1 对 1</span>
              <span style="font-size: 10px; opacity: 0.8;">(点对点)</span>
            </div>
            <div class="paradigm-item" :class="{ active: currentParadigm === '1_to_n' }"
              @click="switchParadigm('1_to_n')">
              <span>1 对 N</span>
              <span style="font-size: 10px; opacity: 0.8;">(1起多终)</span>
            </div>
            <div class="paradigm-item" :class="{ active: currentParadigm === 'n_to_1' }"
              @click="switchParadigm('n_to_1')">
              <span>N 对 1</span>
              <span style="font-size: 10px; opacity: 0.8;">(多起1终)</span>
            </div>
          </div>
        </div>

        <!-- 单起点坐标输入与选点 (1:1 与 1:N 显示) -->
        <div class="form-group" v-if="currentParadigm === '1_to_1' || currentParadigm === '1_to_n'">
          <div class="form-label">
            <span>📍 起点 (经度, 纬度)</span>
            <button type="button" class="pick-btn btn-manage-badge" :class="{ active: pickingMode === 'start' }"
              @click="togglePickMode('start')">
              {{ pickingMode === 'start' ? '📍 正在选点...' : '🎯 地图选点' }}
            </button>
          </div>
          <div class="coord-row">
            <div class="coord-field">
              <span class="coord-tag">经度</span>
              <input type="text" inputmode="decimal" v-model.number="startLng" class="coord-input"
                placeholder="例: 104.114" @change="updateMarkers" />
            </div>
            <div class="coord-field">
              <span class="coord-tag">纬度</span>
              <input type="text" inputmode="decimal" v-model.number="startLat" class="coord-input"
                placeholder="例: 30.632" @change="updateMarkers" />
            </div>
          </div>
        </div>

        <!-- 多起点管理容器 (N:1 显示) -->
        <div class="form-group" v-if="currentParadigm === 'n_to_1'">
          <div class="form-label">
            <span>📍 起点集合 (已选 <b style="color:#10b981;">{{ multiOrigPoints.length }}</b> 个)</span>
          </div>
          <div class="multi-action-bar">
            <button type="button" class="btn-multi-pick" :class="{ active: isContinuousPicking === 'origins' }"
              @click="toggleContinuousPicking('origins')">
              <span>{{ isContinuousPicking === 'origins' ? '⏹️ 点击地图选点 (点击完成)' : '➕ 在地图上连续选起点' }}</span>
            </button>
            <button type="button" class="btn-multi-clear" @click="clearOrigPoints">清空</button>
          </div>
          <div class="multi-points-card">
            <div v-if="multiOrigPoints.length === 0"
              style="color: #64748b; font-size: 11px; text-align: center; padding: 10px 0;">
              暂未添加起点，请点击上方按钮在地图选点
            </div>
            <div v-else v-for="(pt, idx) in multiOrigPoints" :key="pt.id" class="multi-point-row">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="point-tag-badge" :style="{ background: pt.color }">S{{ idx + 1 }}</span>
                <span class="point-coords-text">{{ pt.lng.toFixed(4) }}, {{ pt.lat.toFixed(4) }}</span>
              </div>
              <button type="button" class="btn-del-point" @click="removeOrigPoint(idx)" title="删除此起点">&times;</button>
            </div>
          </div>
        </div>

        <!-- 单终点坐标输入与选点 (1:1 与 N:1 显示) -->
        <div class="form-group" v-if="currentParadigm === '1_to_1' || currentParadigm === 'n_to_1'">
          <div class="form-label">
            <span>🏁 终点 (经度, 纬度)</span>
            <button type="button" class="pick-btn btn-manage-badge" :class="{ active: pickingMode === 'end' }"
              @click="togglePickMode('end')">
              {{ pickingMode === 'end' ? '🏁 正在选点...' : '🎯 地图选点' }}
            </button>
          </div>
          <div class="coord-row">
            <div class="coord-field">
              <span class="coord-tag">经度</span>
              <input type="text" inputmode="decimal" v-model.number="endLng" class="coord-input"
                placeholder="例: 104.120" @change="updateMarkers" />
            </div>
            <div class="coord-field">
              <span class="coord-tag">纬度</span>
              <input type="text" inputmode="decimal" v-model.number="endLat" class="coord-input" placeholder="例: 30.638"
                @change="updateMarkers" />
            </div>
          </div>
        </div>

        <!-- 多终点管理容器 (1:N 显示) -->
        <div class="form-group" v-if="currentParadigm === '1_to_n'">
          <div class="form-label">
            <span>🏁 终点集合 (已选 <b style="color:#38bdf8;">{{ multiDestPoints.length }}</b> 个)</span>
          </div>
          <div class="multi-action-bar">
            <button type="button" class="btn-multi-pick" :class="{ active: isContinuousPicking === 'dests' }"
              @click="toggleContinuousPicking('dests')">
              <span>{{ isContinuousPicking === 'dests' ? '⏹️ 点击地图选点 (点击完成)' : '➕ 在地图上连续选终点' }}</span>
            </button>
            <button type="button" class="btn-multi-clear" @click="clearDestPoints">清空</button>
          </div>
          <div class="multi-points-card">
            <div v-if="multiDestPoints.length === 0"
              style="color: #64748b; font-size: 11px; text-align: center; padding: 10px 0;">
              暂未添加终点，请点击上方按钮在地图选点
            </div>
            <div v-else v-for="(pt, idx) in multiDestPoints" :key="pt.id" class="multi-point-row">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="point-tag-badge" :style="{ background: pt.color }">D{{ idx + 1 }}</span>
                <span class="point-coords-text">{{ pt.lng.toFixed(4) }}, {{ pt.lat.toFixed(4) }}</span>
              </div>
              <button type="button" class="btn-del-point" @click="removeDestPoint(idx)" title="删除此终点">&times;</button>
            </div>
          </div>
        </div>

        <label class="option-row">
          <input type="checkbox" v-model="chkShowRoute" @change="updateRouteVisibility" />
          <span>🛣️ 显示规划路径</span>
        </label>

        <label class="option-row">
          <input type="checkbox" v-model="chkShowBaseMap" @change="toggleBaseMap" />
          <span>🗺️ 显示天地图底图</span>
        </label>

        <label class="option-row">
          <input type="checkbox" v-model="chkShowRoads" @change="toggleRoadLayer" />
          <span>👁️ 显示数据源 (WMTS 瓦片)</span>
        </label>

        <!-- 结果反馈区域 -->
        <div class="result-card" :class="{ show: showResultCard }">
          <div class="result-item">
            <span class="result-key">计算状态:</span>
            <span class="result-val" :style="{ color: resStatusColor }">{{ resStatus }}</span>
          </div>

          <!-- 单路线结果项 (1:1) -->
          <template v-if="currentParadigm === '1_to_1'">
            <div class="result-item">
              <span class="result-key">全线总里程:</span>
              <span class="result-val">{{ resDistance }}</span>
            </div>
            <div class="result-item">
              <span class="result-key">拓扑匹配节点:</span>
              <span class="result-val">{{ resNodes }}</span>
            </div>
          </template>

          <!-- 多路线汇总与列表 (1:N 与 N:1) -->
          <div v-else style="border-top: 1px dashed rgba(255,255,255,0.15); margin-top: 8px; padding-top: 8px;">
            <div class="result-item">
              <span class="result-key">已规划路线数:</span>
              <span class="result-val" style="color: #38bdf8;">{{ resMultiCount }}</span>
            </div>
            <div class="result-item">
              <span class="result-key">最优 / 最远路线:</span>
              <span class="result-val" style="color: #10b981;">{{ resMultiExtremes }}</span>
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: #94a3b8;">
              路线列表 (点击居中聚焦高亮):
            </div>
            <div class="multi-route-card-list">
              <div v-for="rt in multiRouteListItems" :key="rt.id" class="multi-route-card-item"
                :class="{ selected: selectedRouteIdx === rt.id }" @click="focusRoute(rt.id)">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="point-tag-badge" :style="{ background: rt.color }">{{ rt.label }}</span>
                  <span style="color: #e2e8f0; font-weight: 600;">路线 {{ rt.id + 1 }}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: #38bdf8; font-weight: 700; font-family: monospace;">{{ rt.distKm }} km</span>
                  <span style="font-size: 10px; color: #94a3b8;">({{ rt.nodeCount }}节点)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部固定操作区：规划与重置按钮常驻可见 -->
      <div class="route-panel-footer">
        <div class="action-row">
          <button type="button" class="btn-submit" :disabled="isPlanning" @click="planRoute">
            {{ isPlanning ? '⏳ 计算中...' : '🚀 开始规划路径' }}
          </button>
          <button type="button" class="btn-reset" @click="resetRoute">
            🔄 重置
          </button>
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
          <span class="modal-title">⚙️ 数据库路网数据集管理 (3D 立体分层)</span>
          <span class="modal-close" @click="showManageModal = false">&times;</span>
        </div>
        <div class="modal-body max-modal-body">
          <div class="manage-sub-header">
            <span class="sub-header-desc">包含新建、名称修改与物理删除管理：</span>
            <button type="button" class="btn-submit btn-sm" @click="openXzqFromManage">
              🏛️ + 行政区划相交新建路网
            </button>
          </div>

          <!-- 行政级别单选切换 (全部、市级、区县、乡镇、街道) -->
          <div class="level-radio-group manage-level-radio">
            <label class="level-radio-item" :class="{ active: manageLevelFilter === 'city' }">
              <input type="radio" name="manageLevelFilter" value="city" v-model="manageLevelFilter" />
              <span class="radio-dot"></span>
              <span class="radio-text">市级 ({{ countByLevel('city') }})</span>
            </label>
            <label class="level-radio-item" :class="{ active: manageLevelFilter === 'county' }">
              <input type="radio" name="manageLevelFilter" value="county" v-model="manageLevelFilter" />
              <span class="radio-dot"></span>
              <span class="radio-text">区县 ({{ countByLevel('county') }})</span>
            </label>
            <label class="level-radio-item" :class="{ active: manageLevelFilter === 'town' }">
              <input type="radio" name="manageLevelFilter" value="town" v-model="manageLevelFilter" />
              <span class="radio-dot"></span>
              <span class="radio-text">乡镇 ({{ countByLevel('town') }})</span>
            </label>
            <label class="level-radio-item" :class="{ active: manageLevelFilter === 'village' }">
              <input type="radio" name="manageLevelFilter" value="village" v-model="manageLevelFilter" />
              <span class="radio-dot"></span>
              <span class="radio-text">街道 ({{ countByLevel('village') }})</span>
            </label>
            <label class="level-radio-item" :class="{ active: manageLevelFilter === 'all' }">
              <input type="radio" name="manageLevelFilter" value="all" v-model="manageLevelFilter" />
              <span class="radio-dot"></span>
              <span class="radio-text">全部 ({{ editableNetworks.length }})</span>
            </label>
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
              <tr v-if="filteredEditableNetworks.length === 0">
                <td colspan="3" class="text-center empty-td">当前级别暂无配置的路网数据</td>
              </tr>
              <tr v-for="net in filteredEditableNetworks" :key="net.id">
                <td class="net-id-cell">
                  <div>{{ net.id }}</div>
                  <div v-if="net.buildTime" style="font-size: 11px; color: #64748b; margin-top: 2px;">🕒 {{
                    net.buildTime }}
                  </div>
                </td>
                <td>
                  <input type="text" v-model="net.editingName" class="coord-input edit-name-input" />
                </td>
                <td class="text-center">
                  <button type="button" class="pick-btn btn-sm-action" @click="saveNetworkName(net)">
                    💾 保存名称
                  </button>
                  <span v-if="net.id === 'shjd_road'" class="protected-badge">系统保护</span>
                  <button v-else type="button" class="pick-btn btn-del-net" @click="deleteNetwork(net)">
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

    <!-- 行政区划相交新建路网 Modal 弹窗 -->
    <div v-if="showXzqModal" class="modal-overlay" @click.self="showXzqModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-title">🏛️ 行政区划相交新建路网 (3D 立体分层)</span>
          <span class="modal-close" @click="showXzqModal = false">&times;</span>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">🌐 选择行政区划级别</label>
            <div class="xzq-level-container">
              <button v-for="lvl in xzqLevels" :key="lvl.key" type="button" class="pick-btn xzq-lvl-btn"
                :class="{ active: currentLevel === lvl.key }" @click="switchXzqLevel(lvl.key)">
                {{ lvl.name }}
              </button>
              <div v-if="xzqLevels.length === 0" class="loading-hint">⏳ 加载级别中...</div>
            </div>
            <div v-if="currentLevelExistingCount > 0" class="existing-filter-tip">
              🛡️ 已自动过滤当前级别已在数据库中建图的 {{ currentLevelExistingCount }} 个行政区，防止重复建图
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">🔍 搜索或选择要素</label>
            <input type="text" v-model="xzqSearchKeyword" class="coord-input full-width-input"
              placeholder="输入关键字快速多列模糊匹配过滤..." />
            <div class="xzq-list-wrapper" @scroll="handleXzqScroll">
              <div v-if="xzqListLoading" class="loading-state">⏳ 正在加载行政区划列表中...</div>
              <template v-else-if="xzqList.length > 0">
                <table class="xzq-table">
                  <thead>
                    <tr>
                      <th v-for="f in xzqFields" :key="f">{{ f }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in xzqList" :key="item.id"
                      :class="{ selected: selectedXzqItem && selectedXzqItem.id === item.id }"
                      @click="onSelectXzqItem(item)">
                      <td v-for="f in xzqFields" :key="f">
                        {{ (item.fields && item.fields[f]) || item[f] || item.name || item.id || '-' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="isXzqLoadingMore" class="scroll-more-hint">
                  ⏳ 正在加载下 100 条...
                </div>
                <div v-else-if="xzqHasMore" class="scroll-more-hint">
                  ⬇️ 已展示 {{ xzqList.length }} / {{ xzqTotal }} 条，向下滚动自动加载下 100 条...
                </div>
                <div v-else-if="xzqList.length > 0" class="scroll-more-hint end-hint">
                  ✓ 已加载全部 {{ xzqList.length }} 条要素
                </div>
              </template>
              <div v-else class="empty-state">未检索到匹配的行政区划要素（可能已全部建图）</div>
            </div>
            <div v-if="selectedXzqItem" class="selected-summary-bar">
              <span class="summary-label">📌 选中完整名称：</span>
              <span class="summary-value">{{ getXzqItemFullName(selectedXzqItem) }}</span>
            </div>
          </div>

          <div v-if="xzqMsg.show" class="upload-msg" :style="{ color: xzqMsg.color }">
            {{ xzqMsg.text }}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-submit" :disabled="isXzqBuilding" @click="submitXzqBuild">
            {{ isXzqBuilding ? '⏳ 构建中...' : '🚀 开始相交构建路网' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, markRaw } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PGRBRouter } from '@/utils/pgrb-router.js'

const mapContainer = ref(null)

const zoomValue = ref('--')
const selectedLevelFilter = ref('county') // 'city' | 'county' | 'town' | 'village'
const selectedNetworkId = ref('')
const networksList = ref([])
const editableNetworks = ref([])
const networksLoading = ref(true)

const currentParadigm = ref('1_to_1') // '1_to_1' | '1_to_n' | 'n_to_1'
const multiDestPoints = ref([]) // [{ id, lng, lat, color, marker }]
const multiOrigPoints = ref([]) // [{ id, lng, lat, color, marker }]
const isContinuousPicking = ref(false) // false | 'dests' | 'origins'

const startLng = ref('')
const startLat = ref('')
const endLng = ref('')
const endLat = ref('')

const chkShowRoute = ref(true)
const chkShowBaseMap = ref(false)
const chkShowRoads = ref(true)

const pickingMode = ref(null) // 'start' | 'end' | null
const isPlanning = ref(false)

const showResultCard = ref(false)
const resStatus = ref('未运行')
const resStatusColor = ref('#38bdf8')
const resDistance = ref('-- km')
const resNodes = ref('-- -> --')

const resMultiCount = ref('0 条')
const resMultiExtremes = ref('-- / --')
const multiRouteListItems = ref([])
const selectedRouteIdx = ref(null)

const showManageModal = ref(false)
const manageLevelFilter = ref('county') // 'city' | 'county' | 'town' | 'village' | 'all'
const showXzqModal = ref(false)

const xzqLevels = ref([])
const currentLevel = ref('town')
const xzqFields = ref([])
const xzqList = ref([])
const xzqSearchKeyword = ref('')
const xzqListLoading = ref(false)
const isXzqLoadingMore = ref(false)
const selectedXzqItem = ref(null)
const isXzqBuilding = ref(false)
const xzqPage = ref(1)
const xzqPageSize = ref(100)
const xzqTotal = ref(0)
const xzqHasMore = ref(false)
const xzqMsg = reactive({
  show: false,
  text: '',
  color: ''
})

let map = null
let vecLayer = null
let cvaLayer = null
let baseMapGroup = null
let wmtsRoadLayer = null
let startMarker = null
let endMarker = null
let routeGlowLayer = null
let routeCoreLayer = null
let startDashLayer = null
let endDashLayer = null
let routeArrowLayer = null
let xzqHighlightLayer = null
let currentRouteCoords = null
let multiRouteLayers = []

let pgrbRouterInstance = null

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
const routeApiBase = `${apiBaseUrl}/get_geo_pg/geo/route`
const tk = '73a87062ca36baaed0feebe7989f453a'

const ROUTE_PALETTE = [
  '#38bdf8', '#f59e0b', '#10b981', '#ec4899', '#a855f7',
  '#06b6d4', '#84cc16', '#f97316', '#e11d48', '#14b8a6',
  '#8b5cf6', '#eab308'
]

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

function createPointIcon(label, color = '#38bdf8') {
  return L.divIcon({
    className: 'custom-multi-pin',
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: ${color};
      border: 2px solid #ffffff;
      border-radius: 50%;
      color: #ffffff;
      font-size: 10.5px;
      font-weight: 800;
      box-shadow: 0 0 10px ${color}, 0 2px 5px rgba(0,0,0,0.6);
    ">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  })
}

const paradigmBadgeText = computed(() => {
  if (currentParadigm.value === '1_to_n') return '1 对 N'
  if (currentParadigm.value === 'n_to_1') return 'N 对 1'
  return '1 对 1'
})

const paradigmBadgeClass = computed(() => {
  if (currentParadigm.value === '1_to_n') return 'badge-1ton'
  if (currentParadigm.value === 'n_to_1') return 'badge-nto1'
  return 'badge-3d'
})

function getXzqItemFullName(item) {
  if (!item) return ''
  if (item.fields && typeof item.fields === 'object') {
    const vals = []
    for (const key of Object.keys(item.fields)) {
      const val = item.fields[key]
      if (val && typeof val === 'string' && val.trim() !== '') {
        vals.push(val.trim())
      }
    }
    if (vals.length > 0) {
      return vals.join('')
    }
  }
  return item.name || String(item.id || '')
}

function getNetworkLevel(net) {
  if (!net) return 'county'
  if (net.level) {
    const l = String(net.level).toLowerCase()
    if (l === 'city' || l.includes('市级') || l === '市') return 'city'
    if (l === 'county' || l.includes('区') || l.includes('县')) return 'county'
    if (l === 'town' || l.includes('镇') || l.includes('乡')) return 'town'
    if (l === 'village' || l === 'street' || l.includes('街') || l.includes('村')) return 'village'
  }
  const id = (net.id || '').toLowerCase()
  if (id.startsWith('xzq_city_') || id.includes('city')) return 'city'
  if (id.startsWith('xzq_county_') || id.includes('county')) return 'county'
  if (id.startsWith('xzq_town_') || id.includes('town')) return 'town'
  if (id.startsWith('xzq_village_') || id.startsWith('xzq_street_') || id.includes('village') || id.includes('street') || id.startsWith('shjd')) return 'village'

  const name = (net.name || '')
  if (name.includes('街道') || name.includes('村') || name.includes('社区')) return 'village'
  if (name.includes('镇') || name.includes('乡')) return 'town'
  if (name.includes('区') || name.includes('县')) return 'county'
  if (name.includes('市') || name.includes('州') || name.includes('盟')) return 'city'

  return 'county'
}

function countByLevel(level) {
  if (!Array.isArray(editableNetworks.value)) return 0
  return editableNetworks.value.filter(net => getNetworkLevel(net) === level).length
}

const filteredNetworksList = computed(() => {
  if (!Array.isArray(networksList.value)) return []
  return networksList.value.filter(net => getNetworkLevel(net) === selectedLevelFilter.value)
})

const filteredEditableNetworks = computed(() => {
  if (!Array.isArray(editableNetworks.value)) return []
  if (manageLevelFilter.value === 'all') return editableNetworks.value
  return editableNetworks.value.filter(net => getNetworkLevel(net) === manageLevelFilter.value)
})

function getExistingXzqIdSet(level) {
  const idSet = new Set()
  if (!Array.isArray(networksList.value)) return idSet

  const prefix = `xzq_${level}_`
  for (const net of networksList.value) {
    if (!net || !net.id) continue
    if (net.id.startsWith(prefix)) {
      const featId = net.id.replace(prefix, '').replace(/_3d$/, '')
      idSet.add(String(featId).trim().toLowerCase())
    } else if (getNetworkLevel(net) === level) {
      idSet.add(String(net.id).replace(/_3d$/, '').trim().toLowerCase())
    }
  }
  return idSet
}

function getExistingXzqNameSet(level) {
  const nameSet = new Set()
  if (!Array.isArray(networksList.value)) return nameSet

  for (const net of networksList.value) {
    if (getNetworkLevel(net) === level && net.name) {
      nameSet.add(net.name.trim().toLowerCase())
    }
  }
  return nameSet
}

const currentLevelExistingCount = computed(() => {
  return getExistingXzqIdSet(currentLevel.value).size
})

let searchDebounceTimer = null
watch(xzqSearchKeyword, () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    loadXzqList(currentLevel.value, false)
  }, 250)
})

function handleXzqScroll(e) {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 35) {
    if (xzqHasMore.value && !isXzqLoadingMore.value && !xzqListLoading.value) {
      xzqPage.value++
      loadXzqList(currentLevel.value, true)
    }
  }
}

function updateZoomDisplay() {
  if (!map) return
  const z = map.getZoom()
  zoomValue.value = Number.isInteger(z) ? z : z.toFixed(1)
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

function isPointInGeoJSONPolygon(pt, ring) {
  const x = pt[0], y = pt[1]
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function isPointInGeoJSONBoundary(lng, lat, geojson) {
  if (!geojson) return true
  const geom = geojson.type === 'Feature' ? geojson.geometry : (geojson.type === 'FeatureCollection' ? (geojson.features[0] && geojson.features[0].geometry) : geojson)
  if (!geom) return true

  const pt = [lng, lat]
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) {
      if (isPointInGeoJSONPolygon(pt, ring)) return true
    }
    return false
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        if (isPointInGeoJSONPolygon(pt, ring)) return true
      }
    }
    return false
  }
  return true
}

function isPointInCurrentBoundary(lng, lat) {
  if (pgrbRouterInstance) {
    const geo = pgrbRouterInstance.getBoundaryGeoJSON()
    if (geo) {
      return isPointInGeoJSONBoundary(lng, lat, geo)
    }
    return pgrbRouterInstance.isPointInBoundary(lng, lat)
  }
  return true
}

function showBoundaryWarningPopup(latlng, message) {
  if (!map) return
  const popup = L.popup({
    closeButton: false,
    autoClose: true,
    closeOnClick: true,
    className: 'boundary-warning-popup',
    offset: [0, -8]
  })
    .setLatLng(latlng)
    .setContent(`<div style="display:flex; align-items:center; gap:8px; color:#fecdd3; font-weight:600; font-size:12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: nowrap;">
      <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:rgba(239,68,68,0.25); color:#f87171; flex-shrink:0;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </span>
      <span>${message}</span>
    </div>`)
    .openOn(map)

  setTimeout(() => {
    if (map && map.hasLayer(popup)) {
      map.closePopup(popup)
    }
  }, 2500)
}

function updateMarkers() {
  if (!map) return
  const sLon = parseFloat(startLng.value)
  const sLat = parseFloat(startLat.value)
  const eLon = parseFloat(endLng.value)
  const eLat = parseFloat(endLat.value)

  if (!isNaN(sLon) && !isNaN(sLat)) {
    if (!isPointInCurrentBoundary(sLon, sLat)) {
      showBoundaryWarningPopup([sLat, sLon], '起点坐标超出路网边界范围')
      startLng.value = ''
      startLat.value = ''
      if (startMarker) { startMarker.remove(); startMarker = null }
    } else {
      if (startMarker) {
        startMarker.setLatLng([sLat, sLon])
        if (!map.hasLayer(startMarker)) startMarker.addTo(map)
      } else {
        startMarker = markRaw(L.marker([sLat, sLon], { icon: iconStart }).addTo(map))
      }
    }
  } else if (startMarker) {
    startMarker.remove()
    startMarker = null
  }

  if (!isNaN(eLon) && !isNaN(eLat)) {
    if (!isPointInCurrentBoundary(eLon, eLat)) {
      showBoundaryWarningPopup([eLat, eLon], '终点坐标超出路网边界范围')
      endLng.value = ''
      endLat.value = ''
      if (endMarker) { endMarker.remove(); endMarker = null }
    } else {
      if (endMarker) {
        endMarker.setLatLng([eLat, eLon])
        if (!map.hasLayer(endMarker)) endMarker.addTo(map)
      } else {
        endMarker = markRaw(L.marker([eLat, eLon], { icon: iconEnd }).addTo(map))
      }
    }
  } else if (endMarker) {
    endMarker.remove()
    endMarker = null
  }
}

function togglePickMode(mode) {
  if (pickingMode.value === mode) {
    resetPickingMode()
  } else {
    stopContinuousPicking()
    pickingMode.value = mode
  }
}

function resetPickingMode() {
  pickingMode.value = null
}

function switchParadigm(newParadigm) {
  if (currentParadigm.value === newParadigm) return
  currentParadigm.value = newParadigm
  resetRoute()
}

function toggleContinuousPicking(type) {
  if (isContinuousPicking.value === type) {
    stopContinuousPicking()
  } else {
    isContinuousPicking.value = type
    resetPickingMode()
  }
}

function stopContinuousPicking() {
  isContinuousPicking.value = false
}

function removeDestPoint(idx) {
  const target = multiDestPoints.value[idx]
  if (target && target.marker) {
    target.marker.remove()
  }
  multiDestPoints.value.splice(idx, 1)
  multiDestPoints.value.forEach((pt, i) => {
    pt.color = ROUTE_PALETTE[i % ROUTE_PALETTE.length]
    if (pt.marker) {
      pt.marker.setLatLng([pt.lat, pt.lng])
      pt.marker.setIcon(createPointIcon(`D${i + 1}`, pt.color))
      pt.marker.bindTooltip(`终点 D${i + 1}: [${pt.lng}, ${pt.lat}]`, { direction: 'top', offset: [0, -12] })
    }
  })
  clearMultiRoutes()
  showResultCard.value = false
}

function clearDestPoints() {
  multiDestPoints.value.forEach(pt => {
    if (pt && pt.marker) pt.marker.remove()
  })
  multiDestPoints.value = []
  clearMultiRoutes()
  showResultCard.value = false
}

function removeOrigPoint(idx) {
  const target = multiOrigPoints.value[idx]
  if (target && target.marker) {
    target.marker.remove()
  }
  multiOrigPoints.value.splice(idx, 1)
  multiOrigPoints.value.forEach((pt, i) => {
    pt.color = ROUTE_PALETTE[i % ROUTE_PALETTE.length]
    if (pt.marker) {
      pt.marker.setLatLng([pt.lat, pt.lng])
      pt.marker.setIcon(createPointIcon(`S${i + 1}`, pt.color))
      pt.marker.bindTooltip(`起点 S${i + 1}: [${pt.lng}, ${pt.lat}]`, { direction: 'top', offset: [0, -12] })
    }
  })
  clearMultiRoutes()
  showResultCard.value = false
}

function clearOrigPoints() {
  multiOrigPoints.value.forEach(pt => {
    if (pt && pt.marker) pt.marker.remove()
  })
  multiOrigPoints.value = []
  clearMultiRoutes()
  showResultCard.value = false
}

function handleMapClick(e) {
  const lon = parseFloat(e.latlng.lng.toFixed(6))
  const lat = parseFloat(e.latlng.lat.toFixed(6))

  // 1. 连续选点模式
  if (isContinuousPicking.value) {
    if (!isPointInCurrentBoundary(lon, lat)) {
      showBoundaryWarningPopup(e.latlng, '不能超出边界范围选点')
      return
    }

    if (isContinuousPicking.value === 'dests') {
      const idx = multiDestPoints.value.length
      const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length]
      const marker = markRaw(L.marker([lat, lon], { icon: createPointIcon(`D${idx + 1}`, color) }).addTo(map))
      marker.bindTooltip(`终点 D${idx + 1}: [${lon}, ${lat}]`, { direction: 'top', offset: [0, -12] })
      multiDestPoints.value.push({ id: Date.now() + Math.random(), lng: lon, lat: lat, color, marker })
      clearMultiRoutes()
      showResultCard.value = false
    } else if (isContinuousPicking.value === 'origins') {
      const idx = multiOrigPoints.value.length
      const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length]
      const marker = markRaw(L.marker([lat, lon], { icon: createPointIcon(`S${idx + 1}`, color) }).addTo(map))
      marker.bindTooltip(`起点 S${idx + 1}: [${lon}, ${lat}]`, { direction: 'top', offset: [0, -12] })
      multiOrigPoints.value.push({ id: Date.now() + Math.random(), lng: lon, lat: lat, color, marker })
      clearMultiRoutes()
      showResultCard.value = false
    }
    return
  }

  // 2. 经典 1:1 单选模式
  if (!pickingMode.value) return

  if (!isPointInCurrentBoundary(lon, lat)) {
    const pointName = pickingMode.value === 'start' ? '起点' : '终点'
    showBoundaryWarningPopup(e.latlng, `不能超出边界范围设置${pointName}`)
    resetPickingMode()
    return
  }

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

function updateRouteVisibility() {
  const isVisible = chkShowRoute.value
    // 1:1 单路线图层
    ;[routeGlowLayer, routeCoreLayer, startDashLayer, endDashLayer, routeArrowLayer].forEach(layer => {
      if (layer && map) {
        if (isVisible) {
          if (!map.hasLayer(layer)) map.addLayer(layer)
        } else {
          if (map.hasLayer(layer)) map.removeLayer(layer)
        }
      }
    })
  // 1:N 与 N:1 多路线图层
  if (Array.isArray(multiRouteLayers)) {
    multiRouteLayers.forEach(r => {
      if (r.glowLayer && map) {
        if (isVisible) {
          if (!map.hasLayer(r.glowLayer)) map.addLayer(r.glowLayer)
        } else {
          if (map.hasLayer(r.glowLayer)) map.removeLayer(r.glowLayer)
        }
      }
      if (r.coreLayer && map) {
        if (isVisible) {
          if (!map.hasLayer(r.coreLayer)) map.addLayer(r.coreLayer)
        } else {
          if (map.hasLayer(r.coreLayer)) map.removeLayer(r.coreLayer)
        }
      }
      if (Array.isArray(r.dashLayers)) {
        r.dashLayers.forEach(d => {
          if (d && map) {
            if (isVisible) {
              if (!map.hasLayer(d)) map.addLayer(d)
            } else {
              if (map.hasLayer(d)) map.removeLayer(d)
            }
          }
        })
      }
    })
  }
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

let currentNetworkLoadSeq = 0

function flyMapToBounds(bounds, options = { padding: [50, 50], duration: 0.8, maxZoom: 17 }) {
  return new Promise((resolve) => {
    if (!map || !bounds || (typeof bounds.isValid === 'function' && !bounds.isValid())) {
      resolve()
      return
    }
    let resolved = false
    const onMoveEnd = () => {
      if (!resolved) {
        resolved = true
        map.off('moveend', onMoveEnd)
        resolve()
      }
    }
    map.once('moveend', onMoveEnd)
    map.fitBounds(bounds, {
      padding: options.padding || [50, 50],
      maxZoom: options.maxZoom !== undefined ? options.maxZoom : 17,
      animate: true,
      duration: options.duration || 0.8
    })
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        map.off('moveend', onMoveEnd)
        resolve()
      }
    }, (options.duration || 0.8) * 1000 + 100)
  })
}

function flyMapToCenter(lat, lng, zoom = 15, duration = 0.8) {
  return new Promise((resolve) => {
    if (!map || lat == null || lng == null) {
      resolve()
      return
    }
    let resolved = false
    const onMoveEnd = () => {
      if (!resolved) {
        resolved = true
        map.off('moveend', onMoveEnd)
        resolve()
      }
    }
    map.once('moveend', onMoveEnd)
    map.setView([lat, lng], zoom, { animate: true, duration: duration })
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        map.off('moveend', onMoveEnd)
        resolve()
      }
    }, duration * 1000 + 100)
  })
}

async function loadRoadNetworkRange(networkId) {
  const loadSeq = ++currentNetworkLoadSeq
  pgrbRouterInstance = null

  // 1. 切换区域/路网时立即重置并清除已有路径、起终点标注与结果面板
  resetRoute()

  // 2. 切换路网时立即移除旧边界
  if (xzqHighlightLayer && map) {
    map.removeLayer(xzqHighlightLayer)
    xzqHighlightLayer = null
  }
  if (!networkId) return

  const baseUrl = `${apiBaseUrl}/get_geo_pg`
  const router = new PGRBRouter()
  try {
    const targetNet = Array.isArray(networksList.value) ? networksList.value.find(n => n.id === networkId) : null
    const serverBuildTime = targetNet ? targetNet.buildTime : null
    await router.loadNetwork(networkId, baseUrl, serverBuildTime)
    if (loadSeq !== currentNetworkLoadSeq || selectedNetworkId.value !== networkId) return

    pgrbRouterInstance = router
    console.log(`[PGRB v${router.version || 2}] 内存离线图就绪: ${router.nodeCount} 节点, ${router.edgeCount} 边${router.boundaryPointCount > 0 ? `, 边界点: ${router.boundaryPointCount}` : ''} ⚡`)

    // 3. 计算最佳视角 Bounds
    let bounds = null
    const boundaryGeo = router.getBoundaryGeoJSON()
    if (boundaryGeo) {
      const tempLayer = L.geoJSON(boundaryGeo)
      bounds = tempLayer.getBounds()
    } else if (router.bbox && router.bbox.minLat != null) {
      bounds = L.latLngBounds(
        [router.bbox.minLat, router.bbox.minLng],
        [router.bbox.maxLat, router.bbox.maxLng]
      )
    }

    if (bounds && bounds.isValid() && map) {
      await flyMapToBounds(bounds, { padding: [50, 50], maxZoom: 17, duration: 0.8 })
    } else if (Array.isArray(networksList.value) && map) {
      const targetNet = networksList.value.find(n => n.id === networkId)
      if (targetNet && targetNet.centerLat && targetNet.centerLng) {
        const zoom = targetNet.defaultZoom || 15
        await flyMapToCenter(targetNet.centerLat, targetNet.centerLng, zoom, 0.8)
      }
    }

    if (loadSeq !== currentNetworkLoadSeq || selectedNetworkId.value !== networkId) return

    // 4. 渲染边界虚线高亮
    if (map && selectedNetworkId.value === networkId && boundaryGeo) {
      if (xzqHighlightLayer) {
        map.removeLayer(xzqHighlightLayer)
      }
      xzqHighlightLayer = L.geoJSON(boundaryGeo, {
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
    }
  } catch (err) {
    console.error('[PGRB] 二进制图预加载失败:', err)
  }
}

const xzqListCache = new Map()

async function getXzqListByLevel(level) {
  if (xzqListCache.has(level)) {
    return xzqListCache.get(level)
  }
  try {
    const res = await fetch(`${routeApiBase}/xzq/list?level=${level}`).then(r => r.json())
    if (res.code === 200 && res.data && Array.isArray(res.data.list)) {
      xzqListCache.set(level, res.data.list)
      return res.data.list
    }
  } catch (e) {
    console.error(`加载 ${level} 行政区划列表失败:`, e)
  }
  return []
}

async function enrichNetworksWithFullName(rawList) {
  if (!Array.isArray(rawList)) return []

  const levelsNeeded = new Set()
  for (const net of rawList) {
    if (net.id && net.id.startsWith('xzq_')) {
      const parts = net.id.split('_')
      if (parts.length >= 3) {
        levelsNeeded.add(parts[1])
      }
    }
  }

  await Promise.all(Array.from(levelsNeeded).map(lvl => getXzqListByLevel(lvl)))

  return rawList.map(net => {
    if (net.name && (net.name.includes('市') || net.name.includes('州'))) {
      return { ...net }
    }

    if (net.id && net.id.startsWith('xzq_')) {
      const parts = net.id.split('_')
      if (parts.length >= 3) {
        const lvl = parts[1] // 'county' | 'town' | 'village'
        let featId = parts.slice(2).join('_')
        if (featId.endsWith('_3d')) {
          featId = featId.slice(0, -3)
        }
        const list = xzqListCache.get(lvl) || []

        const matchItem = list.find(item =>
          String(item.id) === String(featId) ||
          item.name === net.name ||
          (item.fields && Object.values(item.fields).some(v => v === net.name))
        )

        if (matchItem && matchItem.fields) {
          const full = Object.values(matchItem.fields).filter(v => v && typeof v === 'string' && v.trim() !== '').join('')
          if (full) {
            return { ...net, name: full }
          }
        }
      }
    } else if (net.id === 'shjd_road' && (!net.name || !net.name.includes('市'))) {
      return { ...net, name: '成都市成华区沙河街道' }
    }

    return { ...net }
  })
}

async function fetchRoadNetworks(targetSelectId = null, autoSwitchMap = true) {
  networksLoading.value = true
  try {
    const response = await fetch(`${routeApiBase}/networks?mode=3d`)
    const res = await response.json()
    if (res.code === 200 && Array.isArray(res.data) && res.data.length > 0) {
      // 专属于 3D 立体分层页面的过滤：仅展示 3d_road 模式下的立体路网
      const d3RawData = res.data.filter(net =>
        (net.roadTable && net.roadTable.includes('3d_road')) ||
        (net.id && (net.id.endsWith('_3d') || net.id.includes('3d_')))
      )
      if (d3RawData.length > 0) {
        const enrichedList = await enrichNetworksWithFullName(d3RawData)
        networksList.value = enrichedList
        editableNetworks.value = enrichedList.map(net => ({
          ...net,
          editingName: net.name || net.id
        }))

        if (!autoSwitchMap) {
          return
        }

        let targetNet = null
        if (targetSelectId) {
          targetNet = enrichedList.find(n => n.id === targetSelectId)
        } else if (selectedNetworkId.value) {
          targetNet = enrichedList.find(n => n.id === selectedNetworkId.value)
        }

        if (targetNet) {
          selectedLevelFilter.value = getNetworkLevel(targetNet)
          selectedNetworkId.value = targetNet.id
        } else {
          const currentMatch = enrichedList.filter(n => getNetworkLevel(n) === selectedLevelFilter.value)
          if (currentMatch.length > 0) {
            selectedNetworkId.value = currentMatch[0].id
          } else {
            const firstNet = enrichedList[0]
            selectedLevelFilter.value = getNetworkLevel(firstNet)
            selectedNetworkId.value = firstNet.id
          }
        }
        loadRoadNetworkRange(selectedNetworkId.value)
      } else {
        networksList.value = []
        editableNetworks.value = []
        if (autoSwitchMap) {
          selectedNetworkId.value = ''
          loadRoadNetworkRange(null)
        }
      }
    } else {
      networksList.value = []
      editableNetworks.value = []
      if (autoSwitchMap) {
        selectedNetworkId.value = ''
        loadRoadNetworkRange(null)
      }
    }
  } catch (err) {
    console.error('获取路网配置列表异常:', err)
    networksList.value = []
    editableNetworks.value = []
    if (autoSwitchMap) {
      selectedNetworkId.value = ''
      loadRoadNetworkRange(null)
    }
  } finally {
    networksLoading.value = false
  }
}

function onLevelFilterChange() {
  const currentFiltered = filteredNetworksList.value
  if (currentFiltered.length > 0) {
    const exists = currentFiltered.some(net => net.id === selectedNetworkId.value)
    if (!exists) {
      selectedNetworkId.value = currentFiltered[0].id
      loadRoadNetworkRange(selectedNetworkId.value)
    }
  } else {
    selectedNetworkId.value = ''
    loadRoadNetworkRange(null)
  }
}

function onNetworkChange() {
  loadRoadNetworkRange(selectedNetworkId.value)
}

function clearSingleRouteLayers() {
  if (map) {
    if (routeGlowLayer) { map.removeLayer(routeGlowLayer); routeGlowLayer = null }
    if (routeCoreLayer) { map.removeLayer(routeCoreLayer); routeCoreLayer = null }
    if (startDashLayer) { map.removeLayer(startDashLayer); startDashLayer = null }
    if (endDashLayer) { map.removeLayer(endDashLayer); endDashLayer = null }
    if (routeArrowLayer) { map.removeLayer(routeArrowLayer); routeArrowLayer = null }
  }
  currentRouteCoords = null
}

function clearMultiRoutes() {
  if (multiRouteLayers && multiRouteLayers.length > 0) {
    multiRouteLayers.forEach(r => {
      if (r.glowLayer && map && map.hasLayer(r.glowLayer)) map.removeLayer(r.glowLayer)
      if (r.coreLayer && map && map.hasLayer(r.coreLayer)) map.removeLayer(r.coreLayer)
      if (Array.isArray(r.dashLayers)) {
        r.dashLayers.forEach(d => {
          if (d && map && map.hasLayer(d)) map.removeLayer(d)
        })
      }
    })
    multiRouteLayers = []
  }
  multiRouteListItems.value = []
  selectedRouteIdx.value = null
}

function renderRouteResult(res, engineType = '') {
  isPlanning.value = false
  clearMultiRoutes()

  if (res.code === 200 && res.data && res.data.geometry) {
    resStatusColor.value = '#10b981'
    resStatus.value = engineType ? `计算成功 (${engineType})` : '计算成功'
    resDistance.value = `${(res.data.totalDistance / 1000).toFixed(2)} km`
    resNodes.value = `${res.data.startNode || '-'} -> ${res.data.endNode || '-'}`

    clearSingleRouteLayers()

    const geojson = res.data.geometry
    currentRouteCoords = (geojson.type === 'FeatureCollection' && geojson.features && geojson.features[0])
      ? geojson.features[0].geometry.coordinates
      : (geojson.geometry ? geojson.geometry.coordinates : geojson.coordinates)

    // 1. 底层霓虹发光光晕层
    routeGlowLayer = L.geoJSON(geojson, {
      style: {
        color: '#f43f5e',
        weight: 12,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round'
      }
    }).addTo(map)

    // 2. 顶层高亮发光核心流光层
    routeCoreLayer = L.geoJSON(geojson, {
      style: {
        color: '#fb7185',
        weight: 6,
        opacity: 1.0,
        lineCap: 'round',
        lineJoin: 'round'
      }
    }).addTo(map)

    // 3. 绘制起止点引线
    if (currentRouteCoords && currentRouteCoords.length > 0) {
      const firstCoord = currentRouteCoords[0]
      const lastCoord = currentRouteCoords[currentRouteCoords.length - 1]

      const sLngVal = parseFloat(startLng.value)
      const sLatVal = parseFloat(startLat.value)
      const eLngVal = parseFloat(endLng.value)
      const eLatVal = parseFloat(endLat.value)

      if (!isNaN(sLngVal) && !isNaN(sLatVal)) {
        startDashLayer = L.polyline(
          [[sLatVal, sLngVal], [firstCoord[1], firstCoord[0]]],
          { color: '#10b981', weight: 2.5, dashArray: '4, 6', opacity: 0.85 }
        ).addTo(map)
      }

      if (!isNaN(eLngVal) && !isNaN(eLatVal)) {
        endDashLayer = L.polyline(
          [[eLatVal, eLngVal], [lastCoord[1], lastCoord[0]]],
          { color: '#ef4444', weight: 2.5, dashArray: '4, 6', opacity: 0.85 }
        ).addTo(map)
      }

      // 4. 沿路网绘制方向箭头
      renderRouteArrows(currentRouteCoords, map)

      // 5. 聚焦到规划路径范围
      const allPoints = [[sLatVal, sLngVal], [eLatVal, eLngVal], ...currentRouteCoords.map(c => [c[1], c[0]])]
      const validPoints = allPoints.filter(p => !isNaN(p[0]) && !isNaN(p[1]))
      if (validPoints.length > 0) {
        map.fitBounds(L.latLngBounds(validPoints), { padding: [60, 60] })
      }
    }
    updateRouteVisibility()
  } else {
    resStatusColor.value = '#ef4444'
    resStatus.value = `计算失败: ${res.msg || '无连通路径'}`
    resDistance.value = '-- km'
    resNodes.value = '-- -> --'
  }
}

function renderMultiRoutesResult(routes, calcCostStr, paradigm) {
  isPlanning.value = false
  clearSingleRouteLayers()
  clearMultiRoutes()

  if (!Array.isArray(routes) || routes.length === 0) {
    resStatusColor.value = '#ef4444'
    resStatus.value = '未找到有效连通路径'
    return
  }

  resStatusColor.value = '#10b981'
  resStatus.value = calcCostStr ? `规划成功 (${calcCostStr})` : '规划成功'

  resMultiCount.value = `${routes.length} 条有效路径`

  let minDist = Infinity
  let maxDist = -Infinity
  let allLatLngs = []
  const listItems = []

  routes.forEach((rt, idx) => {
    const color = rt.color || ROUTE_PALETTE[idx % ROUTE_PALETTE.length]
    const label = rt.label || (paradigm === '1_to_n' ? `D${idx + 1}` : `S${idx + 1}`)
    const distKm = (rt.totalDistance / 1000).toFixed(2)
    if (rt.totalDistance < minDist) minDist = rt.totalDistance
    if (rt.totalDistance > maxDist) maxDist = rt.totalDistance

    const geojson = rt.geometry
    const coords = (geojson.type === 'FeatureCollection' && geojson.features && geojson.features[0])
      ? geojson.features[0].geometry.coordinates
      : (geojson.geometry ? geojson.geometry.coordinates : (geojson.coordinates || []))

    // 1. 发光外轮廓
    const glow = L.geoJSON(geojson, {
      style: { color: color, weight: 10, opacity: 0.35, lineCap: 'round', lineJoin: 'round' }
    }).addTo(map)

    // 2. 核心流光层
    const core = L.geoJSON(geojson, {
      style: { color: color, weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }
    }).addTo(map)

    const tooltipText = paradigm === '1_to_n'
      ? `中心起点 ➔ 终点 ${label}: ${distKm} km`
      : `起点 ${label} ➔ 汇聚终点: ${distKm} km`
    core.bindTooltip(tooltipText, { sticky: true })

    // 绘制起终点虚线引线
    const dashLayers = []
    if (coords && coords.length > 0) {
      const firstCoord = [coords[0][1], coords[0][0]]
      const lastCoord = [coords[coords.length - 1][1], coords[coords.length - 1][0]]

      if (paradigm === '1_to_n') {
        const sLngVal = parseFloat(startLng.value)
        const sLatVal = parseFloat(startLat.value)
        if (!isNaN(sLngVal) && !isNaN(sLatVal)) {
          allLatLngs.push([sLatVal, sLngVal])
          const sDash = L.polyline([[sLatVal, sLngVal], firstCoord], { color: '#10b981', weight: 2.5, dashArray: '4, 6', opacity: 0.85 }).addTo(map)
          dashLayers.push(sDash)
        }
        if (rt.destPoint && !isNaN(rt.destPoint.lat) && !isNaN(rt.destPoint.lng)) {
          allLatLngs.push([rt.destPoint.lat, rt.destPoint.lng])
          const dDash = L.polyline([[rt.destPoint.lat, rt.destPoint.lng], lastCoord], { color: color, weight: 2.5, dashArray: '4, 6', opacity: 0.85 }).addTo(map)
          dashLayers.push(dDash)
        }
      } else if (paradigm === 'n_to_1') {
        const eLngVal = parseFloat(endLng.value)
        const eLatVal = parseFloat(endLat.value)
        if (rt.origPoint && !isNaN(rt.origPoint.lat) && !isNaN(rt.origPoint.lng)) {
          allLatLngs.push([rt.origPoint.lat, rt.origPoint.lng])
          const oDash = L.polyline([[rt.origPoint.lat, rt.origPoint.lng], firstCoord], { color: color, weight: 2.5, dashArray: '4, 6', opacity: 0.85 }).addTo(map)
          dashLayers.push(oDash)
        }
        if (!isNaN(eLngVal) && !isNaN(eLatVal)) {
          allLatLngs.push([eLatVal, eLngVal])
          const eDash = L.polyline([lastCoord, [eLatVal, eLngVal]], { color: '#ef4444', weight: 2.5, dashArray: '4, 6', opacity: 0.85 }).addTo(map)
          dashLayers.push(eDash)
        }
      }
    }

    coords.forEach(c => allLatLngs.push([c[1], c[0]]))
    multiRouteLayers.push({ id: idx, glowLayer: glow, coreLayer: core, dashLayers: dashLayers, coords: coords, totalDistance: rt.totalDistance })

    listItems.push({
      id: idx,
      label,
      color,
      distKm,
      nodeCount: rt.path ? rt.path.length : '-'
    })
  })

  const minKm = (minDist / 1000).toFixed(2)
  const maxKm = (maxDist / 1000).toFixed(2)
  resMultiExtremes.value = `${minKm} km / ${maxKm} km`
  multiRouteListItems.value = listItems

  if (allLatLngs.length > 0) {
    map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50] })
  }
  updateRouteVisibility()
}

function focusRoute(idx) {
  selectedRouteIdx.value = idx
  multiRouteLayers.forEach((r, i) => {
    if (i === idx) {
      r.glowLayer.setStyle({ weight: 16, opacity: 0.8 })
      r.coreLayer.setStyle({ weight: 7, opacity: 1.0 })
      if (r.coords && r.coords.length > 0) {
        const bounds = L.latLngBounds(r.coords.map(c => [c[1], c[0]]))
        map.fitBounds(bounds, { padding: [60, 60] })
      }
    } else {
      r.glowLayer.setStyle({ weight: 6, opacity: 0.2 })
      r.coreLayer.setStyle({ weight: 3, opacity: 0.4 })
    }
  })
}

async function planRoute() {
  resetPickingMode()
  stopContinuousPicking()

  const isDirected = true
  const router = pgrbRouterInstance

  if (!router || !router.isLoaded) {
    alert('路网二进制图尚未加载完成，请稍候再试！')
    return
  }

  // ========================================================
  // 规划范式 1: 1 对 N (单起点 -> 多终点)
  // ========================================================
  if (currentParadigm.value === '1_to_n') {
    const sLng = parseFloat(startLng.value)
    const sLat = parseFloat(startLat.value)

    if (isNaN(sLng) || isNaN(sLat)) {
      alert('请先在地图上选定或输入有效的中心起点坐标！')
      return
    }

    if (!isPointInCurrentBoundary(sLng, sLat)) {
      showBoundaryWarningPopup([sLat, sLng], '起点坐标超出路网边界范围')
      return
    }

    if (!multiDestPoints.value || multiDestPoints.value.length === 0) {
      alert('请点击“➕ 在地图上连续选终点”，至少添加 1 个目标终点！')
      return
    }

    for (let i = 0; i < multiDestPoints.value.length; i++) {
      const d = multiDestPoints.value[i]
      if (!isPointInCurrentBoundary(d.lng, d.lat)) {
        alert(`⚠️ 终点 D${i + 1} (${d.lng.toFixed(4)}, ${d.lat.toFixed(4)}) 超出当前路网边界范围，请删除或修改！`)
        isPlanning.value = false
        showResultCard.value = false
        return
      }
    }

    clearSingleRouteLayers()
    clearMultiRoutes()

    showResultCard.value = true
    resStatusColor.value = '#38bdf8'
    resStatus.value = '1对N 多目标规划中...'
    isPlanning.value = true

    const t0 = performance.now()
    const routes = []
    for (let i = 0; i < multiDestPoints.value.length; i++) {
      const d = multiDestPoints.value[i]
      const planRes = router.planRouteWithSnap(sLng, sLat, d.lng, d.lat, isDirected)
      if (planRes && planRes.path && planRes.path.length > 0) {
        const geojson = router.getPathGeoJSONWithSnap(planRes.path, planRes.startSnap, planRes.endSnap, isDirected)
        routes.push({
          destId: d.id,
          destIdx: i,
          destPoint: d,
          color: d.color,
          label: `D${i + 1}`,
          totalDistance: planRes.distance,
          startNode: router.getOriginalNodeId(planRes.path[0]),
          endNode: router.getOriginalNodeId(planRes.path[planRes.path.length - 1]),
          geometry: geojson,
          path: planRes.path
        })
      }
    }
    const t1 = performance.now()
    const calcCostMs = (t1 - t0).toFixed(1)
    renderMultiRoutesResult(routes, `${calcCostMs} ms CPU A* ⚡`, '1_to_n')
    return
  }

  // ========================================================
  // 规划范式 2: N 对 1 (多起点 -> 单终点)
  // ========================================================
  if (currentParadigm.value === 'n_to_1') {
    const eLng = parseFloat(endLng.value)
    const eLat = parseFloat(endLat.value)

    if (isNaN(eLng) || isNaN(eLat)) {
      alert('请先在地图上选定或输入有效的目标终点坐标！')
      return
    }

    if (!isPointInCurrentBoundary(eLng, eLat)) {
      showBoundaryWarningPopup([eLat, eLng], '终点坐标超出路网边界范围')
      return
    }

    if (!multiOrigPoints.value || multiOrigPoints.value.length === 0) {
      alert('请点击“➕ 在地图上连续选起点”，至少添加 1 个起点！')
      return
    }

    for (let i = 0; i < multiOrigPoints.value.length; i++) {
      const o = multiOrigPoints.value[i]
      if (!isPointInCurrentBoundary(o.lng, o.lat)) {
        alert(`⚠️ 起点 S${i + 1} (${o.lng.toFixed(4)}, ${o.lat.toFixed(4)}) 超出当前路网边界范围，请删除或修改！`)
        isPlanning.value = false
        showResultCard.value = false
        return
      }
    }

    clearSingleRouteLayers()
    clearMultiRoutes()

    showResultCard.value = true
    resStatusColor.value = '#38bdf8'
    resStatus.value = 'N对1 多起点汇聚中...'
    isPlanning.value = true

    const t0 = performance.now()
    const routes = []
    for (let i = 0; i < multiOrigPoints.value.length; i++) {
      const o = multiOrigPoints.value[i]
      const planRes = router.planRouteWithSnap(o.lng, o.lat, eLng, eLat, isDirected)
      if (planRes && planRes.path && planRes.path.length > 0) {
        const geojson = router.getPathGeoJSONWithSnap(planRes.path, planRes.startSnap, planRes.endSnap, isDirected)
        routes.push({
          origId: o.id,
          origIdx: i,
          origPoint: o,
          color: o.color,
          label: `S${i + 1}`,
          totalDistance: planRes.distance,
          startNode: router.getOriginalNodeId(planRes.path[0]),
          endNode: router.getOriginalNodeId(planRes.path[planRes.path.length - 1]),
          geometry: geojson,
          path: planRes.path
        })
      }
    }
    const t1 = performance.now()
    const calcCostMs = (t1 - t0).toFixed(1)
    renderMultiRoutesResult(routes, `${calcCostMs} ms CPU A* ⚡`, 'n_to_1')
    return
  }

  // ========================================================
  // 规划范式 3: 经典 1 对 1 (单起点 -> 单终点)
  // ========================================================
  const sLng = parseFloat(startLng.value)
  const sLat = parseFloat(startLat.value)
  const eLng = parseFloat(endLng.value)
  const eLat = parseFloat(endLat.value)

  if (isNaN(sLng) || isNaN(sLat) || isNaN(eLng) || isNaN(eLat)) {
    alert('请先在地图上点击选点或输入有效的起点与终点经纬度坐标！')
    return
  }

  if (!isPointInCurrentBoundary(sLng, sLat)) {
    showBoundaryWarningPopup([sLat, sLng], '起点坐标超出边界范围')
    return
  }

  if (!isPointInCurrentBoundary(eLng, eLat)) {
    showBoundaryWarningPopup([eLat, eLng], '终点坐标超出边界范围')
    return
  }

  clearSingleRouteLayers()
  clearMultiRoutes()

  showResultCard.value = true
  resStatusColor.value = '#38bdf8'
  resStatus.value = '计算中...'
  resDistance.value = '-- km'
  resNodes.value = '-- -> --'
  isPlanning.value = true

  const t0 = performance.now()
  const planRes = router.planRouteWithSnap(sLng, sLat, eLng, eLat, isDirected)
  const t1 = performance.now()
  const calcCostMs = (t1 - t0).toFixed(1)

  if (planRes && planRes.path && planRes.path.length > 0) {
    const geojson = router.getPathGeoJSONWithSnap(planRes.path, planRes.startSnap, planRes.endSnap, isDirected)
    renderRouteResult({
      code: 200,
      data: {
        totalDistance: planRes.distance,
        startNode: router.getOriginalNodeId(planRes.path[0]),
        endNode: router.getOriginalNodeId(planRes.path[planRes.path.length - 1]),
        geometry: geojson
      }
    }, `${calcCostMs} ms CPU ⚡`)
  } else {
    isPlanning.value = false
    resStatusColor.value = '#ef4444'
    resStatus.value = '起点与终点之间未找到连通路径 (CPU A* 算路)'
  }
}

function resetRoute() {
  resetPickingMode()
  stopContinuousPicking()
  startLng.value = ''
  startLat.value = ''
  endLng.value = ''
  endLat.value = ''
  updateMarkers()
  clearDestPoints()
  clearOrigPoints()
  clearSingleRouteLayers()
  clearMultiRoutes()

  showResultCard.value = false
  resStatus.value = '已重置'
  resStatusColor.value = '#38bdf8'
}

function openManageModal() {
  editableNetworks.value = networksList.value.map(net => ({
    ...net,
    editingName: net.name || net.id
  }))
  manageLevelFilter.value = selectedLevelFilter.value || 'county'
  showManageModal.value = true
}

function openXzqFromManage() {
  showManageModal.value = false
  xzqMsg.show = false
  selectedXzqItem.value = null
  xzqSearchKeyword.value = ''
  showXzqModal.value = true
  initXzqLevels()
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
      if (PGRBRouter && typeof PGRBRouter.clearCache === 'function') {
        try { await PGRBRouter.clearCache(net.id) } catch (e) { }
      }
      alert(`✅ ${res.msg || '删除成功！'}`)
      fetchRoadNetworks()
    } else {
      alert(`❌ 删除失败: ${res.msg}`)
    }
  } catch (err) {
    alert(`❌ 请求异常: ${err.message}`)
  }
}

async function initXzqLevels() {
  try {
    const res = await fetch(`${routeApiBase}/xzq/levels`).then(r => r.json())
    if (res.code === 200 && Array.isArray(res.data) && res.data.length > 0) {
      xzqLevels.value = res.data
      currentLevel.value = res.data[0].key
      loadXzqList(currentLevel.value)
    }
  } catch (err) {
    console.error('Fetch XZQ levels error:', err)
  }
}

async function switchXzqLevel(levelKey) {
  currentLevel.value = levelKey
  xzqSearchKeyword.value = ''
  selectedXzqItem.value = null
  loadXzqList(levelKey)
}

async function loadXzqList(level, isAppend = false) {
  if (!isAppend) {
    xzqPage.value = 1
    xzqList.value = []
    xzqListLoading.value = true
  } else {
    isXzqLoadingMore.value = true
  }

  try {
    const kw = encodeURIComponent(xzqSearchKeyword.value || '')
    const url = `${routeApiBase}/xzq/list?level=${level}&page=${xzqPage.value}&pageSize=${xzqPageSize.value}&keyword=${kw}`
    const res = await fetch(url).then(r => r.json())

    if (res.code === 200 && res.data) {
      xzqFields.value = res.data.fields || []
      const rawList = res.data.list || []
      xzqTotal.value = res.data.total || 0

      const existingIdSet = getExistingXzqIdSet(level)
      const existingNameSet = getExistingXzqNameSet(level)

      const deduplicatedList = rawList.filter(item => {
        const itemId = String(item.id || '').trim().toLowerCase()
        if (itemId && existingIdSet.has(itemId)) return false

        const fullName = getXzqItemFullName(item)
        if (fullName && existingNameSet.has(fullName.trim().toLowerCase())) return false
        if (item.name && existingNameSet.has(item.name.trim().toLowerCase())) return false

        return true
      })

      if (isAppend) {
        xzqList.value = [...xzqList.value, ...deduplicatedList]
      } else {
        xzqList.value = deduplicatedList
      }
      xzqHasMore.value = xzqList.value.length < xzqTotal.value
    }
  } catch (err) {
    console.error('Fetch XZQ list error:', err)
  } finally {
    xzqListLoading.value = false
    isXzqLoadingMore.value = false
  }
}

async function onSelectXzqItem(item) {
  selectedXzqItem.value = item
  if (xzqHighlightLayer && map) {
    map.removeLayer(xzqHighlightLayer)
    xzqHighlightLayer = null
  }

  try {
    const res = await fetch(`${routeApiBase}/xzq/detail?level=${currentLevel.value}&featureId=${item.id}`).then(r => r.json())
    if (res.code === 200 && res.data && map) {
      const detail = res.data
      const geoData = detail.geojson ? (typeof detail.geojson === 'string' ? JSON.parse(detail.geojson) : detail.geojson) : null

      if (detail.bbox && Array.isArray(detail.bbox) && detail.bbox.length === 4) {
        const bounds = L.latLngBounds(
          [detail.bbox[1], detail.bbox[0]],
          [detail.bbox[3], detail.bbox[2]]
        )
        await flyMapToBounds(bounds, { padding: [50, 50], duration: 0.8 })
      }

      if (map && geoData && selectedXzqItem.value && selectedXzqItem.value.id === item.id) {
        if (xzqHighlightLayer) map.removeLayer(xzqHighlightLayer)
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
      }
    }
  } catch (err) {
    console.error('Fetch detail error:', err)
  }
}

async function pollCheckNetworkBuilt(targetNetId, maxAttempts = 16, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs))
    try {
      const resp = await fetch(`${routeApiBase}/networks?mode=3d`)
      if (resp.ok) {
        const data = await resp.json()
        if (data.code === 200 && Array.isArray(data.data)) {
          const found = data.data.some(n => n.id === targetNetId)
          if (found) return true
        }
      }
    } catch (e) { }
  }
  return false
}

async function submitXzqBuild() {
  if (!selectedXzqItem.value) {
    alert('请先在列表中点击选中具体的要素！')
    return
  }
  const netId = `xzq_${currentLevel.value}_${selectedXzqItem.value.id}_3d`
  const netName = (getXzqItemFullName(selectedXzqItem.value) || selectedXzqItem.value.name || selectedXzqItem.value.id) + ' (3D立体分层)'

  const alreadyExists = networksList.value.some(net => net.id === netId || (getNetworkLevel(net) === currentLevel.value && net.name === netName))
  if (alreadyExists) {
    alert(`⚠️ 该行政区【${netName}】已在数据库中构建为路网，请勿重复构建！`)
    return
  }

  xzqMsg.show = true
  xzqMsg.color = '#38bdf8'
  xzqMsg.text = `⏳ 正基于【${netName}】提取 OSM 路网要素并构建 3D 立体分层拓扑（Layer-Aware Noding），请稍候...`
  isXzqBuilding.value = true

  const formData = new URLSearchParams()
  formData.append('level', currentLevel.value)
  formData.append('featureId', selectedXzqItem.value.id)
  formData.append('networkId', netId)
  formData.append('networkName', netName)

  try {
    const response = await fetch(`${routeApiBase}/xzq/build-with-level`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: formData
    })

    const contentType = response.headers.get('content-type') || ''
    let res = null

    if (contentType.includes('application/json')) {
      res = await response.json()
    } else {
      const rawText = await response.text()
      if (response.status === 504 || rawText.includes('504') || rawText.includes('Gateway Time-out')) {
        xzqMsg.color = '#f59e0b'
        xzqMsg.text = '⚠️ 请求等待超时（504）：市级3D路网数据量庞大，后台仍在继续构建中！正在自动轮询检测构建结果...'
        const builtSuccess = await pollCheckNetworkBuilt(netId, 16, 5000)
        if (builtSuccess) {
          isXzqBuilding.value = false
          if (PGRBRouter && typeof PGRBRouter.clearCache === 'function') {
            try { await PGRBRouter.clearCache(netId) } catch (e) { }
          }
          xzqMsg.color = '#10b981'
          xzqMsg.text = `✅【${netName}】市级3D路网后台构建完成！已自动同步。`
          setTimeout(() => {
            showXzqModal.value = false
            fetchRoadNetworks(netId)
          }, 1500)
          return
        } else {
          throw new Error('市级3D立体路网构建耗时较长，已转入后台继续处理。稍候在路网列表中刷新即可查看。')
        }
      } else if (response.status === 502) {
        throw new Error('网关错误 (502 Bad Gateway)，后端服务不可用或正在重启')
      } else {
        throw new Error(`服务端响应异常 (HTTP ${response.status})`)
      }
    }

    isXzqBuilding.value = false
    if (res && res.code === 200) {
      if (PGRBRouter && typeof PGRBRouter.clearCache === 'function') {
        try { await PGRBRouter.clearCache(netId) } catch (e) { }
      }
      xzqMsg.color = '#10b981'
      xzqMsg.text = '✅ ' + (res.data ? res.data.msg : '路网相交构建成功！')
      setTimeout(() => {
        showXzqModal.value = false
        fetchRoadNetworks(netId)
      }, 1500)
    } else {
      xzqMsg.color = '#ef4444'
      xzqMsg.text = '❌ ' + ((res && res.msg) || '构建失败')
    }
  } catch (err) {
    isXzqBuilding.value = false
    xzqMsg.color = '#ef4444'
    xzqMsg.text = `❌ 请求异常: ${err.message}`
    console.error('Build Error:', err)
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
    preferCanvas: false
  })

  // 1. 天地图底图
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

  // 2. WMTS 背景瓦片
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
  top: 16px;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  width: 350px;
  max-height: calc(100vh - 32px);
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  padding: 0;
  color: #f8fafc;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.route-panel-header {
  padding: 14px 16px 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.92);
  flex-shrink: 0;
}

.route-panel-header .panel-header {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.route-panel-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.route-panel-body::-webkit-scrollbar {
  width: 5px;
}

.route-panel-body::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.4);
}

.route-panel-body::-webkit-scrollbar-thumb {
  background: rgba(56, 189, 248, 0.28);
  border-radius: 10px;
}

.route-panel-body::-webkit-scrollbar-thumb:hover {
  background: rgba(56, 189, 248, 0.55);
}

.route-panel-footer {
  padding: 10px 16px 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.98);
  flex-shrink: 0;
  box-shadow: 0 -6px 16px rgba(0, 0, 0, 0.4);
}

.mode-badge {
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 9999px;
  font-weight: 600;
  letter-spacing: 0.3px;
  transition: all 0.25s ease;
}

.mode-badge.badge-3d {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
}

.mode-badge.badge-1ton {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.mode-badge.badge-nto1 {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
  color: #38bdf8;
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-group {
  margin-bottom: 4px;
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

/* 寻路范式切换 (1:1 / 1:N / N:1) */
.paradigm-selector-group {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  background: rgba(15, 23, 42, 0.75);
  padding: 4px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin: 4px 0 6px 0;
}

.paradigm-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  font-size: 11.5px;
  color: #94a3b8;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
  border: 1px solid transparent;
  user-select: none;
  text-align: center;
}

.paradigm-item:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.05);
}

.paradigm-item.active {
  color: #38bdf8;
  background: rgba(14, 165, 233, 0.18);
  border-color: rgba(56, 189, 248, 0.4);
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* 多点动态列表卡片 */
.multi-points-card {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 6px 8px;
  margin-top: 6px;
  max-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.multi-points-card::-webkit-scrollbar {
  width: 4px;
}

.multi-points-card::-webkit-scrollbar-thumb {
  background: rgba(56, 189, 248, 0.25);
  border-radius: 6px;
}

.multi-point-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11.5px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.point-tag-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  color: #ffffff;
  min-width: 24px;
}

.point-coords-text {
  color: #cbd5e1;
  font-family: 'Courier New', monospace;
  font-size: 11px;
}

.btn-del-point {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 14px;
  padding: 1px 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
  line-height: 1;
}

.btn-del-point:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}

.multi-action-bar {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.btn-multi-pick {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 8px;
  font-size: 11.5px;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 6px;
  color: #38bdf8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-multi-pick.active {
  background: #38bdf8;
  color: #0f172a;
  font-weight: 700;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
  animation: pulsePicking 1.5s infinite;
}

@keyframes pulsePicking {

  0%,
  100% {
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
  }

  50% {
    box-shadow: 0 0 18px rgba(56, 189, 248, 0.9);
  }
}

.btn-multi-clear {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #f87171;
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-multi-clear:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #ffffff;
}

/* 多路线结果卡片列表 */
.multi-route-card-list {
  margin-top: 6px;
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.multi-route-card-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.18s ease;
}

.multi-route-card-item:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  transform: translateX(2px);
}

.multi-route-card-item.selected {
  border-color: #38bdf8;
  background: rgba(14, 165, 233, 0.22);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.35);
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

/* 行政级别单选圆点样式 */
.level-radio-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 8px 0;
  padding: 4px 6px;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}

.level-radio-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: #94a3b8;
  transition: all 0.2s ease;
}

.level-radio-item:hover {
  color: #e2e8f0;
}

.level-radio-item.active {
  color: #38bdf8;
  font-weight: 600;
}

.level-radio-item input[type="radio"] {
  display: none;
}

.radio-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  background: rgba(15, 23, 42, 0.85);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.level-radio-item:hover .radio-dot {
  border-color: rgba(56, 189, 248, 0.7);
}

.level-radio-item.active .radio-dot {
  border-color: #38bdf8;
  background: rgba(14, 165, 233, 0.15);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.5);
}

.level-radio-item.active .radio-dot::after {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #38bdf8;
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
  margin: 4px 0;
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
  margin-top: 0;
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
  margin-top: 6px;
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

/* 行政区划相交 Modal 特有样式 */
.manage-level-radio {
  margin: 10px 0 14px 0;
  padding: 6px 12px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  justify-content: flex-start;
  gap: 20px;
}

.existing-filter-tip {
  margin-top: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.4;
}

.xzq-level-container {
  display: flex;
  gap: 10px;
}

.xzq-lvl-btn {
  flex: 1;
  padding: 6px;
}

.loading-hint {
  font-size: 12px;
  color: #38bdf8;
  padding: 4px;
}

.scroll-more-hint {
  text-align: center;
  font-size: 11.5px;
  color: #38bdf8;
  padding: 8px;
  background: rgba(56, 189, 248, 0.08);
  border-top: 1px dashed rgba(56, 189, 248, 0.25);
  user-select: none;
}

.scroll-more-hint.end-hint {
  color: #64748b;
  background: transparent;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.xzq-list-wrapper {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.6);
  margin-top: 8px;
}

.loading-state {
  padding: 16px;
  text-align: center;
  color: #38bdf8;
  font-size: 12px;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
}

.xzq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.xzq-table thead {
  position: sticky;
  top: 0;
  background: #1e293b;
  z-index: 2;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.xzq-table th {
  padding: 8px 10px;
  text-align: left;
  color: #38bdf8;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;
}

.xzq-table td {
  padding: 8px 10px;
  color: #e2e8f0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  white-space: nowrap;
}

.xzq-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.xzq-table tbody tr:hover {
  background: rgba(56, 189, 248, 0.12);
}

.selected-summary-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 6px;
  font-size: 12px;
}

.summary-label {
  color: #94a3b8;
  white-space: nowrap;
}

.summary-value {
  color: #38bdf8;
  font-weight: 700;
}

.xzq-table tbody tr.selected {
  background: rgba(2, 132, 199, 0.35);
  border-left: 3px solid #38bdf8;
}

.upload-msg {
  margin-top: 10px;
  font-size: 12px;
}
</style>

<style>
/* 全局覆盖 Leaflet 标注和 Popup 样式 */
.pin-start {
  width: 20px;
  height: 20px;
  background: #10b981;
  border: 3px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 14px rgba(16, 185, 129, 0.9);
}

.pin-end {
  width: 20px;
  height: 20px;
  background: #ef4444;
  border: 3px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.9);
}

.leaflet-popup.boundary-warning-popup {
  margin-bottom: 6px;
}

.leaflet-popup.boundary-warning-popup .leaflet-popup-content-wrapper {
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(248, 113, 113, 0.4);
  box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.35), 0 8px 12px -6px rgba(0, 0, 0, 0.6);
  border-radius: 30px;
  padding: 0;
  overflow: hidden;
}

.leaflet-popup.boundary-warning-popup .leaflet-popup-content {
  margin: 6px 14px 6px 10px;
  line-height: 1.4;
}

.leaflet-popup.boundary-warning-popup .leaflet-popup-tip-container {
  width: 18px;
  height: 10px;
  margin-left: -9px;
  overflow: visible;
}

.leaflet-popup.boundary-warning-popup .leaflet-popup-tip {
  background: rgba(15, 23, 42, 0.92);
  border-right: 1px solid rgba(248, 113, 113, 0.4);
  border-bottom: 1px solid rgba(248, 113, 113, 0.4);
  box-shadow: none;
  width: 8px;
  height: 8px;
  padding: 0;
  margin: -4px auto 0;
  transform: rotate(45deg);
}
</style>
