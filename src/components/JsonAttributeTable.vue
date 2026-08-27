<template>
  <Teleport to="body">
    <div 
      v-if="visible" 
      ref="dialogRef"
      class="json-table-modal" 
      :class="[theme, { isMaximized, isMoving: dragging || resizing }]"
      :style="modalStyle"
    >
      <!-- 拖拽 Header 头部 -->
      <div class="modal-header" @mousedown="startDrag">
        <div class="modal-title">
          <span class="icon">📋</span>
          <span class="title-text">{{ layer?.name || 'JSON 图层' }} - 属性表</span>
          <span class="count-badge" v-if="features.length > 0">
            ({{ filteredFeatures.length }} / {{ features.length }} 条记录)
          </span>
        </div>

        <div class="modal-actions" @mousedown.stop>
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="🔍 搜索属性..." 
            class="search-input"
          />
          <button class="action-btn" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'">
            {{ isMaximized ? '❐' : '□' }}
          </button>
          <button class="action-btn close-btn" @click="handleClose" title="关闭">×</button>
        </div>
      </div>

      <!-- 表格主体 -->
      <div class="modal-body">
        <div v-if="columns.length === 0 && features.length > 0" class="no-props-banner">
          💡 提示：该 JSON 数据中仅包含几何图形坐标，未包含额外的属性属性字段。
        </div>

        <div v-if="features.length === 0" class="empty-tip">
          该图层暂无属性表数据
        </div>
        <div v-else class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-num">#</th>
                <th v-for="col in effectiveColumns" :key="col" class="col-header">
                  <div class="header-cell-content">
                    <span class="col-title" :title="col">{{ col }}</span>
                    <button 
                      v-if="columns.length > 0"
                      class="label-toggle-btn"
                      :class="{ active: activeLabelField === col }"
                      @click.stop="toggleFieldLabel(col)"
                      :title="activeLabelField === col ? '关闭地图文字标注' : `在地图上生成 [${col}] 字段标注`"
                    >
                      🏷️
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="(row, idx) in paginatedDisplayRows" 
                :key="idx" 
                class="table-row"
                @click="handleRowClick(row.rawFeature)"
              >
                <td class="col-num">{{ (currentPage - 1) * pageSize + idx + 1 }}</td>
                <td v-for="col in effectiveColumns" :key="col" class="col-cell" :title="row.props[col]">
                  {{ (row.props[col] !== undefined && row.props[col] !== null) ? row.props[col] : '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 分页与 Footer -->
      <div class="modal-footer">
        <div class="pagination">
          <button :disabled="currentPage === 1" @click="currentPage--" class="page-btn">上一页</button>
          <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
          <button :disabled="currentPage >= totalPages" @click="currentPage++" class="page-btn">下一页</button>
          <select v-model="pageSize" class="page-select">
            <option :value="10">10 条/页</option>
            <option :value="20">20 条/页</option>
            <option :value="50">50 条/页</option>
            <option :value="100">100 条/页</option>
          </select>
        </div>
      </div>

      <!-- 拖拽缩放 Handle (右下角 resize) -->
      <div class="resize-handle" @mousedown.stop.prevent="startResize" title="按住拖拽缩放"></div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  layer: {
    type: Object,
    default: () => null
  },
  theme: {
    type: String,
    default: 'light' // 'light' | 'dark'
  }
})

const emit = defineEmits(['update:visible', 'close', 'focus-feature', 'toggle-label-field'])

const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const isMaximized = ref(false)
const activeLabelField = ref(null)

const toggleFieldLabel = (col) => {
  if (activeLabelField.value === col) {
    activeLabelField.value = null
    emit('toggle-label-field', { layer: props.layer, field: null })
  } else {
    activeLabelField.value = col
    emit('toggle-label-field', { layer: props.layer, field: col })
  }
}

// 模态框位置与尺寸初始设定
const pos = reactive({
  x: Math.max(50, (window.innerWidth - 720) / 2),
  y: Math.max(50, (window.innerHeight - 460) / 2),
  width: 720,
  height: 460
})

const modalStyle = computed(() => {
  if (isMaximized.value) {
    return {
      top: '10px',
      left: '10px',
      width: 'calc(100vw - 20px)',
      height: 'calc(100vh - 20px)',
      transform: 'none'
    }
  }
  return {
    top: '0px',
    left: '0px',
    transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
    width: `${pos.width}px`,
    height: `${pos.height}px`
  }
})

