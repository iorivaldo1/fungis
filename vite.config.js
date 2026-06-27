import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import cesium from 'vite-plugin-cesium'

/**
 * 自定义插件：完全移除 vite-plugin-cesium 注入的阻塞脚本标签
 *
 * vite-plugin-cesium 会在 <head> 注入：
 *   <script src="/cesium/Cesium.js"></script>         ← 同步阻塞，1.6MB
 *   <link rel="stylesheet" href=".../widgets.css">    ← CSS 阻塞
 *
 * 优化策略（按需加载）：
 *   - 完全删除 Cesium.js 的 <script> 标签，不再全局下载
 *   - Cesium.js 改由路由守卫（main.js）在用户进入 /cesium/* 时才动态注入
 *   - widgets.css 同理，改为路由进入时按需非阻塞加载
 *   - 首页、Three.js 等页面完全不下载 Cesium 资源（节省 1.6MB）
 */
function removeCesiumInjectPlugin() {
  return {
    name: 'remove-cesium-inject',
    enforce: 'post',   // 必须在 cesium 插件之后执行
    transformIndexHtml(html) {
      // 1. 完全移除 Cesium.js 的 <script> 标签（改为路由按需加载）
      html = html.replace(
        /<script\s+src="[^"]*cesium\/Cesium\.js"[^>]*><\/script>\n?/gi,
        ''
      )
      // 2. 完全移除 widgets.css 的 <link> 标签（改为路由按需加载）
      html = html.replace(
        /<link\s+rel="stylesheet"\s+href="([^"]*widgets\.css)">\n?/gi,
        ''
      )
      // 3. 移除 three-vendor 的 modulepreload
      //    首页完全不使用 Three.js，但 modulepreload 会让浏览器立刻下载 three-vendor，
      //    与 vue-vendor/index.js 竞争带宽，直接导致 LCP 元素渲染延迟飙升。
      //    three-vendor 只在用户真正访问 /three/* /three-tdt/* 路由时才会被按需加载。
      html = html.replace(
        /<link\s+rel="modulepreload"\s+crossorigin\s+href="[^"]*three-vendor[^"]*">\n?/gi,
        ''
      )
      // 4. 提升 vue-vendor 的下载优先级，确保 Vue 核心包最先被浏览器处理
      html = html.replace(
        /(<link\s+rel="modulepreload"\s+crossorigin\s+href="([^"]*vue-vendor[^"]*")>)/gi,
        ''
      )
      return html
    }
  }
}


export default defineConfig(({ mode }) => {
  // 加载环境变量，根据当前工作目录和 mode (例如 development)
  const env = loadEnv(mode, process.cwd(), '')
  // 如果 .env 里配置了 VITE_PROXY_TARGET，就用它；否则默认指向 8080
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [
      vue(),
      cesium(),
      removeCesiumInjectPlugin()
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    build: {
      outDir: 'fungis',
      assetsDir: 'assets',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          blog: resolve(__dirname, 'blog.html')
        },
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router'],
            'three-vendor': ['three']
          }
        }
      }
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/geoserver': {
          target: 'http://localhost:8080',
          changeOrigin: true
        },

        '/get_geo_pg': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  }
})
