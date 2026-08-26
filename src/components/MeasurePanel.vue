<template>
  <div class="measure-control-panel" :class="[theme, { collapsed: isCollapsed }]">
    <div class="info-title" @click="toggleCollapse">
      <div class="title-left">
        <svg class="title-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 12h20M6 12v-3M10 12v-4M14 12v-3M18 12v-4" />
        </svg>
        <span>{{ title }}</span>
      </div>
      <IconChevronDown class="collapse-icon" :class="{ rotated: isCollapsed }" width="20" height="20" />
    </div>

    <transition name="slide-fade">
      <div v-show="!isCollapsed" class="info-content measure-content">
        <div class="measure-actions">
          <button 
            class="measure-btn" 
            :class="{ active: activeTool === 'distance' }"
            @click="toggleDistance"
            title="测量距离"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 20 10 8 16 16 22 4"></polyline>
            </svg>
            <span>测距</span>
          </button>

          <button 
            class="measure-btn" 
            :class="{ active: activeTool === 'area' }"
            @click="toggleArea"
            title="测量面积"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 3 4 9 7 21 17 21 20 9"></polygon>
            </svg>
            <span>测面</span>
          </button>

          <button 
            class="measure-btn clear-btn" 
            @click="clearMeasure"
            title="清除测量图层"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>清除</span>
          </button>
        </div>

        <div class="measure-tip active-tip" v-if="activeTool === 'distance'">
          <span>📏 测距模式：点击地图添加节点，双击完成测距。</span>
        </div>
        <div class="measure-tip active-tip" v-else-if="activeTool === 'area'">
          <span>📐 测面模式：点击地图添加顶点，双击完成测面。</span>
        </div>
        <div class="measure-tip idle-tip" v-else>
          <span>点击“测距”或“测面”按钮在地图上测量。</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import IconChevronDown from '@/components/icons/IconChevronDown.vue'

const props = defineProps({
  map: {
    type: Object,
    default: null
  },
  title: {
    type: String,
    default: '测量工具'
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

const isCollapsed = ref(props.defaultCollapsed)
const activeTool = ref(null)

let lineTool = null
let polygonTool = null

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const initTools = (mapInstance) => {
  if (!mapInstance || !window.T) return false

  if (!lineTool) {
    try {
      lineTool = new window.T.PolylineTool(mapInstance, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.85,
        showLabel: true
      })
      lineTool.addEventListener('draw', () => {
        // 完成绘制
      })
    } catch (err) {
      console.error('初始化天地图 PolylineTool 失败:', err)
    }
  }

  if (!polygonTool) {
    try {
      polygonTool = new window.T.PolygonTool(mapInstance, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.85,
        fillColor: '#3b82f6',
        fillOpacity: 0.25,
        showLabel: true
      })
      polygonTool.addEventListener('draw', () => {
        // 完成绘制
      })
    } catch (err) {
      console.error('初始化天地图 PolygonTool 失败:', err)
    }
  }

  return true
}

watch(() => props.map, (newMap) => {
  if (newMap) {
    initTools(newMap)
  }
}, { immediate: true })

const toggleDistance = () => {
  if (!props.map) return
  if (!initTools(props.map)) return

  if (activeTool.value === 'distance') {
    lineTool?.close()
    activeTool.value = null
  } else {
    polygonTool?.close()
    lineTool?.open()
    activeTool.value = 'distance'
  }
}

const toggleArea = () => {
  if (!props.map) return
  if (!initTools(props.map)) return

  if (activeTool.value === 'area') {
    polygonTool?.close()
    activeTool.value = null
  } else {
    lineTool?.close()
    polygonTool?.open()
    activeTool.value = 'area'
  }
}

const clearMeasure = () => {
  lineTool?.clear()
  polygonTool?.clear()
  lineTool?.close()
  polygonTool?.close()
  activeTool.value = null
}

const closeTools = () => {
  lineTool?.close()
  polygonTool?.close()
  activeTool.value = null
}

onUnmounted(() => {
  clearMeasure()
  lineTool = null
  polygonTool = null
})

defineExpose({
  clearMeasure,
  closeTools
})
</script>

<style scoped>
.measure-control-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 450;
  border-radius: 12px;
  overflow: hidden;
  min-width: 220px;
  transition: all 0.3s ease;
}

/* Light Theme */
.measure-control-panel.light {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.measure-control-panel.light.collapsed {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.measure-control-panel.light .info-title {
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

.measure-control-panel.light .info-title:hover {
  background: #e2e8f0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-icon {
  color: #3b82f6;
}

.collapse-icon {
  color: #64748b;
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.collapse-icon.rotated {
  transform: rotate(-180deg);
}

.measure-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.measure-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.measure-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.measure-btn:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  color: #1e293b;
}

.measure-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
}

.clear-btn {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #ef4444;
}

.clear-btn:hover {
  background: #fee2e2;
  border-color: #f87171;
  color: #dc2626;
}

.measure-tip {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  line-height: 1.4;
}

.measure-tip.idle-tip {
  background: #f8fafc;
  color: #64748b;
  border: 1px dashed #cbd5e1;
}

.measure-tip.active-tip {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

/* Dark Theme */
.measure-control-panel.dark {
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.measure-control-panel.dark .info-title {
  color: white;
  background: linear-gradient(135deg, rgba(60, 60, 60, 0.6) 0%, rgba(80, 80, 80, 0.5) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.measure-control-panel.dark .measure-btn {
  background: rgba(30, 41, 59, 0.8);
  border-color: rgba(255, 255, 255, 0.2);
  color: #f8fafc;
}

.measure-control-panel.dark .measure-btn:hover {
  background: rgba(51, 65, 85, 0.9);
}

.measure-control-panel.dark .measure-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
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
