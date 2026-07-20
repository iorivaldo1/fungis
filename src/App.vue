<template>
  <div class="app-wrapper" :class="{ 'dark-theme': true }">
    <!-- 左侧导航 -->
    <nav v-if="!isHhglPage" class="sidebar" :class="{ collapsed: isSidebarCollapsed }">
      <div class="sidebar-header" @click="toggleSidebar">
        <div class="logo">
          <IconLogo class="logo-icon" />
          <span class="logo-text">FunGIS MAP</span>
        </div>
        <IconChevronLeft class="collapse-icon" :class="{ rotated: isSidebarCollapsed }" width="18" height="18" />
      </div>
      <transition name="slide-fade">
        <div v-show="!isSidebarCollapsed" class="menu-items">
          <router-link to="/" class="menu-item" active-class="active">
            <IconHome />
            <span class="menu-text">首页</span>
          </router-link>

          <a href="/blog.html" target="_blank" class="menu-item">
            <IconLogo />
            <span class="menu-text">我的博客</span>
          </a>

          <!-- Three+TianDitu 多级菜单 -->
          <div class="menu-group" :class="{ expanded: isThreeTdtMenuExpanded }">
            <div class="menu-item parent" @click="toggleThreeTdtMenu"
              :class="{ active: route.path.startsWith('/three-tdt') }">
              <!-- Reusing IconThree for now or need a new icon -->
              <IconThree />
              <span class="menu-text">Three+天地图</span>
              <IconArrow class="arrow-icon" :class="{ rotated: isThreeTdtMenuExpanded }" width="16" height="16" />
            </div>
            <transition name="menu-slide">
              <div v-show="isThreeTdtMenuExpanded" class="sub-menu">
                <router-link to="/three-tdt/live-scan" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">现切地形</span>
                </router-link>
                <router-link to="/three-tdt/terrainData" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">地形+数据</span>
                </router-link>

              </div>
            </transition>
          </div>

          <!-- Three.js 多级菜单 -->
          <div class="menu-group" :class="{ expanded: isThreeMenuExpanded }">
            <div class="menu-item parent" @click="toggleThreeMenu"
              :class="{ active: route.path === '/three' || route.path.startsWith('/three/') }">
              <IconThree />
              <span class="menu-text">Three.js</span>
              <IconArrow class="arrow-icon" :class="{ rotated: isThreeMenuExpanded }" width="16" height="16" />
            </div>
            <transition name="menu-slide">
              <div v-show="isThreeMenuExpanded" class="sub-menu">
                <router-link to="/three/particle1" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">粒子模拟</span>
                </router-link>
                <router-link to="/three/fluid" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">流体模拟</span>
                </router-link>
                <router-link to="/three/river" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">河流模拟</span>
                </router-link>
              </div>
            </transition>
          </div>

          <!-- 天地图多级菜单 -->
          <div class="menu-group" :class="{ expanded: isRiverMenuExpanded }">
            <div class="menu-item parent" @click="toggleRiverMenu" :class="{ active: route.path.startsWith('/river') }">
              <IconRiver />
              <span class="menu-text">天地图</span>
              <IconArrow class="arrow-icon" :class="{ rotated: isRiverMenuExpanded }" width="16" height="16" />
            </div>
            <transition name="menu-slide">
              <div v-show="isRiverMenuExpanded" class="sub-menu">
                <router-link to="/tianditu/wmts" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">WMTS河流</span>
                </router-link>
                <router-link to="/tianditu/database" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">数据库河流</span>
                </router-link>
                <router-link to="/tianditu/river-route-calc" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">河流路径计算</span>
                </router-link>
                <router-link to="/tianditu/download" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">下载WMTS影像</span>
                </router-link>
              </div>
            </transition>
          </div>

          <!-- Baidu 多级菜单 -->
          <div class="menu-group" :class="{ expanded: isBaiduMenuExpanded }">
            <div class="menu-item parent" @click="toggleBaiduMenu" :class="{ active: route.path.startsWith('/baidu') }">
              <IconRiver />
              <span class="menu-text">百度地图V3</span>
              <IconArrow class="arrow-icon" :class="{ rotated: isBaiduMenuExpanded }" width="16" height="16" />
            </div>
            <transition name="menu-slide">
              <div v-show="isBaiduMenuExpanded" class="sub-menu">
                <router-link to="/baidu/topic-map" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">百度矢量投影</span>
                </router-link>
                <router-link to="/baidu/tile-slice" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">百度栅格投影</span>
                </router-link>
              </div>
            </transition>
          </div>


          <!-- 空间算法 多级菜单 -->
          <div class="menu-group" :class="{ expanded: isAlgorithmMenuExpanded }">
            <div class="menu-item parent" @click="toggleAlgorithmMenu"
              :class="{ active: route.path.startsWith('/algorithm') }">
              <IconWrench />
              <span class="menu-text">空间算法</span>
              <IconArrow class="arrow-icon" :class="{ rotated: isAlgorithmMenuExpanded }" width="16" height="16" />
            </div>
            <transition name="menu-slide">
              <div v-show="isAlgorithmMenuExpanded" class="sub-menu">
                <router-link to="/algorithm/quadtree" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">四叉树查询</span>
                </router-link>
                <a href="https://www.fungis.site/algorithm-board/" target="_blank" class="menu-item sub">
                  <div class="sub-dot"></div>
                  <span class="menu-text">数据结构</span>
                </a>
              </div>
            </transition>
          </div>

          <!-- Cesium 多级菜单 -->
          <div class="menu-group" :class="{ expanded: isCesiumMenuExpanded }" >
            <div class="menu-item parent" @click="toggleCesiumMenu"
              :class="{ active: route.path.startsWith('/cesium') }">
              <IconCesium />
              <span class="menu-text">Cesium</span>
              <IconArrow class="arrow-icon" :class="{ rotated: isCesiumMenuExpanded }" width="16" height="16" />
            </div>
            <transition name="menu-slide">
              <div v-show="isCesiumMenuExpanded" class="sub-menu">
                <router-link to="/cesium/location" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">三维定位</span>
                </router-link>
                <router-link to="/cesium/shader" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">Shader 特效</span>
                </router-link>
                <router-link to="/cesium/wmts-river" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">WMTS河流</span>
                </router-link>
                <router-link to="/cesium/shape-file-river" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">ShapeFile河流</span>
                </router-link>
                <router-link to="/cesium/db-river" class="menu-item sub" active-class="active">
                  <div class="sub-dot"></div>
                  <span class="menu-text">DB河流</span>
                </router-link>
              </div>
            </transition>
          </div>


        </div>
      </transition>

      <!-- 底部系统设置 -->
      <div class="sidebar-footer">
        <router-link to="/server-admin/login" class="menu-item gear-item" active-class="active" title="系统服务器状态">
          <IconGear />
          <span class="menu-text" v-show="!isSidebarCollapsed">服务器监控</span>
        </router-link>
      </div>
    </nav>

    <!-- 右侧主体 -->
    <main class="main-content">
      <!-- 视图区域 -->
      <div class="router-view-container" v-if="isReady">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { setToken } from '@/utils/request.js'
