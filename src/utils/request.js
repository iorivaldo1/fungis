/**
 * 全局统一的请求封装（基于 Fetch）
 * 1. 自动在 Header 中拼接 Token
 * 2. 自动拦截处理 401（Token过期）等状态
 */

// Token 缓存键名
const TOKEN_KEY = 'fungis_user'

/**
 * 解析 JWT Token 的 Payload 声明
 * @param {string} token 
 * @returns {object|null}
 */
const parseJwtPayload = (token) => {
  try {
    const payloadBase64 = token.split('.')[1]
    if (!payloadBase64) return null
    // 处理 base64url 格式并解码 UTF-8
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    return null
  }
}

/**
 * 解析 JWT Token 中的 exp 过期时间
 * @param {string} token 
 * @returns {number|null} 毫秒级过期时间戳
 */
const getJwtExp = (token) => {
  const payload = parseJwtPayload(token)
  return payload && payload.exp ? payload.exp * 1000 : null
}

/**
 * 解析 JWT Token 中的 aud 目标受众/模块
 * @param {string} token 
 * @returns {string|null}
 */
const getJwtAud = (token) => {
  const payload = parseJwtPayload(token)
  return payload ? payload.aud : null
}

export const setToken = (token) => {
  // 优先解析 JWT 中的 exp，若解析失败则默认 1 小时兜底
  const expireAt = getJwtExp(token) || (Date.now() + 1 * 60 * 60 * 1000)
  const data = {
    token,
    expireAt
  }
  // 使用 sessionStorage，浏览器/标签页关闭后自动失效
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(data))
}

export const getToken = () => {
  const tokenStr = sessionStorage.getItem(TOKEN_KEY)
  if (!tokenStr) return null

  try {
    const data = JSON.parse(tokenStr)
    // 1. 检查是否超过过期时间
    if (Date.now() > data.expireAt) {
      removeToken()
      return null
    }

    // 2. 检查 aud 模块隔离（必须为合法系统模块）
    const aud = getJwtAud(data.token)
    const allowedAuds = ['fungis', 'hhgl', 'serverAdmin']
    if (aud && !allowedAuds.includes(aud)) {
      console.warn(`Token 模块不匹配 (aud=${aud})，已清除隔离 Token`)
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
  // 从本地获取 token（内置了过期检查）
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
