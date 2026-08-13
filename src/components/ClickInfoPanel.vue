<template>
  <div class="click-info-panel" :class="[theme, { collapsed: isCollapsed }]">
    <div class="info-title" @click="toggleCollapse">
      <span>{{ title }}</span>
      <IconChevronDown class="collapse-icon" :class="{ rotated: isCollapsed }" width="20" height="20" />
    </div>
    <transition name="slide-fade">
      <div v-show="!isCollapsed" class="info-content">
        <slot :coordInfo="computedCoord">
          <template v-if="crs === 'bd09'">
            <div class="info-item">BD09经度: {{ computedCoord.bdLng }}</div>
            <div class="info-item">BD09纬度: {{ computedCoord.bdLat }}</div>
            <div class="info-item">WGS84经度: {{ computedCoord.wgsLng }}</div>
            <div class="info-item">WGS84纬度: {{ computedCoord.wgsLat }}</div>
          </template>
          <template v-else>
            <div class="info-item">WGS84经度: {{ computedCoord.wgsLng }}</div>
            <div class="info-item">WGS84纬度: {{ computedCoord.wgsLat }}</div>
            <div class="info-item">BD09经度: {{ computedCoord.bdLng }}</div>
            <div class="info-item">BD09纬度: {{ computedCoord.bdLat }}</div>
          </template>
          <div class="info-item">分带号: {{ computedCoord.zone }}</div>
          <div class="info-item">投影X: {{ computedCoord.projX }}</div>
          <div class="info-item">投影Y: {{ computedCoord.projY }}</div>
        </slot>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import proj4 from 'proj4'
import { wgs84ToGcj02, gcj02ToBd09, bd09ToWgs84 } from '@/utils/baiduUtils'
import IconChevronDown from '@/components/icons/IconChevronDown.vue'

const props = defineProps({
  point: {
    type: Object,
    default: null
  },
  crs: {
    type: String,
    default: 'wgs84', // 'wgs84' | 'bd09'
    validator: (v) => ['wgs84', 'bd09'].includes(v)
  },
  title: {
    type: String,
    default: '点击信息'
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

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const computedCoord = computed(() => {
  if (!props.point || props.point.lng === undefined || props.point.lat === undefined) {
    return {
      wgsLng: '--',
      wgsLat: '--',
      bdLng: '--',
      bdLat: '--',
      zone: '--',
      projX: '--',
      projY: '--'
    }
  }

  const rawLng = Number(props.point.lng)
  const rawLat = Number(props.point.lat)

  if (isNaN(rawLng) || isNaN(rawLat)) {
    return {
      wgsLng: '--',
      wgsLat: '--',
      bdLng: '--',
      bdLat: '--',
      zone: '--',
      projX: '--',
      projY: '--'
    }
  }

  let wgsLng, wgsLat, bdLng, bdLat

  if (props.crs === 'bd09') {
    bdLng = rawLng
    bdLat = rawLat
    const [wLng, wLat] = bd09ToWgs84(bdLng, bdLat)
    wgsLng = wLng
    wgsLat = wLat
  } else {
    wgsLng = rawLng
    wgsLat = rawLat
    const [gcjLng, gcjLat] = wgs84ToGcj02(wgsLng, wgsLat)
    const [bLng, bLat] = gcj02ToBd09(gcjLng, gcjLat)
    bdLng = bLng
    bdLat = bLat
  }

  let zoneStr = '--'
  let projXStr = '--'
  let projYStr = '--'

  try {
    const zone = Math.floor((wgsLng + 1.5) / 3)
    const centralMeridian = zone * 3
    const cgcs2000Str = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`
    const wgs84Str = `+proj=longlat +datum=WGS84 +no_defs`

    const [x, y] = proj4(wgs84Str, cgcs2000Str, [wgsLng, wgsLat])
    projXStr = x.toFixed(2)
    projYStr = y.toFixed(2)
    zoneStr = `${zone}带 (中央经线${centralMeridian}°)`
  } catch (e) {
    console.error('CGCS2000 投影转换失败:', e)
  }

  return {
    wgsLng: wgsLng.toFixed(6),
    wgsLat: wgsLat.toFixed(6),
    bdLng: bdLng.toFixed(6),
    bdLat: bdLat.toFixed(6),
    zone: zoneStr,
    projX: projXStr,
    projY: projYStr
  }
})
</script>

<style scoped>
.click-info-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 450;
  border-radius: 12px;
  overflow: hidden;
  min-width: 240px;
  transition: all 0.3s ease;
}

/* Light Theme (Default for TianDiTu & Baidu panels) */
.click-info-panel.light {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.click-info-panel.light.collapsed {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.click-info-panel.light .info-title {
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

.click-info-panel.light .info-title:hover {
  background: #e2e8f0;
}

.click-info-panel.light .collapse-icon {
  color: #64748b;
}

.click-info-panel.light .info-item {
  color: #334155;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  padding: 8px 16px;
  transition: background-color 0.2s ease;
}

.click-info-panel.light .info-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

/* Dark Theme (For Cesium / Dark panels) */
.click-info-panel.dark {
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.click-info-panel.dark.collapsed {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.click-info-panel.dark .info-title {
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

.click-info-panel.dark .info-title:hover {
  background: linear-gradient(135deg, rgba(70, 70, 70, 0.7) 0%, rgba(90, 90, 90, 0.6) 100%);
}

.click-info-panel.dark .collapse-icon {
  color: #ffffff;
}

.click-info-panel.dark .info-item {
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  line-height: 1.4;
  padding: 8px 16px;
  transition: background-color 0.2s ease;
}

.click-info-panel.dark .info-item:hover {
  background-color: rgba(255, 255, 255, 0.08);
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
