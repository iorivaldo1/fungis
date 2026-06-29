<template>
  <div class="database-river-page">
    <div class="no-select" id="map"></div>
    <button class="no-select control-btn" id="getDem">T</button>

    <div class="viewer-3d" id="Window_3D">
      <div class="v-header">
        <span>DEM来源:FABDEM DOM来源:天地图</span>
        <button class="viewer-ctrl-btns" id="reloadScene1">R</button>
        <button class="viewer-ctrl-btns" id="clo_con1">X</button>
      </div>
      <div class="three-container" id="threeCon1"></div>
      <div class="sh-ctr-group">
        <div class="sw-container no-select" id="sh_riv_polyline">
          <span>河流</span>
          <button class="switch switch-active">
            <span class="switch-circle circle-right"></span>
          </button>
        </div>

        <div class="sw-container no-select" id="sh_mesh_grid">
          <span>网格</span>
          <button class="switch switch-active">
            <span class="switch-circle circle-right"></span>
          </button>
        </div>

        <div class="sw-container no-select" id="sh_bridge_sphere_label">
          <span>桥梁</span>
          <button class="switch switch-active">
            <span class="switch-circle circle-right"></span>
          </button>
        </div>

        <div class="sw-container no-select" id="sh_click_query">
          <span>坐标查询</span>
          <button class="switch">
            <span class="switch-circle circle-left"></span>
          </button>
        </div>

        <div class="sw-container no-select" id="sh_click_ring">
          <span>扩散查询</span>
          <button class="switch">
            <span class="switch-circle circle-left"></span>
          </button>
        </div>

        <div class="sw-container-false no-select" id="sh_vec_tile">
          <span>矢量地图</span>
          <button class="switch">
            <span class="switch-circle circle-left"></span>
          </button>
        </div>
      </div>
    </div>

    <!-- 页面说明 -->
    <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
      <div class="info-container" v-if="showPageInfo">
        <div class="info-header">
          <div class="info-title">📌 页面说明</div>
          <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
        </div>
        <div class="info-item">1. 展示雅安河流数据及相关矢量图层</div>
        <div class="info-item">2. 支持框选范围加载3D DEM地形（FABDEM数据源）</div>
        <div class="info-item">3. 提供图层控制开关（河流、网格、桥梁等）</div>
        <div class="info-item">4. 支持坐标查询和扩散查询功能</div>
      </div>
      <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
        <span>📌</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '@/utils/request.js'

let map = null
let recTool = null
let riverList = []
let bridgeList = []
let geoMarkerList = []
let demOverLayerList = []

const showPageInfo = ref(true)
let showFlag = {
  sh_riv_polyline: true,
  sh_mesh_grid: true,
  sh_bridge_sphere_label: true,
  sh_vec_tile: false,
  sh_click_query: false,
  sh_click_ring: false
}

// 加载外部脚本
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

const initMap = async () => {
  // 确保 Tianditu API 已加载
  if (!window.T) {
    console.error('Tianditu API not loaded')
    return
  }

  map = new window.T.Map('map')
  map.disableDoubleClickZoom()
  map.centerAndZoom(new window.T.LngLat(103, 30), 15)

  const ctrl = new window.T.Control.MapType({ position: window.T_ANCHOR_BOTTOM_RIGHT })
  map.addControl(ctrl)

  // 初始化矩形选择工具
  recTool = new window.T.RectangleTool(map, {
    showLabel: false,
    fillColor: 'green',
    fillOpacity: 0.001
  })

  const fetchRiversInBounds = async () => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    
    // 清除旧河流
    riverList.forEach(item => {
      map.removeOverLay(item[0]);
    });
    riverList = [];

    const minLng = bounds.getSouthWest().lng;
    const minLat = bounds.getSouthWest().lat;
    const maxLng = bounds.getNorthEast().lng;
    const maxLat = bounds.getNorthEast().lat;

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
      const result = await api.get(`${apiBaseUrl}/get_geo_pg/geo/ya_rivers_bbox?minLng=${minLng}&minLat=${minLat}&maxLng=${maxLng}&maxLat=${maxLat}`)
      const rivers = result.data || []

      rivers.forEach(riv => {
        if (!riv.geometry) return;
        const geom = JSON.parse(riv.geometry)
        const coord_json = geom.coordinates
        const rivName = riv.name
        
        let lines = [];
        if (geom.type === 'MultiLineString') {
            lines = coord_json;
        } else if (geom.type === 'LineString') {
            lines = [coord_json];
        }

        lines.forEach(line_coords => {
            const points = line_coords.map(p => new window.T.LngLat(p[0], p[1]))
            const line = new window.T.Polyline(points, {
                color: 'red',
                weight: 0.8,
                opacity: 0.8,
                lineStyle: 'dash',
            })
            map.addOverLay(line)
            riverList.push([line, rivName])
        })
      })
    } catch (error) {
      console.error('Failed to load river data by bbox:', error)
    }
  };

  // 首次加载
  setTimeout(fetchRiversInBounds, 500);

  // 监听地图移动结束事件，重新加载范围内的河流
  map.addEventListener("moveend", fetchRiversInBounds);
}

