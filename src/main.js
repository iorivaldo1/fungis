import { createApp } from 'vue'
import { createRouter, createWebHistory, RouterView } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import { getToken } from './utils/request.js'
// 其余视图组件均采用懒加载，避免首屏打包体积过大

// 创建路由
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Homev',
      component: Home,
      alias: '/gispros'

    },
    {
      path: '/hhgl',
      name: 'HhglLogin',
      component: () => import('./views/Hhgl/Login.vue')
    },
    {
      path: '/hhgl/tdt',
      name: 'HhglTdt',
      component: () => import('./views/Hhgl/Tdt.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/cesium',
      name: 'Cesium',
      component: RouterView,
      redirect: '/cesium/location',
      children: [
        {
          path: 'location',
          name: 'CesiumLocation',
          component: () => import('./views/Cesium/CesiumMap.vue')
        },
        {
          path: 'shader',
          name: 'CesiumShader',
          component: () => import('./views/Cesium/ShaderMap.vue')
        },
        {
          path: 'wmts-river',
          name: 'WMTS_River',
          component: () => import('./views/Cesium/WMTS_River.vue')
        },
        {
          path: 'shape-file-river',
          name: 'ShapeFileRiver',
          component: () => import('./views/Cesium/ShapeFileRiver.vue')
        },
        {
          path: 'db-river',
          name: 'DBRiver',
          component: () => import('./views/Cesium/DBRiver.vue')
        }
      ]
    },
    {
      path: '/tianditu',
      name: 'TianDiTU',
      component: RouterView,
      redirect: '/tianditu/wmts',
      children: [
        {
          path: 'wmts',
          name: 'RiverWMTS',
          component: () => import('./views/TianDiTu/RiverMap.vue')
        },
        {
          path: 'download',
          name: 'DownloadWMTS',
          component: () => import('./views/TianDiTu/DownloadWMTS.vue')
        },
        {
          path: 'database',
          name: 'DatabaseRiver',
          component: () => import('./views/TianDiTu/DatabaseRiver.vue')
        },
        {
          path: 'river-route-calc',
          name: 'RiverRouteCalc',
          component: () => import('./views/TianDiTu/RiverRouteCalc.vue')
        }
      ]
    },
    {
      path: '/baidu',
      name: 'Baidu',
      component: RouterView,
      redirect: '/baidu/topic-map',
      children: [
        {
          path: 'topic-map',
          name: 'BaiduTopicMap',
          component: () => import('./views/Baidu/CoordCal.vue')
        },
        {
          path: 'tile-slice',
          name: 'BaiduTileSlice',
          component: () => import('./views/Baidu/TileSlice.vue')
        }
      ]
    },
    {
      path: '/three',
      name: 'Three',
      component: RouterView,
      redirect: '/three/particle1',
      children: [
        {
          path: 'particle1',
          name: 'ParticleSim1',
          component: () => import('./views/ThreeJS/ParticleSim1.vue')
        },
        {
          path: 'fluid',
          name: 'FluidSimulation',
          component: () => import('./views/ThreeJS/FluidSimulation.vue')
        },
        {
          path: 'river',
          name: 'RiverSimulation',
          component: () => import('./views/ThreeJS/RiverSimulation.vue')
        }
      ]
    },
    {
      path: '/three-tdt',
      name: 'ThreeTianDiTu',
      component: RouterView,
      redirect: '/three-tdt/live-scan',
      children: [
        {
          path: 'live-scan',
          name: 'LiveSlicedTerrain',
          component: () => import('./views/ThreeTianDiTu/LiveSlicedTerrain.vue')
        },
        {
          path: 'terrainData',
          name: 'terrainData',
          component: () => import('./views/ThreeTianDiTu/terrainData.vue')
        },

      ]
    },
    {
      path: '/server-admin/login',
      name: 'ServerAdminLogin',
      component: () => import('./views/ServerAdmin/Login.vue')
    },
    {
      path: '/server-admin/status',
      name: 'ServerAdminStatus',
      component: () => import('./views/ServerAdmin/Status.vue'),
      meta: { requiresAuth: true, requireRole: 'serverAdmin' }
    }
  ]
})

/**
 * 按需加载 Cesium 资源（仅在用户首次进入 /cesium/* 路由时触发）
 *
 * 采用 Promise 标志位防止重复加载：
 *   - 首次进入 /cesium/* → 动态注入 Cesium.js + widgets.css，等待加载完成后放行
 *   - 再次进入 /cesium/* → 已加载，直接放行
 *   - 进入其他路由     → 直接放行，完全不下载 Cesium 资源
 */
let cesiumLoadPromise = null

function loadCesium() {
  if (cesiumLoadPromise) return cesiumLoadPromise

  cesiumLoadPromise = new Promise((resolve, reject) => {
    // 注入 widgets.css（非阻塞）
    const cssLink = document.createElement('link')
    cssLink.rel = 'stylesheet'
    cssLink.href = '/cesium/Widgets/widgets.css'
    document.head.appendChild(cssLink)

    // 注入 Cesium.js（等 onload 完成后才 resolve）
    const script = document.createElement('script')
    script.src = '/cesium/Cesium.js'
    script.onload = () => resolve()
    script.onerror = (e) => {
      cesiumLoadPromise = null  // 失败时重置，允许重试
      reject(new Error('Cesium.js 加载失败: ' + e))
    }
    document.head.appendChild(script)
  })

  return cesiumLoadPromise
}

// 路由守卫：鉴权控制 & 按需加载 Cesium
router.beforeEach(async (to, from, next) => {
  // 1. 鉴权拦截检查
  if (to.meta.requiresAuth) {
    const token = getToken()
    if (!token) {
      // 没找到 token 或已过期/失效，踢回相应的登录页
      if (to.path.startsWith('/server-admin')) {
        return next('/server-admin/login')
      }
      return next('/hhgl')
    }

    // Role verification for server admin
    if (to.meta.requireRole === 'serverAdmin') {
      const authority = localStorage.getItem('authority')
      if (authority !== 'serverAdmin') {
        // 如果权限不足，给出提示并踢回登录页
        alert('权限不足，需要 serverAdmin 角色')
        return next('/server-admin/login')
      }
    }
  }

  // 2. Cesium 按需加载
  if (to.path.startsWith('/cesium')) {
    try {
      await loadCesium()
    } catch (e) {
      console.error(e)
      // 加载失败时依然放行，让组件自己处理错误状态
    }
  }
  
  next()
})

const app = createApp(App)
app.use(router)
app.mount('#app')

