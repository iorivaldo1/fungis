/**
 * 全局统一的请求封装（基于 Fetch）
 * 1. 自动在 Header 中拼接 Token
 * 2. 自动拦截处理 401（Token过期）等状态
 */

// Token 缓存键名
const TOKEN_KEY = 'fungis_user'
// Token 有效期：1 小时 (毫秒)
const TOKEN_EXPIRE_TIME = 60 * 60 * 1000

export const setToken = (token) => {
  const data = {
    token,
    expireAt: Date.now() + TOKEN_EXPIRE_TIME
  }
  // 使用 sessionStorage，浏览器/标签页关闭后自动失效
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(data))
}

export const getToken = () => {
  const tokenStr = sessionStorage.getItem(TOKEN_KEY)
  if (!tokenStr) return null

  try {
    const data = JSON.parse(tokenStr)
    // 检查是否超过 1 小时
    if (Date.now() > data.expireAt) {
      removeToken()
      return null
    }
    return data.token
  } catch (e) {
    removeToken()
    return null
  }
}

export const removeToken = () => {
  sessionStorage.removeItem(TOKEN_KEY)
}

export const request = async (url, options = {}) => {
  // 从本地获取 token（内置了 1 小时过期检查）
  const token = getToken()

  // 初始化 headers
  const headers = new Headers(options.headers || {})

  // 如果有 token，则附加 Bearer 头
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // 默认使用 application/json
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const config = {
    ...options,
    headers
  }

  try {
    const response = await fetch(url, config)

    // 针对 401 认证失败拦截处理
    if (response.status === 401) {
      console.warn('登录态已失效，请重新登录')
      removeToken()
      window.location.href = '/hhgl' // 或者使用 router 实例跳转
      return Promise.reject(new Error('Unauthorized'))
    }

    // 假设后端接口统一返回 JSON
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Request Error:', error)
    throw error
  }
}

// 提供便携调用的快捷方法
export const api = {
  get: (url, options = {}) => request(url, { ...options, method: 'GET' }),
  post: (url, body, options = {}) => request(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (url, body, options = {}) => request(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: (url, options = {}) => request(url, { ...options, method: 'DELETE' })
}