import IconLogo from './components/icons/IconLogo.vue'
import IconChevronLeft from './components/icons/IconChevronLeft.vue'
import IconHome from './components/icons/IconHome.vue'
import IconCesium from './components/icons/IconCesium.vue'
import IconArrow from './components/icons/IconArrow.vue'
import IconRiver from './components/icons/IconRiver.vue'
import IconThree from './components/icons/IconThree.vue'
import IconWrench from './components/icons/IconWrench.vue'
import IconGear from './components/icons/IconGear.vue'

const route = useRoute()
const isHhglPage = computed(() => route.path.startsWith('/hhgl'))
const isSidebarCollapsed = ref(false)
const isCesiumMenuExpanded = ref(route.path.startsWith('/cesium'))
const isRiverMenuExpanded = ref(route.path.startsWith('/river'))
const isBaiduMenuExpanded = ref(route.path.startsWith('/baidu'))
const isThreeMenuExpanded = ref(route.path === '/three' || route.path.startsWith('/three/'))
const isAlgorithmMenuExpanded = ref(route.path.startsWith('/algorithm'))
const isReady = ref(false)

onMounted(async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/get_geo_pg/fungis_user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'fch',
        password: 'testpw'
      })
    })
    const data = await response.json()
    if (response.ok && data.data && data.data.token) {
      setToken(data.data.token)
      console.log('自动获取 fungis_user token 成功')
    }
  } catch (error) {
    console.error('Auto login failed:', error)
  } finally {
    isReady.value = true
  }
})

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

const toggleCesiumMenu = () => {
  isCesiumMenuExpanded.value = !isCesiumMenuExpanded.value
}

const toggleRiverMenu = () => {
  isRiverMenuExpanded.value = !isRiverMenuExpanded.value
}

const toggleBaiduMenu = () => {
  isBaiduMenuExpanded.value = !isBaiduMenuExpanded.value
}

const toggleThreeMenu = () => {
  isThreeMenuExpanded.value = !isThreeMenuExpanded.value
}

const toggleAlgorithmMenu = () => {
  isAlgorithmMenuExpanded.value = !isAlgorithmMenuExpanded.value
}

// Ensure unique state for each menu
const isThreeTdtMenuExpanded = ref(route.path.startsWith('/three-tdt'))
const toggleThreeTdtMenu = () => {
  isThreeTdtMenuExpanded.value = !isThreeTdtMenuExpanded.value
}

const currentRouteName = computed(() => {
  const nameMap = {
    'Homev': '首页',
    'Home': '首页',
    'Cesium': 'Cesium',
    'CesiumLocation': '三维定位',
    'CesiumShader': 'Shader 特效',
    'WMTS_River': 'WMTS河流',
    'ShapeFileRiver': 'ShapeFile河流',
    'River': '天地图',
    'RiverWMTS': 'WMTS河流',
    'DownloadWMTS': '下载WMTS影像',
    'DatabaseRiver': '数据库河流',
    'RiverRouteCalc': '河流路径计算',
    'Baidu': '百度地图',
    'BaiduTopicMap': '百度坐标转换',
    'BaiduTileSlice': '百度坐标系切片',
    'Three': 'Three.js',
    'ParticleSim1': '粒子模拟',
    'FluidSimulation': '流体模拟',
    'RiverSimulation': '河流模拟',
    'ThreeTianDitu': 'Three+TianDitu',
    'LiveSlicedTerrain': '现切地形',
    'ServerAdminLogin': '服务器监控登录',
    'ServerAdminStatus': '服务器监控状态',
    'Algorithm': '空间算法',
    'QuadTree': '四叉树查询'
  }
  return nameMap[route.name] || route.name || '未知'
})


