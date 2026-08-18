<template>
  <div class="shp-control-panel" :class="[theme, { collapsed: isCollapsed }]">
    <div class="info-title" @click="toggleCollapse">
      <span>{{ title }}</span>
      <IconChevronDown class="collapse-icon" :class="{ rotated: isCollapsed }" width="20" height="20" />
    </div>

    <transition name="slide-fade">
      <div v-show="!isCollapsed" class="info-content shp-content">
        <!-- 隐藏的文件夹选择 input -->
        <input 
          type="file" 
          ref="folderInputRef" 
          @change="handleFileInputChange" 
          webkitdirectory 
          style="display: none;" 
        />

        <div 
          class="shp-upload-area"
          :class="{ dragging: isDraggingOver }"
          @dragover.prevent="isDraggingOver = true"
          @dragleave.prevent="isDraggingOver = false"
          @drop.prevent="handleDrop"
        >
          <button class="shp-upload-btn folder-btn" @click="triggerFolderInput" :disabled="isLoading">
            <span v-if="isLoading" class="loading-spinner">⏳ 解析中...</span>
            <span v-else>📂 选择 SHP 矢量文件夹</span>
          </button>
          <div class="drag-hint">或拖拽包含 .shp / .dbf 的本地文件夹至此处</div>
        </div>

        <div class="shp-tip" v-if="layers.length === 0">
          选择或拖拽本地文件夹，自动批量读取并关联同名 .shp 图形与 .dbf 属性表。
        </div>

        <!-- 图层管理列表 -->
        <div class="shp-layer-list" v-else>
          <div 
            v-for="layer in layers" 
            :key="layer.id" 
            class="shp-layer-item"
          >
            <div class="layer-main-info">
              <input 
                type="checkbox" 
                v-model="layer.visible" 
                @change="handleToggleVisible(layer)"
                class="layer-checkbox"
              />
              <span class="color-badge" :style="{ backgroundColor: layer.color }"></span>
              <div class="layer-text-info" :title="layer.name">
                <span class="layer-name">{{ layer.name }}</span>
                <span class="layer-count">({{ layer.featureCount }} 要素)</span>
              </div>
            </div>
            <div class="layer-actions">
              <button 
                class="layer-btn table-btn" 
                :class="{ active: isTableVisible && activeTableLayer?.id === layer.id }"
                @click="handleToggleTable(layer)" 
                title="查看/关闭属性表"
              >
                📋
              </button>
              <button class="layer-btn focus-btn" @click="handleFocus(layer)" title="定位到图层范围">🎯</button>
              <button class="layer-btn delete-btn" @click="handleDelete(layer)" title="删除图层">🗑️</button>
            </div>
          </div>

          <div class="shp-global-actions">
            <button class="clear-all-btn" @click="handleClearAll">清空所有 SHP 图层</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 可拖拽与缩放的 SHP 属性表弹窗 -->
    <ShpAttributeTable 
      v-model:visible="isTableVisible" 
      :layer="activeTableLayer" 
      :theme="theme"
      @focus-feature="handleFocusFeature"
      @toggle-label-field="handleToggleLabelField"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import shp, { parseShp, parseDbf, combine } from 'shpjs'
import { ensureWgs84GeoJson } from '@/utils/shpMapRenderer.js'
import IconChevronDown from '@/components/icons/IconChevronDown.vue'
import ShpAttributeTable from '@/components/ShpAttributeTable.vue'

const props = defineProps({
  title: {
    type: String,
    default: 'SHP 图层管理'
  },
  theme: {
    type: String,
    default: 'light' // 'light' | 'dark'
  },
  defaultCollapsed: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['add-layer', 'toggle-layer', 'delete-layer', 'focus-layer', 'clear-all', 'focus-feature', 'toggle-label-field'])

const isCollapsed = ref(props.defaultCollapsed)
const isLoading = ref(false)
const layers = ref([])

const colorPalette = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]
let colorIndex = 0

