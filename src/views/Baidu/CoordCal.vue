<template>
  <div class="baidu-coord-page">
    <div class="top-panels">
      <div class="control-panel">
        <div class="instructions">
          <p>1. 输入框必须输入底层float坐标：小数点后14-16位</p>
        </div>
        <div class="input-row">
          <label>经度(WGS84):</label>
          <input type="text" v-model.number="inputLng" placeholder="如 103.00776047764998" style="width: 160px;">
          <label>纬度:</label>
          <input type="text" v-model.number="inputLat" placeholder="如 29.98998525259998" style="width: 160px;">
          <button @click="handleAddPoint">确定</button>
        </div>
        <div class="result-row" v-if="resultHtml" v-html="resultHtml"></div>
      </div>
      <div class="image-panel">
        <img src="/images/CoordCal_p1.png" alt="说明图片" />
      </div>
    </div>
    <div id="baiduMapContainer"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { loadBaiduMapScript, wgs84ToGcj02, gcj02ToBd09, bd09mcToLngLat } from '@/utils/baiduUtils'

const BAIDU_AK = 'MUBHlQKKLvig0Ia3QEAOzio46qq6foiT'

const inputLng = ref(103.00776047764998)
const inputLat = ref(29.98998525259998)
const resultHtml = ref('')

let map = null
let pointRecords = []

const BD09MC_R = 6370996.81;

function bd09ToBd09mc_sphere(lng, lat) {
  const x = lng * Math.PI / 180.0 * BD09MC_R;
  const latClamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const y = Math.log(Math.tan(Math.PI / 4.0 + latClamped * Math.PI / 360.0)) * BD09MC_R;
  return { x, y };
}

function wgs84ToBd09mc_sphere(lng, lat) {
  const gcj = wgs84ToGcj02(lng, lat);
  const bd = gcj02ToBd09(gcj[0], gcj[1]);
  return bd09ToBd09mc_sphere(bd[0], bd[1]);
}

function getRadius() {
  if (!map) return 0;
  const zoom = map.getZoom();
  const metersPerPixel = Math.pow(2, 18 - zoom) * 0.6;
  return metersPerPixel * 8;
}

function handleAddPoint() {
  const lng = inputLng.value;
  const lat = inputLat.value;

  if (isNaN(lng) || isNaN(lat)) {
    alert('请输入有效的经纬度数值');
    return;
  }

  const gcj = wgs84ToGcj02(lng, lat);
  const bd09 = gcj02ToBd09(gcj[0], gcj[1]);

  const mc = wgs84ToBd09mc_sphere(lng, lat);
  const mcBack = bd09mcToLngLat(mc.x, mc.y);

  resultHtml.value =
    `<span class="red">● 原始(WGS84)</span><br>` +
    `<span class="green">● 转换(BD-09)</span><br>` +
    `<span class="blue">● 正球体(BD-09MC)</span>`;

  addPoints(lng, lat, bd09[0], bd09[1], mcBack.lng, mcBack.lat);
}

