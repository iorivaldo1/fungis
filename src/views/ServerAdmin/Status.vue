<template>
  <div class="status-dashboard">
    <header class="dashboard-header">
      <div class="header-content">
        <div class="icon-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
        </div>
        <div class="title-container">
          <div>
            <h2>系统服务器状态监控</h2>
            <p>Real-time Services Status Monitoring</p>
          </div>
          <button class="refresh-btn" @click="handleRefresh" :disabled="loading" title="手动刷新">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" :class="{ 'spin': loading }">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        </div>
      </div>
      <button class="logout-btn" @click="handleLogout">
        退出登录
      </button>
    </header>

    <div class="metrics-grid">
      <!-- 整体服务器状态 -->
      <div class="metric-card server-card">
        <div class="card-header">
          <div class="service-info">
            <div class="service-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg></div>
            <h3>宿主机状态</h3>
          </div>
          <span class="status-badge" :class="status.server.state">
            <span class="pulse-dot"></span>
            {{ status.server.state === 'online' ? '运行中' : '异常' }}
          </span>
        </div>
        <div class="card-body" v-if="!loading">
          <div class="stat-row">
            <span>CPU 使用率</span>
            <div class="progress-bar-bg">
              <div class="progress-bar" :style="{ width: status.server.cpu + '%' }"
                :class="getCpuColor(status.server.cpu)"></div>
            </div>
            <span class="stat-value">{{ status.server.cpu }}%</span>
          </div>
          <div class="stat-row"
            :title="status.server.usedMemoryStr ? (status.server.usedMemoryStr + ' / ' + status.server.totalMemoryStr) : ''">
            <span>内存使用率</span>
            <div class="progress-bar-bg">
              <div class="progress-bar" :style="{ width: status.server.memory + '%' }"
                :class="getCpuColor(status.server.memory)"></div>
            </div>
            <span class="stat-value" style="width: auto; min-width: 40px;">
              {{ status.server.memory }}%
              <small v-if="status.server.usedMemoryStr" style="color: #94a3b8; font-size: 12px; margin-left: 4px;">({{ status.server.usedMemoryStr }} / {{ status.server.totalMemoryStr }})</small>
            </span>
          </div>
          <div class="stat-row mt">
            <span>运行时间</span>
            <span class="stat-value">{{ status.server.uptime }}</span>
          </div>
        </div>
        <div class="skeleton-loader" v-else></div>
      </div>

      <!-- Java Services -->
      <div class="metric-card">
        <div class="card-header">
          <div class="service-info">
            <div class="service-icon spring-icon">J</div>
            <h3>Java 进程</h3>
          </div>
          <span class="status-badge" :class="status.springboot.state">
            <span class="pulse-dot"></span>
            {{ status.springboot.state === 'online' ? '运行中' : '异常' }}
          </span>
        </div>
        <div class="card-body" v-if="!loading">
          <div class="stat-row">
            <span>JVM 内存</span>
            <div class="progress-bar-bg">
              <div class="progress-bar bg-success"
                :style="{ width: (status.springboot.memory / 4096 * 100).toFixed(0) + '%' }"></div>
            </div>
            <span class="stat-value">{{ status.springboot.memory }} MB</span>
          </div>

          <div class="app-list-container mt" style="margin-top: 12px; padding-top: 12px;">
            <div class="app-list-title">系统运行中的 Java 服务 ({{ status.springboot.processes?.length || 0 }})</div>
            <div class="app-list" style="max-height: 180px;">
              <div v-for="proc in status.springboot.processes" :key="proc.pid" class="app-item">
                <div class="app-name" style="word-break: break-all; font-size: 12px; padding-right: 8px;">{{ proc.name
                  || 'java.exe' }}</div>
                <div class="app-status running" style="flex-shrink: 0;">
                  <span class="status-dot"></span>
                  PID: {{ proc.pid }}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="skeleton-loader" v-else></div>
      </div>

      <!-- Tomcat -->
      <div class="metric-card">
        <div class="card-header">
          <div class="service-info">
            <div class="service-icon tomcat-icon">T</div>
            <h3>Tomcat</h3>
          </div>
          <span class="status-badge" :class="status.tomcat.state">
            <span class="pulse-dot"></span>
            {{ status.tomcat.state === 'online' ? '运行中' : '异常' }}
          </span>
        </div>
        <div class="card-body" v-if="!loading">
          <div class="stat-box-container">
            <div class="stat-box">
              <span class="label">线程池</span>
              <span class="value">{{ status.tomcat.threads }}</span>
            </div>
            <div class="stat-box">
              <span class="label">请求吞吐量</span>
              <span class="value">{{ status.tomcat.tps }} /s</span>
            </div>
          </div>
          <div class="stat-row mt">
            <span>会话数量</span>
            <span class="stat-value">{{ status.tomcat.sessions }}</span>
          </div>
          <div class="app-list-container mt">
            <div class="app-list-title">已部署服务 ({{ status.tomcat.apps.length }})</div>
            <div class="app-list">
              <div v-for="(app, index) in status.tomcat.apps" :key="index" class="app-item">
                <div class="app-name">{{ app.name }}</div>
                <div class="app-status" :class="app.status">
                  <span class="status-dot"></span>
                  {{ app.status === 'running' ? '运行中' : '已停止' }}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="skeleton-loader" v-else></div>
      </div>

      <!-- GeoServer -->
      <div class="metric-card">
        <div class="card-header">
          <div class="service-info">
            <div class="service-icon geo-icon">G</div>
            <h3>GeoServer</h3>
          </div>
          <span class="status-badge" :class="status.geoserver.state">
            <span class="pulse-dot"></span>
            {{ status.geoserver.state === 'online' ? '运行中' : '异常' }}
          </span>
        </div>
        <div class="card-body" v-if="!loading">
          <div class="stat-box-container" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div class="stat-box">
              <span class="label">WMTS 响应</span>
              <span class="value">{{ status.geoserver.wmsLatency }}ms</span>
            </div>
            <div class="stat-box">
              <span class="label">GWC 缓存</span>
              <span class="value">{{ status.geoserver.cache }} MB</span>
            </div>
            <div class="stat-box">
              <span class="label">GPW 缓存</span>
              <span class="value">{{ status.geoserver.gpwCache }} MB</span>
            </div>
          </div>
          <div class="stat-row mt">
            <span>正在处理请求</span>
            <span class="stat-value">{{ status.geoserver.processing }}</span>
          </div>
        </div>
        <div class="skeleton-loader" v-else></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { setToken, api } from '@/utils/request.js'

