<template>
  <div class="home-container">
    <BackgroundSpheres />
    <div class="content">
      <div class="card-container">
        <div
          v-for="(card, index) in cards"
          :key="index"
          class="card"
          :class="{ 'card-featured': card.featured }"
          :style="{ background: card.bg }"
          @click="navigateTo(card.path)"
        >
          <div class="card-overlay"></div>
          <div class="card-badge" v-if="card.badge">{{ card.badge }}</div>
          <div class="card-content">
            <div class="card-icon">
              <!-- Dynamic Icon Component -->
              <component :is="card.icon" />
            </div>
            <h2>{{ card.title }}</h2>
            <div class="features">
              <span
                v-for="(tag, tIndex) in card.tags"
                :key="tIndex"
                class="tag"
                >{{ tag }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { shallowRef } from "vue";
import IconCesium from "../components/icons/IconCesium.vue";
import IconRiver from "../components/icons/IconRiver.vue";
import IconThree from "../components/icons/IconThree.vue";
import IconLocation from "../components/icons/IconLocation.vue";
import IconPhoto from "../components/icons/IconPhoto.vue";
import BackgroundSpheres from "../components/BackgroundSpheres.vue";

const router = useRouter();

const navigateTo = (path) => {
  router.push(path);
};

const cards = shallowRef([
  {
    title: "3D地形查询",
    path: "/three-tdt/terrainData",
    icon: IconThree,
    tags: ["WCS地形", "天地图DOM", "高程查询", "河流桥梁"],
    bg: "url('/images/three_tdt.png') center/cover no-repeat",
    featured: true,
    badge: "✦ 推荐",
  },
  {
    title: "百度坐标转换",
    path: "/baidu/topic-map",
    icon: IconRiver,
    tags: ["BMap", "GeoServer WMS", "专题图层", "在线叠加"],
    bg: "url('/images/baidu_screenshot.png') center/cover no-repeat",
    featured: true,
    badge: "NEW",
  },
  {
    title: "三维定位",
    path: "/cesium/location",
    icon: IconLocation,
    tags: ["GPS信息", "H5定位", "相机参数", "照片预览"],
    bg: "url('/images/locate.png') center/cover no-repeat",
  },
  {
    title: "Shader 特效",
    path: "/cesium/shader",
    icon: IconCesium,
    tags: ["扩散圆环", "流动线条", "轨迹球体", "渐变几何"],
    // 洋红 → 紫 → 橙：呼应炫彩着色器
    bg: "url('/images/cesium_shader.png') center/cover no-repeat",
  },
  {
    title: "WMTS服务",
    path: "/tianditu/wmts",
    icon: IconRiver,
    tags: ["Geoserver", "WMTS图层", "透明度调节", "OSM河流"],
    // 深蓝 → 青蓝：呼应地图瓦片
    bg: "url('/images/wmts_river.png') center/cover no-repeat",
  },
  {
    title: "瓦片下载",
    path: "/tianditu/download",
    icon: IconPhoto,
    tags: ["框选下载", "GeoTIFF/PNG", "多线程", "进度监控"],
    // 深靛 → 蓝绿：呼应数据下载/传输
    bg: "url('/images/tile_download.png') center/cover no-repeat",
  },
  {
    title: "粒子模拟",
    path: "/three/particle1",
    icon: IconThree,
    tags: ["GPGPU", "地形流动", "交互发射", "Three.js"],
    // 深橙 → 琥珀 → 深红：呼应粒子火焰感
    bg: "url('/images/shader_partical.png') center/cover no-repeat",
  },
  {
    title: "流体模拟",
    path: "/three/fluid",
    icon: IconThree,
    tags: ["浅水方程", "实时流体", "GPGPU", "交互"],
    // 深青 → 蔚蓝 → 深海蓝：呼应水流/流体
    bg: "url('/images/shader_liquid.png') center/cover no-repeat",
  },
]);
</script>

<style scoped>
.home-container {
  width: 100%;
  height: 100vh;
  /* Fixed height to avoid scroll if possible */
  /* background-color: var(--bg-dark); Removed to show background spheres */
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
  /* Hide overflow if slightly larger */
}

.content {
  width: 100%;
  max-width: 1400px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.card-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  padding: 10px;
  user-select: none;
}

.card {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  height: 240px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.card-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 3;
  background: linear-gradient(135deg, #5ece90, #2a9d6e);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.04em;
  box-shadow: 0 2px 8px rgba(94, 206, 144, 0.5);
  pointer-events: none;
}

.card-featured {
  border-color: rgba(94, 206, 144, 0.6);
  box-shadow:
    0 0 0 1px rgba(94, 206, 144, 0.3),
    0 10px 30px rgba(0, 0, 0, 0.5),
    0 0 30px rgba(94, 206, 144, 0.15);
}

.card-featured .card-overlay {
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.05) 0%,
    rgba(0, 0, 0, 0.6) 100%
  );
}

.card-featured:hover {
  box-shadow:
    0 0 0 2px rgba(94, 206, 144, 0.7),
    0 15px 35px rgba(0, 0, 0, 0.6),
    0 0 50px rgba(94, 206, 144, 0.25);
}

.card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* 让渐变底色透出，仅用轻薄遮罩保证文字可读 */
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.05) 0%,
    rgba(0, 0, 0, 0.55) 100%
  );
  transition: opacity 0.3s;
}

.card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
  border-color: var(--accent-color);
  z-index: 10;
}

.card:hover .card-overlay {
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.65) 100%
  );
}

.card-content {
  position: relative;
  z-index: 2;
  height: 100%;
  padding: 20px;
  /* Reduced padding */
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: white;
}

.card-icon {
  width: 40px;
  /* Smaller icon */
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background: rgba(94, 206, 144, 0.2);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(94, 206, 144, 0.3);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.card-icon svg {
  width: 26px;
  height: 26px;
  color: var(--accent-color);
}

.card h2 {
  font-size: 18px;
  /* Smaller title */
  font-weight: 700;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.features {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: auto;
  /* Push button to bottom */
  align-content: flex-start;
}

.tag {
  background: rgba(255, 255, 255, 0.15);
  color: #eee;
  padding: 3px 10px;
  /* Smaller tag padding */
  border-radius: 12px;
  font-size: 11px;
  /* Smaller tag font */
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

@media (max-width: 1300px) {
  .card-container {
    grid-template-columns: repeat(3, 1fr);
    /* Force 3 columns on mid-size screens */
  }
}

@media (max-width: 900px) {
  .home-container {
    height: auto;
    /* Allow scrolling on smaller screens */
    overflow: auto;
  }

  .card-container {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .card-container {
    grid-template-columns: 1fr;
  }
}
</style>