// 提取 features 与 columns
const features = computed(() => {
  if (!props.layer || !props.layer.geojson || !props.layer.geojson.features) return []
  return props.layer.geojson.features
})

const columns = computed(() => {
  if (features.value.length === 0) return []
  const keysSet = new Set()
  features.value.forEach(f => {
    if (f.properties) {
      Object.keys(f.properties).forEach(k => keysSet.add(k))
    }
  })
  return Array.from(keysSet)
})

const effectiveColumns = computed(() => {
  if (columns.value.length > 0) {
    return columns.value
  }
  return ['要素类型 (Type)', '节点数 (Vertices)', '数据提示 (Note)']
})

function getVertexCount(geometry) {
  if (!geometry || !geometry.coordinates) return 0
  let count = 0
  function countPoints(coords) {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      count++
    } else if (Array.isArray(coords)) {
      coords.forEach(countPoints)
    }
  }
  countPoints(geometry.coordinates)
  return count
}

// 模糊搜索过滤
const filteredFeatures = computed(() => {
  if (!searchQuery.value.trim()) return features.value
  const q = searchQuery.value.trim().toLowerCase()
  return features.value.filter(f => {
    if (!f.properties || Object.keys(f.properties).length === 0) {
      const typeStr = String(f.geometry?.type || '').toLowerCase()
      return typeStr.includes(q)
    }
    return Object.values(f.properties).some(val => 
      String(val).toLowerCase().includes(q)
    )
  })
})

const displayRows = computed(() => {
  return filteredFeatures.value.map(f => {
    if (columns.value.length > 0) {
      return { rawFeature: f, props: f.properties || {} }
    }
    const typeName = f.geometry?.type || 'Unknown'
    const vCount = getVertexCount(f.geometry)
    return {
      rawFeature: f,
      props: {
        '要素类型 (Type)': typeName,
        '节点数 (Vertices)': `${vCount} 个节点`,
        '数据提示 (Note)': 'JSON 要素中没有找到属性字段'
      }
    }
  })
})

// 分页数据
const totalPages = computed(() => {
  return Math.max(1, Math.ceil(displayRows.value.length / pageSize.value))
})

const paginatedDisplayRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return displayRows.value.slice(start, start + pageSize.value)
})

watch(() => props.visible, (newVal) => {
  if (newVal) {
    currentPage.value = 1
    searchQuery.value = ''
  }
})

watch([searchQuery, pageSize], () => {
  currentPage.value = 1
})

// 拖拽窗口移动
const dragging = ref(false)
const resizing = ref(false)
let dragStart = { x: 0, y: 0 }
let initialPos = { x: 0, y: 0 }
let resizeStart = { x: 0, y: 0 }
let initialSize = { w: 0, h: 0 }
let rafId = null

const startDrag = (e) => {
  if (isMaximized.value) return
  dragging.value = true
  dragStart = { x: e.clientX, y: e.clientY }
  initialPos = { x: pos.x, y: pos.y }

  window.addEventListener('mousemove', onDrag, { passive: true })
  window.addEventListener('mouseup', stopDrag)
}

const onDrag = (e) => {
  if (!dragging.value) return
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    pos.x = Math.max(0, Math.min(window.innerWidth - pos.width, initialPos.x + dx))
    pos.y = Math.max(0, Math.min(window.innerHeight - pos.height, initialPos.y + dy))
  })
}

const stopDrag = () => {
  dragging.value = false
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

// 拖拽缩放尺寸
const startResize = (e) => {
  if (isMaximized.value) return
  resizing.value = true
  resizeStart = { x: e.clientX, y: e.clientY }
  initialSize = { w: pos.width, h: pos.height }

  window.addEventListener('mousemove', onResize, { passive: true })
  window.addEventListener('mouseup', stopResize)
}

const onResize = (e) => {
  if (!resizing.value) return
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    const dw = e.clientX - resizeStart.x
    const dh = e.clientY - resizeStart.y
    pos.width = Math.max(380, Math.min(window.innerWidth - pos.x - 10, initialSize.w + dw))
    pos.height = Math.max(260, Math.min(window.innerHeight - pos.y - 10, initialSize.h + dh))
  })
}

