<template>
  <div class="tdt-container">
    <div id="mapDiv"></div>

    <!-- 左上角绘制工具栏 -->
    <div class="draw-tools">
      <button class="draw-btn" :class="{ active: activeTool === 'point' }"
        :disabled="activeTool !== null && activeTool !== 'point'" @click="handlePoint" title="画点">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="6" fill="currentColor" />
        </svg>
      </button>
      <button class="draw-btn" :class="{ active: activeTool === 'line' }"
        :disabled="activeTool !== null && activeTool !== 'line'" @click="handleLine" title="画线">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 20 10 8 16 16 22 4"></polyline>
        </svg>
      </button>
      <button class="draw-btn" :class="{ active: activeTool === 'polygon' }"
        :disabled="activeTool !== null && activeTool !== 'polygon'" @click="handlePolygon" title="画面">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 3 4 9 7 21 17 21 20 9"></polygon>
        </svg>
      </button>
      <button class="draw-btn clear-btn" @click="handleClear" title="清除绘制">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>

    <!-- 上传表单弹窗 -->
    <div class="modal-overlay" v-if="showUploadModal">
      <div class="modal-content">
        <h3>面要素上传</h3>
        <div class="form-group">
          <label>名称 (name)</label>
          <input type="text" v-model="formData.name" placeholder="请输入划界名称" />
        </div>
        <div class="form-group">
          <label>划界单位 (company)</label>
          <select v-model="formData.company">
            <option value="">请选择划界单位</option>
            <option v-for="item in dictData.company" :key="item.id" :value="item.dictValue">{{ item.dictLabel }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>划界时间 (setDate)</label>
          <input type="date" v-model="formData.setDate" />
        </div>
        <div class="form-group">
          <label>责任人 (duty)</label>
          <select v-model="formData.duty">
            <option value="">请选择责任人</option>
            <option v-for="item in dictData.duty" :key="item.id" :value="item.dictValue">{{ item.dictLabel }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>所属管理 (manage_scope)</label>
          <select v-model="formData.manageScope">
            <option value="">请选择所属管理范围</option>
            <option v-for="item in dictData.manageScope" :key="item.id" :value="item.dictValue">{{ item.dictLabel }}
            </option>
          </select>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="handleCancelUpload">取消</button>
          <button class="btn-submit" @click="handleSubmitUpload">上传</button>
        </div>
      </div>
    </div>

    <!-- 左下角定位按钮 -->
    <button class="locate-btn" @click="handleLocate" title="我的位置" :disabled="isLocating">
      <span v-if="isLocating" class="spinner"></span>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </button>

    <!-- 右上角退出按钮 -->
    <button class="exit-btn" @click="handleExit" title="退出登录">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
      <span>退出</span>
    </button>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { removeToken, api } from '@/utils/request.js'

const router = useRouter()
let mapInstance = null
let markerInstance = null
const isLocating = ref(false)

// 绘图工具相关变量
const activeTool = ref(null)
let markTool = null
let lineTool = null
let polygonTool = null

// 上传表单相关
const showUploadModal = ref(false)
const formData = ref({
  name: '',
  company: '',
  setDate: '',
  duty: '',
  manageScope: ''
})

const dictData = ref({
  company: [],
  duty: [],
  manageScope: []
})

const currentGeometry = ref(null)

const handleSubmitUpload = async () => {
  if (!formData.value.name) return alert('请输入名称')

  const payload = {
    ...formData.value,
    geometry: currentGeometry.value
  }

  console.log('即将上传到 MySQL 的数据:', payload)

  try {
    const payloadUrl = `${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/api/dmaa/upload`;
    const resData = await api.post(payloadUrl, payload);
    
    if (resData.code === 200) {
      alert('上传成功！');
      // 成功后关闭弹窗并重置表单
      showUploadModal.value = false;
      formData.value = { name: '', company: '', setDate: '', duty: '', manageScope: '' };
    } else {
      alert('上传失败: ' + resData.msg);
    }
  } catch (err) {
    console.error(err);
    alert('上传异常: ' + err.message);
  }
}

const handleCancelUpload = () => {
  showUploadModal.value = false
}

// 将天地图返回的 LngLat 数组转换为标准 WKT MULTIPOLYGON 格式
// 格式示例: MULTIPOLYGON(((104.0 30.5, 104.1 30.6, 104.2 30.5, 104.0 30.5)))
const lngLatsToWkt = (lngLats) => {
  // lngLats 可能是二维数组（PolygonTool 返回）或局部一维
  const ring = Array.isArray(lngLats[0]) ? lngLats[0] : lngLats

  const coords = ring.map(pt => {
    // 天地图返回的对象可能是 { lng, lat } 或 { x, y }
    const lng = pt.lng ?? pt.x ?? pt[0]
    const lat = pt.lat ?? pt.y ?? pt[1]
    return `${lng} ${lat}`
  })

  // 闭合：首尾点必须相同
  if (coords[0] !== coords[coords.length - 1]) {
    coords.push(coords[0])
  }

  return `MULTIPOLYGON(((${coords.join(', ')})))`
}

const loadTiandituScript = () => {
  return new Promise((resolve, reject) => {
    if (window.T) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = '/tianditu.api.js'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

const initBlinkingDot = (map, lng, lat) => {
  // SVG 格式的闪烁圆点
  const svgIcon = `data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%226%22%20fill%3D%22%233b82f6%22%20%2F%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2215%22%20fill%3D%22%233b82f6%22%20opacity%3D%220.4%22%3E%3Canimate%20attributeName%3D%22r%22%20from%3D%226%22%20to%3D%2220%22%20dur%3D%221.5s%22%20begin%3D%220s%22%20repeatCount%3D%22indefinite%22%20%2F%3E%3Canimate%20attributeName%3D%22opacity%22%20from%3D%220.6%22%20to%3D%220%22%20dur%3D%221.5s%22%20begin%3D%220s%22%20repeatCount%3D%22indefinite%22%20%2F%3E%3C%2Fcircle%3E%3C%2Fsvg%3E`

  const icon = new window.T.Icon({
    iconUrl: svgIcon,
    iconSize: new window.T.Point(40, 40),
    iconAnchor: new window.T.Point(20, 20)
  })

  const marker = new window.T.Marker(new window.T.LngLat(lng, lat), { icon: icon })
  map.addOverLay(marker)
  markerInstance = marker
}

const handleLocate = () => {
  if (!mapInstance) return

  if (navigator.geolocation) {
    isLocating.value = true
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lng = position.coords.longitude
        const lat = position.coords.latitude
        const targetLngLat = new window.T.LngLat(lng, lat)

        // 更新点的位置
        if (markerInstance) {
          markerInstance.setLngLat(targetLngLat)
        }
        // 执行 zoom and center 的动作
        mapInstance.centerAndZoom(targetLngLat, 14)
        isLocating.value = false
      },
      (error) => {
        console.warn('H5 定位失败或被拒绝', error)
        alert('定位失败，请检查浏览器定位权限。')
        isLocating.value = false
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    )
  } else {
    alert('当前浏览器不支持 H5 Geolocation')
  }
}

const handleExit = () => {
  removeToken()
  router.push('/hhgl')
}

// 绘图工具回调
const handlePoint = () => {
  if (!markTool) return
  if (activeTool.value === 'point') {
    markTool.close()
    activeTool.value = null
  } else {
    activeTool.value = 'point'
    markTool.open()
  }
}

const handleLine = () => {
  if (!lineTool) return
  if (activeTool.value === 'line') {
    lineTool.close()
    activeTool.value = null
  } else {
    activeTool.value = 'line'
    lineTool.open()
  }
}

const handlePolygon = () => {
  if (!polygonTool) return
  if (activeTool.value === 'polygon') {
    polygonTool.close()
    activeTool.value = null
  } else {
    activeTool.value = 'polygon'
    polygonTool.open()
  }
}

const handleClear = () => {
  if (activeTool.value) {
    if (activeTool.value === 'point') markTool.close()
    if (activeTool.value === 'line') lineTool.close()
    if (activeTool.value === 'polygon') polygonTool.close()
    activeTool.value = null
  }

  // 终极核弹级清除：直接清空地图上的所有覆盖物，然后把我们的定位点补回来
  if (mapInstance) {
    // 调用自带的清空函数
    mapInstance.clearOverLays()

    // 把我们的闪烁定位点重新加回地图
    if (markerInstance) {
      mapInstance.addOverLay(markerInstance)
    }
  }
}

const initMap = () => {
  if (typeof T === 'undefined') {
    console.error('TianDiTu API not loaded')
    return
  }
  const map = new window.T.Map("mapDiv")
  mapInstance = map

  // 登录后直接定位成都坐标，zoom12
  const defaultLng = 104.0665
  const defaultLat = 30.5723
  map.centerAndZoom(new window.T.LngLat(defaultLng, defaultLat), 12);

  // 在成都坐标添加闪烁点
  initBlinkingDot(map, defaultLng, defaultLat)

  // 初始化绘图工具
  markTool = new window.T.MarkTool(map, { follow: true })
  lineTool = new window.T.PolylineTool(map)
  polygonTool = new window.T.PolygonTool(map)

  // 监听原生画面完成事件（兼容双击结束的情况）
  polygonTool.addEventListener('draw', (e) => {
    if (activeTool.value === 'polygon') {
      activeTool.value = null // 自动退出画图模式
    }
    // 获取刚刚画的面的经纬度数组
    const lnglats = e.currentPolygon.getLngLats()
    currentGeometry.value = lngLatsToWkt(lnglats)
    showUploadModal.value = true // 弹出表单
  })

  // 监听右键事件：主动结束当前绘制逻辑
  map.addEventListener("rightclick", () => {
    if (activeTool.value === 'line') {
      lineTool.close()
      activeTool.value = null
    } else if (activeTool.value === 'polygon') {
      polygonTool.close()
      activeTool.value = null

      // 兜底提取面的坐标（右键提前结束时，有可能没有触发 draw 事件）
      setTimeout(() => {
        const polygons = polygonTool.getPolygons()
        if (polygons && polygons.length > 0) {
          const latestPolygon = polygons[polygons.length - 1]
          currentGeometry.value = lngLatsToWkt(latestPolygon.getLngLats())
          showUploadModal.value = true
        } else {
          alert('未能形成有效面（至少需要3个点），请重新绘制')
        }
      }, 100)
    } else if (activeTool.value === 'point') {
      markTool.close()
      activeTool.value = null
    }
  })
}

const fetchAndRenderDmaa = async () => {
  const authority = sessionStorage.getItem('authority')
  const manageScope = sessionStorage.getItem('manageScope')

  // if not admin and no manageScope, maybe don't fetch or fetch empty
  let url = `${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/api/dmaa/listByScope?manageScope=${manageScope || ''}`
  if (authority === 'admin') {
    url = `${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/api/dmaa/listAll`
  }

  try {
    const resData = await api.get(url)
    if (resData.code === 200 && resData.data) {
      console.log(resData.data)
      renderPolygons(resData.data)
    }
  } catch (err) {
    console.error('Failed to fetch DMAA data', err)
  }
}

const fetchDictData = async () => {
  try {
    const resData = await api.get(`${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/api/dmaaDict/listAll`);
    if (resData.code === 200 && resData.data) {
      if (resData.data.company) dictData.value.company = resData.data.company;
      if (resData.data.duty) dictData.value.duty = resData.data.duty;
      if (resData.data.manageScope) dictData.value.manageScope = resData.data.manageScope;
    }
  } catch (err) {
    console.error('Failed to fetch dict data', err);
  }
}

const renderPolygons = (list) => {
  if (!mapInstance) return

  const allPts = [] // 收集所有面要素的顶点

  list.forEach(item => {
    if (!item.geometry) return;

    // Parse WKT MULTIPOLYGON(((...))) or POLYGON((...))
    let coordsStr = '';
    if (item.geometry.startsWith('MULTIPOLYGON')) {
      const match = item.geometry.match(/MULTIPOLYGON\s*\(\(\((.*)\)\)\)/)
      if (match) coordsStr = match[1]
    } else if (item.geometry.startsWith('POLYGON')) {
      const match = item.geometry.match(/POLYGON\s*\(\((.*)\)\)/)
      if (match) coordsStr = match[1]
    }

    if (coordsStr) {
      const pts = coordsStr.split(',').map(pair => {
        const [lng, lat] = pair.trim().split(/\s+/)
        return new window.T.LngLat(lng, lat)
      })

      allPts.push(...pts) // 将当前面的顶点加入集合

      const polygon = new window.T.Polygon(pts, {
        color: '#3b82f6', weight: 2, opacity: 0.8, fillColor: '#3b82f6', fillOpacity: 0.2
      })
      mapInstance.addOverLay(polygon)

      // 点击多边形时显示信息弹窗
      const infoWin = new window.T.InfoWindow();
      const content = `
        <div style="font-size:13px; line-height:1.6; color:#333;">
          <div><b>名称:</b> ${item.name || ''}</div>
          <div><b>单位:</b> ${item.company || ''}</div>
          <div><b>范围:</b> ${item.manageScope || ''}</div>
          <div><b>责任人:</b> ${item.duty || ''}</div>
        </div>
      `;
      infoWin.setContent(content);

      polygon.addEventListener("click", function (e) {
        // e.lnglat 包含了鼠标点击时的坐标
        const pt = e.lnglat || pts[0];
        mapInstance.openInfoWindow(infoWin, pt);
      });
    }
  })

  // 如果有数据，调用 getViewport 获取包含所有点的最佳视野（zoom和center）并设置
  if (allPts.length > 0) {
    const viewport = mapInstance.getViewport(allPts);
    if (viewport && viewport.center) {
      mapInstance.centerAndZoom(viewport.center, viewport.zoom);
    }
  }
}

onMounted(async () => {
  try {
    await loadTiandituScript()
    initMap()
    await fetchAndRenderDmaa()
    await fetchDictData()
  } catch (error) {
    console.error('加载地图资源失败:', error)
  }
})

onUnmounted(() => {
  if (mapInstance) {
    mapInstance = null
  }
})
</script>

<style scoped>
.tdt-container {
  position: relative;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#mapDiv {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* 绘图工具栏样式 */
.draw-tools {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 450;
  display: flex;
  gap: 8px;
  background: rgba(30, 41, 59, 0.85);
  backdrop-filter: blur(8px);
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.draw-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.draw-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.draw-btn.active {
  background: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
}

.draw-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.clear-btn {
  background: rgba(239, 68, 68, 0.2);
}

.clear-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.6);
}

.locate-btn {
  position: absolute;
  bottom: 40px;
  left: 20px;
  z-index: 450;
  width: 44px;
  height: 44px;
  background-color: white;
  border: none;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #3b82f6;
  transition: all 0.2s ease;
}

/* 弹窗样式 */
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: white;
  padding: 24px;
  border-radius: 12px;
  width: 360px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-content h3 {
  margin: 0;
  color: #1e293b;
  font-size: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.form-group input,
.form-group select {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background-color: #fff;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #3b82f6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.modal-actions button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  transition: background 0.2s;
}

.btn-cancel {
  background: #f1f5f9;
  color: #475569;
}

.btn-cancel:hover {
  background: #e2e8f0;
}

.btn-submit {
  background: #3b82f6;
  color: white;
}

.btn-submit:hover {
  background: #2563eb;
}

.locate-btn:hover {
  background-color: #f8fafc;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.locate-btn:active {
  transform: translateY(0);
}

.locate-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.locate-btn svg {
  width: 24px;
  height: 24px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(59, 130, 246, 0.3);
  border-radius: 50%;
  border-top-color: #3b82f6;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.exit-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 450;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(30, 41, 59, 0.85);
  backdrop-filter: blur(8px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
}

.exit-btn:hover {
  background: rgba(220, 38, 38, 0.9);
  border-color: rgba(220, 38, 38, 1);
}

.exit-btn svg {
  width: 16px;
  height: 16px;
}
</style>
