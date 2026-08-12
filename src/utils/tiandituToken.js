import { getToken } from './request.js'

let cachedToken = null

/**
 * 从后端获取天地图 Token 配置文件中的最新 Key
 */
export const getTiandituToken = async () => {
  try {
    const url = `${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/api/tianditu/token`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.code === 200 && data.data?.token) {
        cachedToken = data.data.token
        window.TMAP_AUTHKEY = cachedToken
        if (window.T?.setAuthKey) {
          window.T.setAuthKey(cachedToken)
        }
        return cachedToken
      }
    }
  } catch (err) {
    console.warn('获取后端天地图 Token 失败，将使用默认/当前 Token', err)
  }

  // 兜底策略
  const fallback = cachedToken || window.TMAP_AUTHKEY || '73a87062ca36baaed0feebe7989f453a'
  window.TMAP_AUTHKEY = fallback
  return fallback
}

/**
 * 切换/更新天地图 Token（需要管理员角色鉴权）
 * @param {string} newToken - 新的 Token 密钥
 */
export const switchTiandituToken = async (newToken) => {
  if (!newToken || !newToken.trim()) {
    throw new Error('Token 密钥不能为空')
  }

  const cleanToken = newToken.trim()
  const authority = sessionStorage.getItem('authority') || 'serverAdmin'
  const userToken = getToken() || ''

  const url = `${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/api/tianditu/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': userToken ? `Bearer ${userToken}` : `serverAdmin`,
      'x-user-role': authority
    },
    body: JSON.stringify({
      token: cleanToken,
      role: authority,
      authority: authority
    })
  })

  const resData = await res.json()
  if (res.status === 403 || resData.code === 403) {
    throw new Error(resData.msg || '权限拒绝：修改天地图 Token 需要后台管理员(serverAdmin)权限')
  }

  if (!res.ok || resData.code !== 200) {
    throw new Error(resData.msg || '切换 Token 失败')
  }

  // 更新成功
  cachedToken = cleanToken
  window.TMAP_AUTHKEY = cleanToken
  if (window.T?.setAuthKey) {
    window.T.setAuthKey(cleanToken)
  }

  return resData
}

/**
 * 动态异步加载 tianditu.api.js 脚本
 * 加载前自动拉取最新的 Token 配置文件
 */
export const loadTiandituScript = async () => {
  // 先异步拉取最新的 Token
  const token = await getTiandituToken()

  if (window.T && window.T.Map) {
    if (window.T.setAuthKey) {
      window.T.setAuthKey(token)
    }
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    // 检查是否已有脚本标签正在加载
    const existingScript = document.querySelector('script[src="/tianditu.api.js"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.T?.setAuthKey && window.TMAP_AUTHKEY) {
          window.T.setAuthKey(window.TMAP_AUTHKEY)
        }
        resolve()
      })
      existingScript.addEventListener('error', (err) => reject(err))
      return
    }

    const script = document.createElement('script')
    script.src = '/tianditu.api.js'
    script.onload = () => {
      if (window.T?.setAuthKey && window.TMAP_AUTHKEY) {
        window.T.setAuthKey(window.TMAP_AUTHKEY)
      }
      resolve()
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}