const stopResize = () => {
  resizing.value = false
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}

const toggleMaximize = () => {
  isMaximized.value = !isMaximized.value
}

const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

const handleRowClick = (feature) => {
  emit('focus-feature', feature)
}
</script>

<style scoped>
.json-table-modal {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  user-select: none;
  will-change: transform;
}

.json-table-modal.isMoving {
  transition: none !important;
}

/* Light Theme Styling */
.json-table-modal.light {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
}

.json-table-modal.light .modal-header {
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.json-table-modal.light .modal-title {
  color: #0f172a;
}

.json-table-modal.light .count-badge {
  color: #64748b;
}

.json-table-modal.light .search-input {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
}

.json-table-modal.light .action-btn {
  background: #e2e8f0;
  color: #475569;
}

.json-table-modal.light .action-btn:hover {
  background: #cbd5e1;
  color: #0f172a;
}

.json-table-modal.light .data-table th {
  background: #f8fafc;
  color: #475569;
  border-bottom: 2px solid #e2e8f0;
  border-right: 1px solid #f1f5f9;
}

.json-table-modal.light .data-table td {
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f8fafc;
  color: #334155;
}

.json-table-modal.light .table-row:hover {
  background: #f1f5f9;
}

.json-table-modal.light .modal-footer {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.json-table-modal.light .page-btn {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
}

.json-table-modal.light .page-btn:hover:not(:disabled) {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
}

.json-table-modal.light .page-select {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
}

/* Dark Theme Styling (Cesium) */
.json-table-modal.dark {
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f8fafc;
}

.json-table-modal.dark .modal-header {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.json-table-modal.dark .modal-title {
  color: #ffffff;
}

.json-table-modal.dark .count-badge {
  color: rgba(255, 255, 255, 0.6);
}

.json-table-modal.dark .search-input {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
}

.json-table-modal.dark .action-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.json-table-modal.dark .action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.json-table-modal.dark .data-table th {
  background: rgba(30, 41, 59, 0.9);
  color: rgba(255, 255, 255, 0.8);
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.json-table-modal.dark .data-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.9);
}

.json-table-modal.dark .table-row:hover {
  background: rgba(59, 130, 246, 0.2);
}

.json-table-modal.dark .modal-footer {
  background: rgba(30, 41, 59, 0.8);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.json-table-modal.dark .page-btn {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
}

.json-table-modal.dark .page-btn:hover:not(:disabled) {
  background: #3b82f6;
  color: #ffffff;
}

.json-table-modal.dark .page-select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: move;
  flex-shrink: 0;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}

.title-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 260px;
}

.count-badge {
  font-size: 12px;
  font-weight: normal;
}

.modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  width: 140px;
}

.action-btn {
  border: none;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

.close-btn {
  font-size: 18px;
}

/* Body */
.modal-body {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.no-props-banner {
  padding: 8px 12px;
  background: #eff6ff;
  border-bottom: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 12px;
  line-height: 1.5;
}

.json-table-modal.dark .no-props-banner {
  background: rgba(30, 58, 138, 0.4);
  border-bottom: 1px solid rgba(59, 130, 246, 0.3);
  color: #93c5fd;
}

.empty-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 14px;
  color: #94a3b8;
}

.table-container {
  flex: 1;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
  user-select: text;
}

.header-cell-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.col-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label-toggle-btn {
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  padding: 1px 3px;
  opacity: 0.6;
  transition: all 0.2s;
  flex-shrink: 0;
}

.label-toggle-btn:hover {
  opacity: 1;
  background: rgba(59, 130, 246, 0.15);
}

.label-toggle-btn.active {
  opacity: 1;
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
}

.data-table th,
.data-table td {
  padding: 8px 12px;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-table th {
  position: sticky;
  top: 0;
  z-index: 10;
  font-weight: 600;
}

.col-num {
  width: 40px;
  text-align: center;
}

.table-row {
  cursor: pointer;
  transition: background 0.15s;
}

/* Footer & Pagination */
.modal-footer {
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.page-btn {
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-select {
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
}

/* Resize handle at bottom right corner */
.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: se-resize;
  z-index: 30;
}

.resize-handle::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  opacity: 0.5;
}
</style>