function addPoints(wgsLng, wgsLat, bdLng, bdLat, blueLng, blueLat) {
  if (!map) return;
  const radius = getRadius();
  const BMap = window.BMap || window.BMapGL;

  const ptRed = new BMap.Point(wgsLng, wgsLat);
  const circleRed = new BMap.Circle(ptRed, radius, {
    strokeColor: '#ff3333',
    strokeWeight: 1,
    fillColor: '#ff3333',
    fillOpacity: 0.8
  });
  const labelRed = new BMap.Label('WGS84', {
    offset: new BMap.Size(10, -10)
  });
  labelRed.setStyle({
    border: 'none', backgroundColor: 'rgba(255,200,200,0.9)', color: '#cc0000',
    fontSize: '11px', padding: '2px 6px', borderRadius: '3px'
  });
  const markerRed = new BMap.Marker(ptRed, {
    icon: new BMap.Icon('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', new BMap.Size(1, 1))
  });
  markerRed.setLabel(labelRed);

  const ptGreen = new BMap.Point(bdLng, bdLat);
  const circleGreen = new BMap.Circle(ptGreen, radius, {
    strokeColor: '#00aa00',
    strokeWeight: 1,
    fillColor: '#00cc00',
    fillOpacity: 0.8
  });
  const labelGreen = new BMap.Label('BD-09', {
    offset: new BMap.Size(10, -10)
  });
  labelGreen.setStyle({
    border: 'none', backgroundColor: 'rgba(200,255,200,0.9)', color: '#006600',
    fontSize: '11px', padding: '2px 6px', borderRadius: '3px'
  });
  const markerGreen = new BMap.Marker(ptGreen, {
    icon: new BMap.Icon('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', new BMap.Size(1, 1))
  });
  markerGreen.setLabel(labelGreen);

  const ptBlue = new BMap.Point(blueLng, blueLat);
  const circleBlue = new BMap.Circle(ptBlue, radius, {
    strokeColor: '#0055ff',
    strokeWeight: 1,
    fillColor: '#0077ff',
    fillOpacity: 0.8
  });
  const labelBlue = new BMap.Label('正球体', {
    offset: new BMap.Size(10, 8)
  });
  labelBlue.setStyle({
    border: 'none', backgroundColor: 'rgba(200,220,255,0.9)', color: '#003399',
    fontSize: '11px', padding: '2px 6px', borderRadius: '3px'
  });
  const markerBlue = new BMap.Marker(ptBlue, {
    icon: new BMap.Icon('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', new BMap.Size(1, 1))
  });
  markerBlue.setLabel(labelBlue);

  map.addOverlay(circleRed);
  map.addOverlay(markerRed);
  map.addOverlay(circleGreen);
  map.addOverlay(markerGreen);
  map.addOverlay(circleBlue);
  map.addOverlay(markerBlue);

  const record = { circleRed, markerRed, circleGreen, markerGreen, circleBlue, markerBlue };
  pointRecords.push(record);

  map.setViewport([ptRed, ptGreen, ptBlue], { margins: [50, 50, 50, 50] });

  function removeRecord() {
    map.removeOverlay(circleRed);
    map.removeOverlay(markerRed);
    map.removeOverlay(circleGreen);
    map.removeOverlay(markerGreen);
    map.removeOverlay(circleBlue);
    map.removeOverlay(markerBlue);
    const idx = pointRecords.indexOf(record);
    if (idx > -1) pointRecords.splice(idx, 1);
  }

  circleRed.addEventListener('rightclick', removeRecord);
  markerRed.addEventListener('rightclick', removeRecord);
  circleGreen.addEventListener('rightclick', removeRecord);
  markerGreen.addEventListener('rightclick', removeRecord);
  circleBlue.addEventListener('rightclick', removeRecord);
  markerBlue.addEventListener('rightclick', removeRecord);
}

onMounted(async () => {
  try {
    await loadBaiduMapScript(BAIDU_AK);
    const BMap = window.BMap || window.BMapGL;
    map = new BMap.Map("baiduMapContainer");
    const center = new BMap.Point(104, 30.7);
    map.centerAndZoom(center, 8);
    map.enableScrollWheelZoom(true);

    map.setMapStyleV2({
      styleJson: [
        { "featureType": "poi", "elementType": "all", "stylers": { "visibility": "off" } }
      ]
    });

    map.addEventListener('zoomend', function () {
      const r = getRadius();
      pointRecords.forEach(rec => {
        if (rec.circleRed) rec.circleRed.setRadius(r);
        if (rec.circleGreen) rec.circleGreen.setRadius(r);
        if (rec.circleBlue) rec.circleBlue.setRadius(r);
      });
    });

  } catch (error) {
    console.error('加载百度地图失败:', error);
  }
});

onUnmounted(() => {
  if (map) {
    map.clearOverlays();
    map = null;
  }
});
</script>

<style scoped>
.baidu-coord-page {
  position: relative;
  width: 100%;
  height: 100%;
}

#baiduMapContainer {
  position: absolute;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

.top-panels {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 999;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.control-panel {
  background: white;
  padding: 12px 14px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-size: 14px;
  color: #333;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.instructions {
  font-size: 13px;
  color: #e63946;
  margin-bottom: 8px;
  font-weight: bold;
}

.instructions p {
  margin: 0;
}

.image-panel {
  background: white;
  padding: 5px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.image-panel img {
  max-width: 500px;
  display: block;
}

.control-panel input {
  width: 100px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #333;
}

.control-panel button {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: white;
  background: #3385ff;
}

.control-panel button:hover {
  background: #2670e0;
}

.result-row {
  margin-top: 8px;
  font-size: 12px;
  color: #555;
  line-height: 1.6;
}

:deep(.red) {
  color: #ff3333;
  font-weight: bold;
}

:deep(.green) {
  color: #00aa00;
  font-weight: bold;
}

:deep(.blue) {
  color: #0066ff;
  font-weight: bold;
}
</style>