const getRandomColor = () => {
  const color = colorPalette[colorIndex % colorPalette.length]
  colorIndex++
  return color
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const isDraggingOver = ref(false)
const folderInputRef = ref(null)

const triggerFolderInput = () => {
  if (folderInputRef.value) {
    folderInputRef.value.value = ''
    folderInputRef.value.click()
  }
}

const handleFileInputChange = (event) => {
  const files = Array.from(event.target.files || [])
  if (files.length > 0) {
    processSelectedFiles(files)
  }
}

const handleDrop = async (event) => {
  isDraggingOver.value = false
  const items = Array.from(event.dataTransfer.items || [])
  const fileList = []

  const readEntry = async (entry) => {
    if (entry.isFile) {
      return new Promise(resolve => entry.file(f => { fileList.push(f); resolve(); }))
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      const entries = await new Promise(resolve => reader.readEntries(resolve))
      for (const child of entries) {
        await readEntry(child)
      }
    }
  }

  for (const item of items) {
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry()
      if (entry) await readEntry(entry)
    } else if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) fileList.push(file)
    }
  }

  if (fileList.length > 0) {
    processSelectedFiles(fileList)
  }
}

const processSelectedFiles = async (files) => {
  if (!files || files.length === 0) return

  isLoading.value = true
  try {
    const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'))
    const shpFiles = files.filter(f => f.name.toLowerCase().endsWith('.shp'))
    const dbfFiles = files.filter(f => f.name.toLowerCase().endsWith('.dbf'))
    const prjFiles = files.filter(f => f.name.toLowerCase().endsWith('.prj'))

    const parseZipFn = shp.parseZip || (shp.default && shp.default.parseZip) || shp
    const parseShpFn = parseShp || shp.parseShp || (shp.default && shp.default.parseShp)
    const parseDbfFn = parseDbf || shp.parseDbf || (shp.default && shp.default.parseDbf)
    const combineFn = combine || shp.combine || (shp.default && shp.default.combine)

    // 1. 处理 .zip 压缩包
    for (const zipFile of zipFiles) {
      const buffer = await zipFile.arrayBuffer()
      const parsed = await parseZipFn(buffer)
      const geojsonList = Array.isArray(parsed) ? parsed : [parsed]
      
      geojsonList.forEach((geojson, idx) => {
        if (!geojson || !geojson.features) return
        const layerName = geojson.fileName || zipFile.name.replace(/\.zip$/i, '') + (geojsonList.length > 1 ? `_${idx + 1}` : '')
        addParsedLayer(layerName, geojson)
      })
    }

    // 2. 处理单独/多选/文件夹匹配的 .shp
    if (shpFiles.length > 0) {
      for (const shpFile of shpFiles) {
        const baseName = shpFile.name.replace(/\.shp$/i, '')
        const matchingDbf = dbfFiles.find(f => f.name.replace(/\.dbf$/i, '') === baseName) || dbfFiles[0]
        const matchingPrj = prjFiles.find(f => f.name.replace(/\.prj$/i, '') === baseName) || prjFiles[0]

        const shpBuf = await shpFile.arrayBuffer()
        const dbfBuf = matchingDbf ? await matchingDbf.arrayBuffer() : null
        const prjStr = matchingPrj ? await matchingPrj.text() : null

        let geojson = null

        // 优先尝试 shp({ shp: shpBuf, dbf: dbfBuf, prj: prjStr }) 对象传输模式
        try {
          geojson = await shp({
            shp: shpBuf,
            dbf: dbfBuf,
            prj: prjStr
          })
        } catch (e1) {
          // 如果对象模式失败，直接使用 parseShp 和 parseDbf 解析二进制
          if (parseShpFn) {
            const geometries = parseShpFn(shpBuf, prjStr)
            const properties = (dbfBuf && parseDbfFn) ? parseDbfFn(dbfBuf) : []
            geojson = combineFn ? combineFn([geometries, properties]) : {
              type: 'FeatureCollection',
              features: (Array.isArray(geometries) ? geometries : [geometries]).map((g, i) => ({
                type: 'Feature',
                geometry: g,
                properties: (properties && properties[i]) || {}
              }))
            }
          }
        }

        if (geojson && geojson.features) {
          addParsedLayer(shpFile.name, geojson, prjStr)
        }
      }
    }
  } catch (err) {
    console.error('解析 SHP 文件失败:', err)
    alert('解析 SHP 文件失败: ' + (err.message || '格式不支持或编码错误'))
  } finally {
    isLoading.value = false
  }
}

const addParsedLayer = (name, rawGeojson, prjStr = '') => {
  const geojson = ensureWgs84GeoJson(rawGeojson, prjStr)
  const id = 'shp_layer_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  const layer = {
    id,
    name,
    featureCount: geojson.features ? geojson.features.length : 0,
    visible: true,
    color: getRandomColor(),
    geojson
  }
  layers.value.push(layer)
  emit('add-layer', layer)
}

const isTableVisible = ref(false)
const activeTableLayer = ref(null)

