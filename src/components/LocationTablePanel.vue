<template>
  <div v-if="points.length > 0" class="location-table-panel" :class="[theme, { collapsed: isCollapsed }]">
    <div class="info-title" @click="toggleCollapse">
      <div class="title-left">
        <span>定位结果列表</span>
        <span class="count-badge">{{ points.length }}</span>
      </div>
      <IconChevronDown class="collapse-icon" :class="{ rotated: isCollapsed }" width="20" height="20" />
    </div>

    <transition name="slide-fade">
      <div v-show="!isCollapsed" class="info-content">
        <div class="table-container">
          <table class="location-table">
            <thead>
              <tr>
                <th class="col-id">ID</th>
                <th class="col-coord">坐标</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="item in points" 
                :key="item.id" 
                :class="{ 'is-hidden': !item.visible }"
                @click="onRowClick(item)"
              >
                <td class="col-id">
                  <span class="id-tag">#{{ item.id }}</span>
                </td>
                <td class="col-coord" :title="formatCoordFull(item)">
                  {{ formatCoord(item) }}
                </td>
                <td class="col-actions" @click.stop>
                  <!-- 显隐切换按钮 -->
                  <button 
                    class="action-btn toggle-btn" 
                    :class="{ 'btn-hidden': !item.visible }" 
                    :title="item.visible ? '隐藏标记' : '显示标记'"
                    @click="onToggleVisible(item)"
                  >
                    <!-- Eye Icon -->
                    <svg v-if="item.visible" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <!-- Eye Off Icon -->
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                      <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                      <line x1="2" x2="22" y1="2" y2="22"/>
                    </svg>
                  </button>

                  <!-- 定位/聚焦按钮 -->
                  <button 
                    class="action-btn locate-btn" 
                    title="聚焦地图点"
                    @click="onFocus(item)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" x2="12" y1="8" y2="16"/>
                      <line x1="8" x2="16" y1="12" y2="12"/>
                    </svg>
                  </button>

                  <!-- 删除按钮 -->
                  <button 
                    class="action-btn delete-btn" 
                    title="删除记录"
                    @click="onDelete(item)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18"/>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="panel-footer">
          <button class="clear-all-btn" @click="onClearAll">清空全部</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import IconChevronDown from '@/components/icons/IconChevronDown.vue'

