<template>
  <Teleport to="body">
    <div v-if="visible" class="json-mapping-backdrop" :class="theme" @click.self="handleCancel">
      <div class="json-mapping-modal" :class="theme">
        <!-- 头部 -->
        <div class="modal-header">
          <div class="modal-title">
            <span class="icon">⚙️</span>
            <span>JSON 字段映射与坐标系确认</span>
          </div>
          <button class="close-btn" @click="handleCancel">×</button>
        </div>

        <!-- 内容区域 -->
        <div class="modal-body">
          <div class="file-name-bar">
            📄 文件: <span class="file-name">{{ fileData?.name || '数据解析' }}</span>
          </div>

          <!-- 源坐标系选择 -->
          <div class="form-item">
            <label class="form-label">数据源坐标系 (CRS):</label>
            <select v-model="mappingForm.crs" class="form-select crs-select">
              <option value="wgs84">🌐 WGS84 (标准经纬度 / 84坐标)</option>
              <option value="bd09">🗺️ BD09 (百度地图坐标系)</option>
              <option value="gcj02">🛰️ GCJ02 (高德/腾讯 火星坐标系)</option>
            </select>
          </div>

          <!-- 渲染要素类型 -->
          <div class="form-item">
            <label class="form-label">需要渲染的要素类型:</label>
            <div class="radio-group">
              <label class="radio-label" :class="{ active: mappingForm.featureType === 'auto' }">
                <input type="radio" v-model="mappingForm.featureType" value="auto" />
                <span>🌐 自动识别 (GeoJSON)</span>
              </label>
              <label class="radio-label" :class="{ active: mappingForm.featureType === 'Point' }">
                <input type="radio" v-model="mappingForm.featureType" value="Point" />
                <span>📍 点 (Point)</span>
              </label>
              <label class="radio-label" :class="{ active: mappingForm.featureType === 'LineString' }">
                <input type="radio" v-model="mappingForm.featureType" value="LineString" />
                <span>📏 折线 (Polyline)</span>
              </label>
              <label class="radio-label" :class="{ active: mappingForm.featureType === 'Polygon' }">
                <input type="radio" v-model="mappingForm.featureType" value="Polygon" />
                <span>🔷 多边形 (Polygon)</span>
              </label>
            </div>
          </div>

          <!-- 如果不是 auto 模式，显示字段映射 -->
          <div v-if="mappingForm.featureType !== 'auto'" class="mapping-fields-section">
            <!-- 根节点路径选择 -->
            <div class="form-row" v-if="analysisResult.rootPaths.length > 1">
              <label class="form-label">数据节点路径:</label>
              <select v-model="mappingForm.rootPath" @change="onRootPathChange" class="form-select">
                <option v-for="item in analysisResult.rootPaths" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </div>

            <div class="form-grid">
              <!-- 经度字段 -->
              <div class="form-row">
                <label class="form-label">
                  <span class="required">*</span> 经度字段 (Longitude/X/Jd):
                </label>
                <select v-model="mappingForm.lonField" class="form-select">
                  <option value="" disabled>-- 请选择经度字段 --</option>
                  <option v-for="field in currentFields" :key="field" :value="field">
                    {{ field }}
                  </option>
                </select>
              </div>

              <!-- 纬度字段 -->
              <div class="form-row">
                <label class="form-label">
                  <span class="required">*</span> 纬度字段 (Latitude/Y/Wd):
                </label>
                <select v-model="mappingForm.latField" class="form-select">
                  <option value="" disabled>-- 请选择纬度字段 --</option>
                  <option v-for="field in currentFields" :key="field" :value="field">
                    {{ field }}
                  </option>
                </select>
              </div>
            </div>

            <!-- 折线/多边形时的分组字段 -->
            <div v-if="['LineString', 'Polygon'].includes(mappingForm.featureType)" class="form-row margin-top">
              <label class="form-label">分组/线条ID字段 (可选):</label>
              <select v-model="mappingForm.groupField" class="form-select">
                <option value="">-- 无 (全部按单条{{ mappingForm.featureType === 'LineString' ? '折线' : '多边形' }}连接) --</option>
                <option v-for="field in currentFields" :key="field" :value="field">
                  {{ field }}
                </option>
              </select>
            </div>
          </div>

          <!-- 样例数据预览表格 -->
          <div class="preview-section">
            <div class="preview-title">📊 样例数据预览 (前 5 条)</div>
            <div class="preview-table-wrapper" v-if="previewRows.length > 0">
              <table class="preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th v-for="col in previewColumns" :key="col" :class="{
                      'highlight-lon': mappingForm.lonField === col,
                      'highlight-lat': mappingForm.latField === col
                    }">
                      {{ col }}
                      <span v-if="mappingForm.lonField === col" class="field-badge lon">经度</span>
                      <span v-if="mappingForm.latField === col" class="field-badge lat">纬度</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in previewRows" :key="idx">
                    <td>{{ idx + 1 }}</td>
                    <td v-for="col in previewColumns" :key="col">
                      {{ row[col] !== undefined ? row[col] : '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="no-preview">
              暂无样例数据
            </div>
          </div>
        </div>

        <!-- 底部操作按钮 -->
        <div class="modal-footer">
          <button class="modal-btn cancel-btn" @click="handleCancel">取消</button>
          <button class="modal-btn confirm-btn" @click="handleConfirm">确认生成图层</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { analyzeJsonStructure, convertJsonWithMapping } from '@/utils/jsonParser.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  fileData: {
    type: Object, // { name: string, rawData: any }
    default: () => null
  },
  defaultCrs: {
    type: String,
    default: 'wgs84'
  },
  theme: {
    type: String,
    default: 'light' // 'light' | 'dark'
  }
})