const clearOverLays = () => {
  demOverLayerList.forEach(overlay => {
    map.removeOverLay(overlay)
  })
  demOverLayerList = []

  geoMarkerList.forEach(marker => {
    map.removeOverLay(marker)
  })
  geoMarkerList = []
}

const getBbox = () => {
  return new Promise((resolve) => {
    recTool.addEventListener('draw', (e) => {
      const bounds = e.currentBounds
      recTool.removeEventListener('draw')
      resolve(bounds)
    })
  })
}

const setupDEMButton = () => {
  const btn = document.getElementById('getDem')
  if (!btn) return

  btn.addEventListener('click', async () => {
    clearOverLays()

    const window3D = document.getElementById('Window_3D')
    if (window3D) {
      window3D.style.visibility = 'hidden'
    }

    const shCtrGroup = document.querySelector('.sh-ctr-group')
    if (shCtrGroup) {
      shCtrGroup.style.display = 'none'
    }

    recTool.removeEventListener('draw')
    recTool.clear()
    recTool.open()

    try {
      const bboxGeo = await getBbox()

      const xRange = bboxGeo.getNorthEast().lng - bboxGeo.getSouthWest().lng
      const yRange = bboxGeo.getNorthEast().lat - bboxGeo.getSouthWest().lat

      if (xRange >= 0.08 || yRange >= 0.08) {
        alert('框选范围过大！请重新选择范围')
        recTool.clear()
        return
      } else if (xRange <= 0.0003 || yRange <= 0.0003) {
        alert('框选范围过小！请重新选择范围')
        recTool.clear()
        return
      }

      console.log('Loading DEM data...')
      // TODO: 实现 DEM 数据加载和 Three.js 渲染

      recTool.clear()

    } catch (error) {
      console.error('Error processing DEM:', error)
    }
  })
}

const setupCloseButton = () => {
  const closeBtn = document.getElementById('clo_con1')
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      clearOverLays()
      const window3D = document.getElementById('Window_3D')
      if (window3D) {
        window3D.style.visibility = 'hidden'
      }
      const shCtrGroup = document.querySelector('.sh-ctr-group')
      if (shCtrGroup) {
        shCtrGroup.style.display = 'none'
      }
      recTool.clear()
    })
  }
}

onMounted(async () => {
  try {
    // 加载必需的外部脚本
    await loadScript('/tianditu.api.js')

    // 初始化地图
    await initMap()

    // 设置按钮事件
    setupDEMButton()
    setupCloseButton()

  } catch (error) {
    console.error('Failed to initialize:', error)
  }
})

onUnmounted(() => {
  if (map) {
    map = null
  }
})
</script>

<style scoped>
.database-river-page {
  width: 100%;
  height: 100%;
  position: relative;
}

#map {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: default;
}

.control-btn {
  position: absolute;
  bottom: 100px;
  left: 20px;
  z-index: 450;
  padding: 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 1);
}

.viewer-3d {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 610px;
  height: 640px;
  background-color: rgba(136, 147, 161, 0.3);
  font-weight: 700;
  z-index: 450;
  visibility: hidden;
  border-radius: 8px;
  overflow: hidden;
}

.v-header {
  user-select: none;
  padding: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.viewer-ctrl-btns {
  width: 25px;
  height: 25px;
  margin-left: 5px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-weight: bold;
}

.viewer-ctrl-btns:hover {
  background: rgba(255, 255, 255, 0.4);
}

.three-container {
  width: 600px;
  height: 600px;
  margin-left: 5px;
  margin-top: 10px;
  background: #000;
}

.sh-ctr-group {
  position: absolute;
  top: 50px;
  left: 20px;
}

.sw-container,
.sw-container-false {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: white;
  font-size: 12px;
}

.switch {
  position: relative;
  width: 40px;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.3s;
}

.switch-active {
  background: rgba(94, 206, 144, 0.5);
}

.switch-circle {
  position: absolute;
  top: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: left 0.3s;
}

.circle-left {
  left: 2px;
}

.circle-right {
  left: 22px;
}

.no-select {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -ms-user-select: none;
  user-select: none;
}

/* 页面说明样式 */
.page-info {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 450;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 15px 20px;
  min-width: 250px;
  backdrop-filter: blur(10px);
  user-select: none;
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-info.info-collapsed {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  min-width: 0;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  border-bottom: 2px solid #5ECE90;
  padding-bottom: 8px;
}

.info-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}

.close-btn {
  cursor: pointer;
  font-size: 20px;
  color: #999;
  line-height: 1;
  padding: 0 5px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #333;
}

.info-collapsed-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
}

.info-collapsed-icon:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.info-item {
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  padding-left: 8px;
}
</style>
