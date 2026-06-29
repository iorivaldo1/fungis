<template>
  <div class="map-container">
    <div id="mapDiv">
      <button id="func1" @click.stop="toggleLayer">隐藏图层</button>
      <button id="river_route" @click.stop="toggleRiverRoute">获取河流路线</button>
      <div id="route_info_panel">
        <div class="panel-title">河流路径节点</div>
        <div id="route_info_body"></div>
      </div>
      <!-- 页面说明 -->
      <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }" @click.stop>
        <div class="info-container" v-if="showPageInfo">
          <div class="info-header">
            <div class="info-title">📌 页面说明</div>
            <div class="close-btn" @click.stop="showPageInfo = false" title="收起">×</div>
          </div>
          <div class="info-item">1. WMTS服务+Postgres数据库+PostGIS插件</div>
          <div class="info-item">2. 接口:/get_geo_pg/geo/ya_river_route调用postgis函数完成河流路径计算</div>
          <div class="info-item">3. 前端渲染返回的rivers</div>
        </div>
        <div class="info-collapsed-icon" v-else @click.stop="showPageInfo = true" title="展开说明">
          <span>📌</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { RiverRouteTool } from '/public/js/river_route.js';

const showPageInfo = ref(true);
let map = null;
let wmtsLayer = null;
let isWmtsVisible = true;
let riverRouteTool = null;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const baseUrl = apiBaseUrl + '/geoserver/gwc/service/wmts?';
const imageURL = baseUrl +
  'Request=GetTile' +
  '&Service=WMTS' +
  '&Version=1.0.0' +
  '&LAYER=hydro%3Aya_river' +
  '&STYLE=' +
  '&Format=image%2Fpng' +
  '&TILEMATRIXSET=EPSG%3A900913' +
  '&TILEMATRIX=EPSG%3A900913%3A{z}' +
  '&TILEROW={y}' +
  '&TILECOL={x}';

const capsUrl = apiBaseUrl + '/geoserver/hydro/wms?service=WMS&version=1.1.1&request=GetCapabilities';

function addLayer(bounds) {
  var lay = new window.T.TileLayer(imageURL, {
    minZoom: 1,
    maxZoom: 18,
    bounds: bounds
  });
  lay.setZIndex(1000);
  map.addLayer(lay);
  wmtsLayer = lay;
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

onMounted(async () => {
  try {
    await loadTiandituScript();
    
    map = new window.T.Map("mapDiv");
    map.centerAndZoom(new window.T.LngLat(103.01, 29.99), 15);

  fetch(capsUrl)
    .then(res => {
      if (!res.ok) throw new Error('GetCapabilities 请求失败: ' + res.status);
      return res.text();
    })
    .then(xmlText => {
      const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
      const layers = xml.querySelectorAll('Layer > Name');
      let bbox = null;
      layers.forEach(nameEl => {
        if (nameEl.textContent.trim() === 'ya_river') {
          const layerEl = nameEl.parentElement;
          const bb = layerEl.querySelector('LatLonBoundingBox');
          if (bb) {
            bbox = {
              minx: parseFloat(bb.getAttribute('minx')),
              miny: parseFloat(bb.getAttribute('miny')),
              maxx: parseFloat(bb.getAttribute('maxx')),
              maxy: parseFloat(bb.getAttribute('maxy'))
            };
          }
        }
      });

      if (!bbox) throw new Error('未在 Capabilities 中找到图层 ya_river 的范围');
      const f_bounds = new window.T.LngLatBounds(
        new window.T.LngLat(bbox.minx, bbox.miny),
        new window.T.LngLat(bbox.maxx, bbox.maxy)
      );
      addLayer(f_bounds);
    })
    .catch(err => {
      console.error('GetCapabilities 解析失败，使用四川兜底范围:', err);
      const fallbackBounds = new window.T.LngLatBounds(
        new window.T.LngLat(97.35, 26.05),
        new window.T.LngLat(108.55, 34.33)
      );
      addLayer(fallbackBounds);
    });

  riverRouteTool = new RiverRouteTool(map, {
    apiUrl: apiBaseUrl + '/get_geo_pg/geo/ya_river_route',
    panelSelector: '#route_info_panel',
    bodySelector: '#route_info_body'
  });
  } catch (error) {
    console.error('加载天地图资源失败:', error);
    alert('加载地图资源失败，请刷新页面重试');
  }
});

onUnmounted(() => {
  if (riverRouteTool) {
    riverRouteTool.clearRouteOverlays();
  }
});

function toggleLayer() {
  const btn = document.getElementById('func1');
  if (wmtsLayer) {
    if (isWmtsVisible) {
      map.removeLayer(wmtsLayer);
      isWmtsVisible = false;
      if (btn) btn.innerText = "显示图层";
    } else {
      map.addLayer(wmtsLayer);
      isWmtsVisible = true;
      if (btn) btn.innerText = "隐藏图层";
    }
  } else {
    alert("图层尚未加载完毕");
  }
}

function toggleRiverRoute() {
  const btn = document.getElementById('river_route');
  if (riverRouteTool) {
    riverRouteTool.toggleRouting(btn);
  }
}
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

#mapDiv {
  position: relative;
  width: 100%;
  height: 100%;
}

#func1 {
  position: absolute;
  bottom: 50px;
  left: 20px;
  z-index: 450;
  padding: 5px 10px;
  background-color: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}

#river_route {
  position: absolute;
  bottom: 50px;
  left: 110px;
  z-index: 450;
  padding: 5px 10px;
  background-color: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}

#route_info_panel {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 500;
  width: 360px;
  max-height: 420px;
  overflow-y: auto;
  display: none;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #2f80ed;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-size: 13px;
  color: #222;
}

.panel-title {
  text-align: center;
  padding: 8px 10px;
  font-weight: bold;
  background: rgba(47, 128, 237, 0.12);
  border-bottom: 1px solid rgba(47, 128, 237, 0.35);
}

#route_info_body {
  padding: 8px 10px;
}

:deep(.route-info-row) {
  display: grid;
  grid-template-columns: 42px 1fr 54px;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

:deep(.route-info-row:last-child) {
  border-bottom: none;
}

:deep(.route-info-code) {
  font-weight: bold;
  color: #0052ff;
  text-align: center;
  border-radius: 4px;
  padding: 2px 6px;
}

:deep(.route-info-desc) {
  word-break: keep-all;
  line-height: 1.4;
}

:deep(.route-locate-btn) {
  cursor: pointer;
  border: 1px solid #2f80ed;
  border-radius: 4px;
  background: #2f80ed;
  color: white;
  padding: 3px 6px;
  font-size: 12px;
}

/* 页面说明样式 */
.page-info {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 9999;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 15px 20px;
  min-width: 250px;
  backdrop-filter: blur(10px);
  user-select: none;
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-info.info-collapsed {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  min-width: 0;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  border-bottom: 2px solid #5ECE90;
  padding-bottom: 8px;
}

.info-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}

.close-btn {
  cursor: pointer;
  font-size: 20px;
  color: #999;
  line-height: 1;
  padding: 0 5px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #333;
}

.info-collapsed-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
}

.info-collapsed-icon:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.info-item {
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  padding-left: 8px;
}
</style>
