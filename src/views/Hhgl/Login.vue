<template>
  <div class="login-container">
    <div class="login-background"></div>
    <div class="glass-card">
      <div class="logo-area">
        <div class="icon-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2>河湖管理系统</h2>
        <p>Hhgl Management System</p>
      </div>
      <form class="login-form" @submit.prevent="handleLogin">
        <div class="input-group">
          <label for="username">用户名</label>
          <div class="input-wrapper">
            <input type="text" id="username" v-model="username" placeholder="请输入用户名" required />
          </div>
        </div>
        <div class="input-group">
          <label for="password">密码</label>
          <div class="input-wrapper">
            <input type="password" id="password" v-model="password" placeholder="请输入密码" required />
          </div>
        </div>
        <div v-if="errorMessage" class="error-msg">{{ errorMessage }}</div>
        <button type="submit" class="login-btn" :disabled="isLoading">
          <span v-if="!isLoading">立即登录</span>
          <span v-else class="loader"></span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { setToken } from '@/utils/request.js'

const router = useRouter()
const username = ref('t1')
const password = ref('123456')
const errorMessage = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username.value,
        password: password.value
      })
    })

    const data = await response.json()
    console.log('Login Response:', data)

    // 从不同可能的字段里提取 token（适配多种后端返回结构）
    const actualToken = data.token || (data.data && data.data.token) || (typeof data.data === 'string' ? data.data : null)

    // 兼容不同的成功状态码
    if (response.ok && (data.code === 200 || data.code === 0 || data.success || actualToken || data.msg === 'success' || data.message === 'success')) {
      if (actualToken) {
        setToken(actualToken)
        if (data.data) {
          localStorage.setItem('manageScope', data.data.manageScope || '')
          localStorage.setItem('authority', data.data.authority || '')
        }
      } else {
        // 防止后端没有返回 token，但通过 cookie 鉴权，我们给一个默认标识，保证能通过前端路由守卫
        setToken('cookie_or_session_auth_flag')
      }
      router.push('/hhgl/tdt')
    } else {
      errorMessage.value = data.message || data.msg || '登录失败，请检查用户名或密码'
    }
  } catch (error) {
    console.error('Login error:', error)
    // 可能是跨域或网络错误
    errorMessage.value = '网络错误，请稍后再试'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  background-color: #0f172a;
}

.login-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 15% 50%, rgba(56, 189, 248, 0.15), transparent 25%),
    radial-gradient(circle at 85% 30%, rgba(59, 130, 246, 0.15), transparent 25%);
  z-index: 1;
}

.login-background::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%233b82f6" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E');
}

.glass-card {
  position: relative;
  z-index: 2;
  width: 400px;
  padding: 40px;
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  0% {
    opacity: 0;
    transform: translateY(30px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.logo-area {
  text-align: center;
  margin-bottom: 35px;
}

.icon-wrapper {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, #38bdf8, #3b82f6);
  color: white;
  margin-bottom: 16px;
  box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3);
}

.icon-wrapper svg {
  width: 32px;
  height: 32px;
}

.logo-area h2 {
  margin: 0;
  color: #f8fafc;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 1px;
}

.logo-area p {
  margin: 8px 0 0;
  color: #94a3b8;
  font-size: 14px;
  letter-spacing: 0.5px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  color: #cbd5e1;
  font-size: 14px;
  font-weight: 500;
}

.input-wrapper {
  position: relative;
}

.input-wrapper input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #f8fafc;
  font-size: 15px;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.input-wrapper input:focus {
  outline: none;
  border-color: #38bdf8;
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
}

.input-wrapper input::placeholder {
  color: #64748b;
}

.error-msg {
  color: #ef4444;
  font-size: 14px;
  text-align: center;
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
}

.login-btn {
  margin-top: 10px;
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #38bdf8, #3b82f6);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -5px rgba(59, 130, 246, 0.4);
}

.login-btn:active {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.loader {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