const router = useRouter()
const loading = ref(true)

const status = ref({
  server: { state: 'online', cpu: 0, memory: 0, uptime: '0天 0小时', totalMemoryStr: '0 GB', usedMemoryStr: '0 GB' },
  springboot: { state: 'online', latency: 0, connections: 0, memory: 0, processes: [] },
  tomcat: { state: 'online', threads: 0, tps: 0, sessions: 0, apps: [] },
  geoserver: { state: 'online', wmsLatency: 0, cache: 0, gpwCache: 0, processing: 0 }
})

const handleRefresh = async () => {
  if (loading.value) return;
  loading.value = true;
  await updateMetrics();
  loading.value = false;
}

const fetchStatus = async () => {
  try {
    await updateMetrics()
  } catch (e) {
    console.error('Initial fetch failed', e)
  } finally {
    loading.value = false
  }
}

const updateMetrics = async () => {
  try {
    const res = await api.get(`${import.meta.env.VITE_API_BASE_URL}/get_geo_pg/server/status`)
    if (res && res.code === 200 && res.data) {
      status.value = res.data
    }
  } catch (error) {
    console.error('获取服务器状态失败:', error)
  }
}

const getCpuColor = (value) => {
  if (value > 85) return 'bg-danger'
  if (value > 70) return 'bg-warning'
  return 'bg-success'
}

const handleLogout = () => {
  setToken('')
  localStorage.removeItem('authority')
  router.push('/')
}

onMounted(() => {
  fetchStatus()
})
</script>

<style scoped>
.status-dashboard {
  padding: 30px;
  background-color: #0b1120;
  min-height: 100vh;
  color: #e2e8f0;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-wrapper {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 16px -4px rgba(16, 185, 129, 0.3);
}

.icon-wrapper svg {
  width: 24px;
  height: 24px;
  color: white;
}

.dashboard-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #f8fafc;
}

.title-container {
  display: flex;
  align-items: center;
  gap: 20px;
}

.dashboard-header p {
  margin: 4px 0 0;
  font-size: 14px;
  color: #94a3b8;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.logout-btn {
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.metric-card {
  background: #1e293b;
  border-radius: 16px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.metric-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.4);
}

.server-card {
  grid-column: 1 / -1;
  background: linear-gradient(145deg, #1e293b, #0f172a);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.service-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.service-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  background: #334155;
  color: #cbd5e1;
}

.service-icon svg {
  width: 20px;
  height: 20px;
}

.spring-icon {
  background: rgba(104, 189, 69, 0.2);
  color: #68bd45;
}

.tomcat-icon {
  background: rgba(246, 210, 88, 0.2);
  color: #f6d258;
}

.geo-icon {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.online {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.status-badge.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
}

.status-badge.online .pulse-dot {
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }

  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }

  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
}

.stat-row>span:first-child {
  width: 80px;
  color: #94a3b8;
}

.progress-bar-bg {
  flex: 1;
  height: 6px;
  background: #334155;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease, background-color 0.5s ease;
}

.bg-success {
  background: #10b981;
}

.bg-warning {
  background: #f59e0b;
}

.bg-danger {
  background: #ef4444;
}

.stat-value {
  width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.stat-box-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-box {
  background: #0f172a;
  padding: 16px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.02);
}

.stat-box .label {
  font-size: 13px;
  color: #94a3b8;
}

.stat-box .value {
  font-size: 20px;
  font-weight: 600;
  color: #f8fafc;
  font-variant-numeric: tabular-nums;
}

.mt {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}

.skeleton-loader {
  height: 150px;
  background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 12px;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

.app-list-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-list-title {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

.app-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
  padding-right: 4px;
}

.app-list::-webkit-scrollbar {
  width: 4px;
}

.app-list::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}

.app-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.02);
  transition: background 0.2s;
}

.app-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.app-name {
  font-size: 13px;
  color: #cbd5e1;
  font-weight: 500;
}

.app-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.app-status.running {
  color: #10b981;
}

.app-status.stopped {
  color: #94a3b8;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

@media (min-width: 1200px) {
  .server-card {
    grid-column: span 1;
  }
}
</style>