</script>

<style>
:root {
  --bg-dark: #00392E;
  --bg-grey: #004D40;
  --sidebar-width: 240px;
  --header-height: 50px;
  --text-main: #DBF6DE;
  --text-muted: #42B59A;
  --accent-color: #5ECE90;
  --border-color: #008E5E;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-dark);
  color: var(--text-main);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
}

/* 侧边栏样式 */
.sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background: linear-gradient(160deg,
      #002a20 0%,
      #004d3a 35%,
      #006b50 65%,
      #003d2e 100%);
  border-right: 1px solid rgba(94, 206, 144, 0.12);
  display: flex;
  flex-direction: column;
  z-index: 1001;
  box-shadow: 4px 0 24px rgba(0, 30, 20, 0.5);
  border-radius: 0;
  overflow: hidden;
  transition: all 0.3s ease;
  position: relative;
  transform: translateX(0);
  user-select: none;
}

.sidebar.collapsed {
  transform: translateX(calc(-1 * var(--sidebar-width) + 50px));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.sidebar-header {
  color: var(--text-main);
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  padding: 0;
  background: rgba(0, 77, 64, 0.4);
  border-bottom: 1px solid rgba(219, 246, 222, 0.1);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.3s ease;
  height: var(--header-height);
}

.sidebar-header:hover {
  background: rgba(0, 77, 64, 0.6);
}

.collapse-icon {
  transition: transform 0.3s ease;
  flex-shrink: 0;
  margin-right: 12px;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

.logo {
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 10px;
  flex: 1;
}

.logo img,
.logo .logo-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.logo span {
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 1px;
  color: var(--accent-color);
}

.menu-items {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  color: rgba(255, 255, 255, 0.95);
  text-decoration: none;
  transition: background-color 0.2s ease;
  gap: 12px;
  font-size: 14px;
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  line-height: 1.4;
}

.sidebar-footer {
  margin-top: auto;
  border-top: 1px solid rgba(219, 246, 222, 0.1);
  padding: 8px 0;
}

.gear-item {
  justify-content: flex-start;
}

.sidebar.collapsed .gear-item {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

.menu-item:hover {
  background-color: rgba(94, 206, 144, 0.15);
  color: var(--text-main);
}

.menu-item svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.menu-item.active {
  background-color: rgba(94, 206, 144, 0.2);
  color: var(--accent-color);
  border-left: 3px solid var(--accent-color);
}

/* 多级菜单样式 */
.menu-group {
  display: flex;
  flex-direction: column;
}

.menu-item.parent {
  cursor: pointer;
  justify-content: space-between;
}

.arrow-icon {
  margin-left: auto;
  transition: transform 0.3s ease;
  opacity: 0.7;
}

.arrow-icon.rotated {
  transform: rotate(90deg);
}

.sub-menu {
  overflow: hidden;
  background-color: rgba(0, 57, 46, 0.5);
}

.menu-item.sub {
  padding-left: 52px;
  font-size: 13px;
  height: 40px;
}

.sub-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: currentColor;
  opacity: 0.5;
  margin-right: 8px;
}

.menu-item.sub.active .sub-dot {
  opacity: 1;
  box-shadow: 0 0 8px var(--accent-color);
}

/* 子菜单过渡 */
.menu-slide-enter-active,
.menu-slide-leave-active {
  transition: all 0.3s ease-out;
  max-height: 300px;
}

.menu-slide-enter-from,
.menu-slide-leave-to {
  max-height: 0;
  opacity: 0;
}

/* 过渡动画 */
.slide-fade-enter-active {
  transition: all 0.3s ease;
}

.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  transform: translateY(-5px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateY(-5px);
  opacity: 0;
}

/* 主体内容样式 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  transition: margin-left 0.3s ease;
  margin-left: 0;
}

.sidebar.collapsed~.main-content {
  margin-left: calc(-1 * var(--sidebar-width) + 50px);
}

.top-header {
  height: var(--header-height);
  background-color: var(--bg-grey);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  z-index: 1000;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.breadcrumb-item {
  cursor: pointer;
  color: var(--text-muted);
  transition: color 0.3s;
}

.breadcrumb-item:hover {
  color: var(--text-main);
}

.breadcrumb-item.active {
  color: var(--text-main);
  cursor: default;
}

.separator {
  color: var(--text-muted);
}

.user-info {
  font-size: 14px;
  color: var(--text-muted);
}

.router-view-container {
  flex: 1;
  overflow: auto;
  position: relative;
}
</style>