const emit = defineEmits(['update:visible', 'confirm', 'cancel'])

const analysisResult = ref({
  isGeoJson: false,
  rootPaths: [],
  fields: [],
  defaultLon: '',
  defaultLat: '',
  sampleList: []
})

const mappingForm = reactive({
  crs: props.defaultCrs || 'wgs84',
  featureType: 'auto',
  rootPath: '',
  lonField: '',
  latField: '',
  groupField: ''
})

const currentFields = computed(() => analysisResult.value.fields || [])

watch(() => props.fileData, (newVal) => {
  if (newVal && newVal.rawData) {
    const analysis = analyzeJsonStructure(newVal.rawData)
    analysisResult.value = analysis

    // 设置默认源坐标系 (来源于页面设置 defaultCrs: tdt/cesium -> wgs84, baidu -> bd09)
    mappingForm.crs = props.defaultCrs || 'wgs84'

    mappingForm.rootPath = analysis.rootPaths[0]?.value || ''
    mappingForm.lonField = analysis.defaultLon
    mappingForm.latField = analysis.defaultLat
    mappingForm.groupField = ''

    if (analysis.isGeoJson) {
      mappingForm.featureType = 'auto'
    } else {
      mappingForm.featureType = 'Point'
    }
  }
}, { immediate: true })

const previewRows = computed(() => {
  const list = analysisResult.value.sampleList || []
  return list.map(item => {
    if (typeof item === 'object' && item !== null) {
      return item
    }
    return { '值': item }
  })
})

const previewColumns = computed(() => {
  if (previewRows.value.length === 0) return []
  const keysSet = new Set()
  previewRows.value.forEach(r => {
    Object.keys(r).forEach(k => keysSet.add(k))
  })
  return Array.from(keysSet)
})

const onRootPathChange = () => {
  if (props.fileData && props.fileData.rawData) {
    const analysis = analyzeJsonStructure(props.fileData.rawData)
    analysisResult.value = analysis
    mappingForm.lonField = analysis.defaultLon
    mappingForm.latField = analysis.defaultLat
  }
}

const handleCancel = () => {
  emit('update:visible', false)
  emit('cancel')
}