const handleToggleVisible = (layer) => {
  emit('toggle-layer', layer)
}

const handleToggleTable = (layer) => {
  if (activeTableLayer.value?.id === layer.id) {
    isTableVisible.value = !isTableVisible.value
  } else {
    activeTableLayer.value = layer
    isTableVisible.value = true
  }
}

const handleFocus = (layer) => {
  emit('focus-layer', layer)
}

const handleFocusFeature = (feature) => {
  emit('focus-feature', feature)
}

const handleToggleLabelField = (data) => {
  emit('toggle-label-field', data)
}

const handleDelete = (layer) => {
  if (activeTableLayer.value?.id === layer.id) {
    isTableVisible.value = false
    activeTableLayer.value = null
  }
  layers.value = layers.value.filter(l => l.id !== layer.id)
  emit('delete-layer', layer)
}

const handleClearAll = () => {
  isTableVisible.value = false
  activeTableLayer.value = null
  layers.value = []
  emit('clear-all')
}
</script>

<style scoped>
.shp-control-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 450;
  border-radius: 12px;
  overflow: hidden;
  min-width: 250px;
  max-width: 320px;
  transition: all 0.3s ease;
}

/* Light Theme (TianDiTu / Baidu) */
.shp-control-panel.light {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.shp-control-panel.light.collapsed {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.shp-control-panel.light .info-title {
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

.shp-control-panel.light .info-title:hover {
  background: #e2e8f0;
}

.shp-control-panel.light .collapse-icon {
  color: #64748b;
}

.shp-control-panel.light .shp-tip {
  color: #64748b;
}

.shp-control-panel.light .shp-layer-item {
  border-bottom: 1px dashed #e2e8f0;
}

.shp-control-panel.light .layer-name {
  color: #1e293b;
}

.shp-control-panel.light .layer-count {
  color: #64748b;
}

/* Dark Theme (Cesium) */
.shp-control-panel.dark {
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.shp-control-panel.dark.collapsed {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.shp-control-panel.dark .info-title {
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

.shp-control-panel.dark .info-title:hover {
  background: linear-gradient(135deg, rgba(70, 70, 70, 0.7) 0%, rgba(90, 90, 90, 0.6) 100%);
}

.shp-control-panel.dark .collapse-icon {
  color: #ffffff;
}

.shp-control-panel.dark .shp-tip {
  color: rgba(255, 255, 255, 0.6);
}

.shp-control-panel.dark .shp-layer-item {
  border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
}

.shp-control-panel.dark .layer-name {
  color: #f8fafc;
}

.shp-control-panel.dark .layer-count {
  color: rgba(255, 255, 255, 0.6);
}

/* Common Styles */
.collapse-icon {
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.collapse-icon.rotated {
  transform: rotate(-180deg);
}

.shp-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 380px;
  overflow-y: auto;
}

.shp-upload-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 2px dashed transparent;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.shp-upload-area.dragging {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
}

.btn-group {
  display: flex;
  gap: 6px;
}

.shp-upload-btn {
  flex: 1;
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, transform 0.1s;
  white-space: nowrap;
}

.folder-btn {
  background: #059669;
}

.folder-btn:hover {
  background: #047857;
}

.shp-upload-btn:hover:not(:disabled) {
  background: #2563eb;
}

.shp-upload-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.drag-hint {
  font-size: 11px;
  color: #64748b;
  text-align: center;
}

.shp-control-panel.dark .drag-hint {
  color: rgba(255, 255, 255, 0.5);
}

.shp-tip {
  font-size: 11px;
  line-height: 1.4;
  padding: 2px 4px;
}

.shp-layer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shp-layer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  gap: 8px;
}

.layer-main-info {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
}

.layer-checkbox {
  cursor: pointer;
}

.color-badge {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.layer-text-info {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.layer-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layer-count {
  font-size: 11px;
  flex-shrink: 0;
}

.layer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.layer-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.2s;
}

.layer-btn:hover {
  background: rgba(0, 0, 0, 0.1);
}

.table-btn.active {
  background: rgba(59, 130, 246, 0.25);
  border: 1px solid rgba(59, 130, 246, 0.5);
}

.shp-control-panel.dark .layer-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.shp-control-panel.dark .table-btn.active {
  background: rgba(59, 130, 246, 0.4);
  border: 1px solid rgba(59, 130, 246, 0.7);
}

.shp-global-actions {
  margin-top: 6px;
}

.clear-all-btn {
  width: 100%;
  padding: 6px 0;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.clear-all-btn:hover {
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