const props = defineProps({
  points: {
    type: Array,
    default: () => []
  },
  theme: {
    type: String,
    default: 'light' // 'light' | 'dark'
  },
  defaultCollapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle-visible', 'delete-item', 'focus-item', 'clear-all'])

const isCollapsed = ref(props.defaultCollapsed)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const formatCoord = (item) => {
  if (item.rawX !== undefined && item.rawY !== undefined) {
    return `${Number(item.rawX).toFixed(3)}, ${Number(item.rawY).toFixed(3)}`
  }
  return `${Number(item.longitude).toFixed(3)}, ${Number(item.latitude).toFixed(3)}`
}

const formatCoordFull = (item) => {
  if (item.rawX !== undefined && item.rawY !== undefined) {
    return `X/经度: ${item.rawX}, Y/纬度: ${item.rawY}`
  }
  return `经度: ${item.longitude}, 纬度: ${item.latitude}`
}

const onToggleVisible = (item) => {
  emit('toggle-visible', item)
}

const onDelete = (item) => {
  emit('delete-item', item)
}

const onFocus = (item) => {
  emit('focus-item', item)
}

const onRowClick = (item) => {
  emit('focus-item', item)
}

const onClearAll = () => {
  emit('clear-all')
}
</script>

<style scoped>
.location-table-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 450;
  border-radius: 12px;
  overflow: hidden;
  min-width: 310px;
  max-width: 360px;
  transition: all 0.3s ease;
}

/* Light Theme (TianDiTu / Baidu) */
.location-table-panel.light {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.location-table-panel.light.collapsed {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.location-table-panel.light .info-title {
  color: #1a202c;
  font-size: 15px;
  font-weight: 600;
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

.location-table-panel.light .info-title:hover {
  background: #e2e8f0;
}

.location-table-panel.light .collapse-icon {
  color: #64748b;
}

.location-table-panel.light .location-table th {
  background: #f8fafc;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.location-table-panel.light .location-table td {
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.location-table-panel.light .location-table tbody tr:hover {
  background-color: #f1f5f9;
}

.location-table-panel.light .location-table tr.is-hidden {
  opacity: 0.5;
  background-color: #fafafa;
}

.location-table-panel.light .panel-footer {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

/* Dark Theme (Cesium) */
.location-table-panel.dark {
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.location-table-panel.dark.collapsed {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.location-table-panel.dark .info-title {
  color: white;
  font-size: 15px;
  font-weight: 600;
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

.location-table-panel.dark .info-title:hover {
  background: linear-gradient(135deg, rgba(70, 70, 70, 0.7) 0%, rgba(90, 90, 90, 0.6) 100%);
}

.location-table-panel.dark .collapse-icon {
  color: #ffffff;
}

.location-table-panel.dark .location-table th {
  background: rgba(30, 41, 59, 0.9);
  color: rgba(255, 255, 255, 0.85);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.location-table-panel.dark .location-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.location-table-panel.dark .location-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.location-table-panel.dark .location-table tr.is-hidden {
  opacity: 0.4;
  background-color: rgba(0, 0, 0, 0.2);
}

.location-table-panel.dark .panel-footer {
  background: rgba(30, 41, 59, 0.7);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Common Styles */
.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  background: #3b82f6;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
}

.collapse-icon {
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.collapse-icon.rotated {
  transform: rotate(-180deg);
}

.info-content {
  display: flex;
  flex-direction: column;
  max-height: 320px;
}

.table-container {
  overflow-y: auto;
  max-height: 250px;
}

.location-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.location-table th {
  position: sticky;
  top: 0;
  font-weight: 600;
  padding: 8px 10px;
  z-index: 1;
}

.location-table td {
  padding: 8px 10px;
  transition: background-color 0.2s;
}

.location-table tr {
  cursor: pointer;
}

.col-id {
  width: 50px;
  text-align: center;
}

.id-tag {
  display: inline-block;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #bfdbfe;
  font-size: 12px;
}

.dark .id-tag {
  background: rgba(37, 99, 235, 0.3);
  color: #93c5fd;
  border-color: rgba(147, 197, 253, 0.3);
}

.col-coord {
  font-family: monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
}

.col-actions {
  width: 100px;
  text-align: center;
  white-space: nowrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  margin: 0 2px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn {
  color: #3b82f6;
  background: #eff6ff;
  border-color: #dbeafe;
}

.toggle-btn:hover {
  background: #dbeafe;
  color: #1d4ed8;
}

.toggle-btn.btn-hidden {
  color: #94a3b8;
  background: #f1f5f9;
  border-color: #e2e8f0;
}

.toggle-btn.btn-hidden:hover {
  background: #e2e8f0;
  color: #64748b;
}

.dark .toggle-btn {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.3);
}

.dark .toggle-btn:hover {
  background: rgba(59, 130, 246, 0.4);
  color: #93c5fd;
}

.dark .toggle-btn.btn-hidden {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.locate-btn {
  color: #10b981;
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.locate-btn:hover {
  background: #d1fae5;
  color: #047857;
}

.dark .locate-btn {
  color: #34d399;
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.3);
}

.dark .locate-btn:hover {
  background: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}

.delete-btn {
  color: #ef4444;
  background: #fef2f2;
  border-color: #fecaca;
}

.delete-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

.dark .delete-btn {
  color: #f87171;
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.3);
}

.dark .delete-btn:hover {
  background: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.panel-footer {
  padding: 8px 12px;
  display: flex;
  justify-content: flex-end;
}

.clear-all-btn {
  background: #ef4444;
  color: #ffffff;
  border: none;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
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