const handleConfirm = () => {
  if (!props.fileData || !props.fileData.rawData) return

  if (mappingForm.featureType !== 'auto') {
    if (!mappingForm.lonField) {
      alert('请选择经度字段 (Longitude)')
      return
    }
    if (!mappingForm.latField) {
      alert('请选择纬度字段 (Latitude)')
      return
    }
  }

  try {
    const geojson = convertJsonWithMapping(props.fileData.rawData, {
      crs: mappingForm.crs,
      featureType: mappingForm.featureType,
      rootPath: mappingForm.rootPath,
      lonField: mappingForm.lonField,
      latField: mappingForm.latField,
      groupField: mappingForm.groupField
    })

    emit('confirm', {
      fileName: props.fileData.name,
      geojson
    })
    emit('update:visible', false)
  } catch (err) {
    alert('转换图层失败: ' + err.message)
  }
}
</script>

<style scoped>
.json-mapping-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.json-mapping-modal {
  width: 620px;
  max-width: 92vw;
  max-height: 85vh;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
  user-select: none;
}

/* Light Theme */
.json-mapping-modal.light {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid #cbd5e1;
}

.json-mapping-modal.light .modal-header {
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.json-mapping-modal.light .modal-title {
  color: #0f172a;
}

.json-mapping-modal.light .file-name-bar {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.json-mapping-modal.light .form-select {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
}

.json-mapping-modal.light .crs-select {
  border-color: #3b82f6;
  font-weight: 500;
}

.json-mapping-modal.light .radio-label {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #334155;
}

.json-mapping-modal.light .radio-label.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
}

.json-mapping-modal.light .preview-table th {
  background: #f1f5f9;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.json-mapping-modal.light .preview-table td {
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.json-mapping-modal.light .modal-footer {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

/* Dark Theme */
.json-mapping-modal.dark {
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.json-mapping-modal.dark .modal-header {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.json-mapping-modal.dark .modal-title {
  color: #ffffff;
}

.json-mapping-modal.dark .file-name-bar {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.json-mapping-modal.dark .form-select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
}

.json-mapping-modal.dark .radio-label {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
}

.json-mapping-modal.dark .radio-label.active {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
  color: #60a5fa;
}

.json-mapping-modal.dark .preview-table th {
  background: rgba(30, 41, 59, 0.9);
  color: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.json-mapping-modal.dark .preview-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.json-mapping-modal.dark .modal-footer {
  background: rgba(30, 41, 59, 0.8);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
}

.close-btn:hover {
  opacity: 1;
}

/* Body */
.modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.file-name-bar {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.file-name {
  font-weight: 600;
  color: #3b82f6;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
}

.required {
  color: #ef4444;
}

.radio-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.radio-label input {
  cursor: pointer;
}

.mapping-fields-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.03);
}

.json-mapping-modal.dark .mapping-fields-section {
  background: rgba(255, 255, 255, 0.03);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-select {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
}

.margin-top {
  margin-top: 4px;
}

/* Preview */
.preview-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-title {
  font-size: 12px;
  font-weight: 600;
}

.preview-table-wrapper {
  max-height: 140px;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.json-mapping-modal.dark .preview-table-wrapper {
  border-color: rgba(255, 255, 255, 0.1);
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  text-align: left;
}

.preview-table th,
.preview-table td {
  padding: 6px 10px;
  white-space: nowrap;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-badge {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  color: white;
  margin-left: 4px;
}

.field-badge.lon {
  background: #10b981;
}

.field-badge.lat {
  background: #3b82f6;
}

.no-preview {
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  padding: 10px;
}

/* Footer */
.modal-footer {
  padding: 10px 18px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.modal-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.cancel-btn {
  background: none;
  border: 1px solid #cbd5e1;
  color: inherit;
}

.cancel-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.confirm-btn {
  background: #10b981;
  color: white;
  border: none;
}

.confirm-btn:hover {
  background: #059669;
}
</style>
