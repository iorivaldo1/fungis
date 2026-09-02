<template>
  <Teleport to="body">
    <div v-if="visible" class="shp-crs-backdrop" :class="theme" @click.self="handleCancel">
      <div class="shp-crs-modal" :class="theme">
        <!-- 头部 -->
        <div class="modal-header">
          <div class="modal-title">
            <span class="icon">⚙️</span>
            <span>SHP 图层坐标系确认</span>
          </div>
          <button class="close-btn" @click="handleCancel">×</button>
        </div>

        <!-- 内容区域 -->
        <div class="modal-body">
          <div class="file-name-bar">
            📂 SHP 图层: <span class="file-name">{{ layerData?.name || '未知图层' }}</span>
            <span class="feature-count">({{ featureCount }} 个要素)</span>
          </div>

          <!-- 源坐标系选择 -->
          <div class="form-item">
            <label class="form-label">请选择该 SHP 图层的源坐标系 (CRS):</label>
            <select v-model="selectedCrs" class="form-select crs-select">
              <option value="wgs84">🌐 WGS84 (标准经纬度 / 84坐标)</option>
              <option value="bd09">🗺️ BD09 (百度地图坐标系)</option>
              <option value="gcj02">🛰️ GCJ02 (高德/腾讯 火星坐标系)</option>
            </select>
          </div>

          <!-- 几何类型提示 -->
          <div class="info-tip-bar">
            几何类型: <b>{{ geometryTypeTip }}</b>
          </div>

          <!-- 样例属性预览表格 -->
          <div class="preview-section">
            <div class="preview-title">📊 属性表样例预览 (前 5 条)</div>
            <div class="preview-table-wrapper" v-if="previewRows.length > 0">
              <table class="preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th v-for="col in previewColumns" :key="col">
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in previewRows" :key="idx">
                    <td>{{ idx + 1 }}</td>
                    <td v-for="col in previewColumns" :key="col">
                      {{ (row[col] !== undefined && row[col] !== null) ? row[col] : '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="no-preview">
              无 DBF 属性数据
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
import { ref, watch, computed } from 'vue'
import { transformGeoJsonCrs } from '@/utils/jsonParser.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  layerData: {
    type: Object, // { name: string, rawGeojson: object }
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

const selectedCrs = ref(props.defaultCrs)

watch(() => props.visible, (newVal) => {
  if (newVal) {
    selectedCrs.value = props.defaultCrs || 'wgs84'
  }
})

const featureCount = computed(() => {
  if (!props.layerData?.rawGeojson?.features) return 0
  return props.layerData.rawGeojson.features.length
})

const geometryTypeTip = computed(() => {
  const feats = props.layerData?.rawGeojson?.features
  if (!feats || feats.length === 0) return '未知'
  const typeSet = new Set(feats.map(f => f.geometry?.type).filter(Boolean))
  return Array.from(typeSet).join(', ') || '未知'
})

const previewRows = computed(() => {
  const feats = props.layerData?.rawGeojson?.features || []
  return feats.slice(0, 5).map(f => f.properties || {})
})

const previewColumns = computed(() => {
  if (previewRows.value.length === 0) return []
  const keysSet = new Set()
  previewRows.value.forEach(r => {
    Object.keys(r).forEach(k => keysSet.add(k))
  })
  return Array.from(keysSet)
})

const handleCancel = () => {
  emit('update:visible', false)
  emit('cancel')
}

const handleConfirm = () => {
  if (!props.layerData || !props.layerData.rawGeojson) return

  let geojson
  try {
    geojson = transformGeoJsonCrs(props.layerData.rawGeojson, selectedCrs.value)
  } catch (err) {
    alert('坐标系转换失败: ' + err.message)
    return
  }

  emit('update:visible', false)

  try {
    emit('confirm', {
      fileName: props.layerData.name,
      geojson,
      crs: selectedCrs.value
    })
  } catch (err) {
    console.error('图层添加失败:', err)
    alert('图层渲染失败: ' + err.message)
  }
}
</script>

<style scoped>
.shp-crs-backdrop {
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

.shp-crs-modal {
  width: 580px;
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
.shp-crs-modal.light {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid #cbd5e1;
}

.shp-crs-modal.light .modal-header {
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.shp-crs-modal.light .modal-title {
  color: #0f172a;
}

.shp-crs-modal.light .file-name-bar {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.shp-crs-modal.light .info-tip-bar {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
}

.shp-crs-modal.light .form-select {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
}

.shp-crs-modal.light .crs-select {
  border-color: #3b82f6;
  font-weight: 500;
}

.shp-crs-modal.light .preview-table th {
  background: #f1f5f9;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.shp-crs-modal.light .preview-table td {
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.shp-crs-modal.light .modal-footer {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

/* Dark Theme */
.shp-crs-modal.dark {
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.shp-crs-modal.dark .modal-header {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.shp-crs-modal.dark .modal-title {
  color: #ffffff;
}

.shp-crs-modal.dark .file-name-bar {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.shp-crs-modal.dark .info-tip-bar {
  background: rgba(30, 58, 138, 0.4);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #93c5fd;
}

.shp-crs-modal.dark .form-select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
}

.shp-crs-modal.dark .preview-table th {
  background: rgba(30, 41, 59, 0.9);
  color: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.shp-crs-modal.dark .preview-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.shp-crs-modal.dark .modal-footer {
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
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-name {
  font-weight: 600;
  color: #3b82f6;
}

.feature-count {
  font-size: 12px;
  opacity: 0.8;
}

.info-tip-bar {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
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

.form-select {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
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

.shp-crs-modal.dark .preview-table-wrapper {
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
  background: #3b82f6;
  color: white;
  border: none;
}

.confirm-btn:hover {
  background: #2563eb;
}
</style>
