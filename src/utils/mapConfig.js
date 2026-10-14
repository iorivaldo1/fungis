/**
 * MapLibre 地图全局配置管理模块
 * 提供本地矢量瓦片切片最大级别（LOCAL_MAX_ZOOM）的动态获取与配置持久化
 */

export const DEFAULT_LOCAL_MAX_ZOOM = 14
export const STORAGE_KEY = 'fungis_maplibre_local_max_zoom'
export const STORAGE_TIME_KEY = 'fungis_maplibre_zoom_updated_at'

let cachedMaxZoom = null

/**
 * 异步获取当前配置的 MapLibre 最大瓦片层级 LOCAL_MAX_ZOOM
 * 优先级：
 * 1. 检查本地管理员/用户浏览器配置 (localStorage)
 * 2. 尝试读取服务端静态配置文件 (/config/map_config.json)
 * 3. 兜底默认值 (14)
 * 
 * @returns {Promise<number>} 当前生效的切片最大级别
 */
export const getLocalMaxZoom = async () => {
  // 1. 优先读取 localStorage 中的自定义配置
  try {
    const localVal = localStorage.getItem(STORAGE_KEY)
    if (localVal !== null && localVal !== '') {
      const parsed = parseInt(localVal, 10)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
        cachedMaxZoom = parsed
        return parsed
      }
    }
  } catch (e) {
    console.warn('[mapConfig] 读取 localStorage 失败:', e)
  }

  // 2. 尝试从服务端静态文件 /config/map_config.json 读取全局统一配置
  try {
    const res = await fetch(`/config/map_config.json?_t=${Date.now()}`, {
      headers: { 'Accept': 'application/json' }
    })
    if (res.ok) {
      const data = await res.json()
      const zoom = parseInt(data.localMaxZoom, 10)
      if (!isNaN(zoom) && zoom >= 1 && zoom <= 24) {
        cachedMaxZoom = zoom
        return zoom
      }
    }
  } catch (e) {
    // 忽略文件不存在或网络异常
  }

  // 3. 兜底默认值 14
  cachedMaxZoom = DEFAULT_LOCAL_MAX_ZOOM
  return DEFAULT_LOCAL_MAX_ZOOM
}

/**
 * 同步获取当前配置（适用于无法 await 的纯同步闭包或事件监听）
 * @returns {number}
 */
export const getLocalMaxZoomSync = () => {
  if (cachedMaxZoom !== null) {
    return cachedMaxZoom
  }
  try {
    const localVal = localStorage.getItem(STORAGE_KEY)
    if (localVal !== null && localVal !== '') {
      const parsed = parseInt(localVal, 10)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
        cachedMaxZoom = parsed
        return parsed
      }
    }
  } catch (e) {}
  return DEFAULT_LOCAL_MAX_ZOOM
}

/**
 * 保存最大层级配置
 * @param {number|string} newZoom - 新的切片最大级别
 * @returns {Promise<number>}
 */
export const saveLocalMaxZoom = async (newZoom) => {
  const val = parseInt(newZoom, 10)
  if (isNaN(val) || val < 1 || val > 24) {
    throw new Error('切片最大层级必须是 1 到 24 之间的正整数')
  }

  const updateTime = new Date().toLocaleString()
  try {
    localStorage.setItem(STORAGE_KEY, String(val))
    localStorage.setItem(STORAGE_TIME_KEY, updateTime)
  } catch (e) {
    console.error('[mapConfig] 写入 localStorage 失败:', e)
  }

  cachedMaxZoom = val

  // 静默尝试调用后端可能存在的接口（若后端后续扩展了相应保存路由）
  try {
    const authority = sessionStorage.getItem('authority') || 'serverAdmin'
    await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/api/maplibre/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': authority
      },
      body: JSON.stringify({
        localMaxZoom: val,
        updatedAt: updateTime
      })
    }).catch(() => {})
  } catch (e) {}

  return val
}

/**
 * 获取层级语义化说明文字
 * @param {number} zoom
 * @returns {string}
 */
export const getZoomDescription = (zoom) => {
  const z = parseInt(zoom, 10)
  if (z <= 10) return '全国/省级大范围宏观级别'
  if (z === 11 || z === 12) return '市级宏观范围'
  if (z === 13) return '区县级中尺度'
  if (z === 14) return '乡镇街道级 (默认已解压数据层级)'
  if (z === 15) return '高精度村庄/道路级 (需服务器已解压 15 级切片)'
  if (z >= 16) return '超高精细度 (需服务器拥有对应高层级切片)'
  return '自定义层级'
}

/**
 * 生成可在服务器上一键执行的全局同步命令
 * @param {number} zoom
 * @returns {string}
 */
export const generateServerSyncCommand = (zoom) => {
  return `mkdir -p /etc/nginx/html/fungis/config && echo '{"localMaxZoom": ${zoom}, "updatedAt": "${new Date().toISOString()}"}' > /etc/nginx/html/fungis/config/map_config.json`
}
