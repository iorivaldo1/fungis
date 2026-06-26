<template>
    <div class="page-container">
        <div id="cesiumContainer" class="full-screen">
            <div class="camera-info" :class="{ collapsed: isCollapsed }">
                <div class="info-title" @click="toggleCollapse">
                    <span>镜头信息</span>
                    <IconChevronDown class="collapse-icon" :class="{ rotated: isCollapsed }" width="20" height="20" />
                </div>
                <transition name="slide-fade">
                    <div v-show="!isCollapsed" class="info-content">
                        <div class="info-item">heading: {{ cameraInfo.heading }}</div>
                        <div class="info-item">pitch: {{ cameraInfo.pitch }}</div>
                        <div class="info-item">视角经度: {{ cameraInfo.longitude }}</div>
                        <div class="info-item">视角纬度: {{ cameraInfo.latitude }}</div>
                        <div class="info-item">视角高度: {{ cameraInfo.height }}</div>
                    </div>
                </transition>
            </div>

            <div class="click-info" :class="{ collapsed: isClickCollapsed }">
                <div class="info-title" @click="toggleClickCollapse">
                    <span>点击信息</span>
                    <IconChevronDown class="collapse-icon" :class="{ rotated: isClickCollapsed }" width="20"
                        height="20" />
                </div>
                <transition name="slide-fade">
                    <div v-show="!isClickCollapsed" class="info-content">
                        <div class="info-item">经度: {{ clickInfo.longitude }}</div>
                        <div class="info-item">纬度: {{ clickInfo.latitude }}</div>
                    </div>
                </transition>
            </div>
        </div>
        <!-- 页面说明 -->
        <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
            <div class="info-container" v-if="showPageInfo">
                <div class="info-header">
                    <div class="info-title">📌 页面说明</div>
                    <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
                </div>
                <div class="info-item">1. 加载Geoserver发布的WMTS河流图层(Label和Feature)</div>
                <div class="info-item">2. 限制显示范围，聚焦雅安河流区域</div>
                <div class="info-item">3. 基于Cesium Viewer展示三维地形与影像</div>
                <div class="info-item">4. 有四川全部河流数据，服务器资源有限，只显示雅安河流</div>
                <div class="info-item">5. 显示相机参数（Heading, Pitch, Height等）和点击位置经纬度</div>
            </div>
            <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
                <span>📌</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import IconChevronDown from '../../components/icons/IconChevronDown.vue';

const showPageInfo = ref(true);
let viewer = null;
let handler = null;

// Camera and Click Info Refs
const isCollapsed = ref(true);
const isClickCollapsed = ref(true);
const cameraInfo = ref({
    heading: '0.00',
    pitch: '0.00',
    longitude: '0.00',
    latitude: '0.00',
    height: '0.00'
});
const clickInfo = ref({
    longitude: '--',
    latitude: '--'
});

const toggleCollapse = () => {
    isCollapsed.value = !isCollapsed.value;
};

const toggleClickCollapse = () => {
    isClickCollapsed.value = !isClickCollapsed.value;
};

// Update Camera Info
const updateCameraInfo = () => {
    if (!viewer) return;
    const heading = Cesium.Math.toDegrees(viewer.camera.heading).toFixed(2);
    const pitch = Cesium.Math.toDegrees(viewer.camera.pitch).toFixed(2);
    const positionCartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
    const longitude = Cesium.Math.toDegrees(positionCartographic.longitude).toFixed(2);
    const latitude = Cesium.Math.toDegrees(positionCartographic.latitude).toFixed(2);
    const height = positionCartographic.height.toFixed(2);

    cameraInfo.value = { heading, pitch, longitude, latitude, height };
};

const addTiandituLayer = () => {
    const tiandituModel = new Cesium.ProviderViewModel({
        name: "天地图影像",
        tooltip: "天地图影像及中文标注数据",
        iconUrl: '/tdtLOGO.png',
        creationFunction: function () {
            const mapsources = []
            const yx = new Cesium.WebMapTileServiceImageryProvider({
                url: "https://t0.tianditu.gov.cn/img_w/wmts?service=wmts&request=GetTile&version=1.0.0&LAYER=img&tileMatrixSet=w&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&style=default&format=tiles&tk=68873c0b0fe4dfa4ecedd009b6483e13",
                layer: "tdtBasicLayer",
                style: "default",
                format: "image/jpeg",
                tileMatrixSetID: "GoogleMapsCompatible",
                show: false
            })
            const zj = new Cesium.WebMapTileServiceImageryProvider({
                url: "https://t0.tianditu.gov.cn/cia_w/wmts?service=wmts&request=GetTile&version=1.0.0&LAYER=cia&tileMatrixSet=w&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&style=default&format=tiles&tk=68873c0b0fe4dfa4ecedd009b6483e13",
                layer: "tiandituImgMarker",
                style: "default",
                format: "image/jpeg",
                tileMatrixSetID: "tiandituImgMarker",
                show: true,
                maximumLevel: 16
            })
            mapsources.push(yx, zj)
            return mapsources
        }
    })
    viewer.baseLayerPicker.viewModel.imageryProviderViewModels.push(tiandituModel)
}

const addToomapLayer = () => {
    const toomapModel = new Cesium.ProviderViewModel({
        name: "tooMap",
        tooltip: "tooMap",
        iconUrl: '/toomap.png',
        creationFunction: function () {
            const mapsources = []
            const yx = new Cesium.WebMapTileServiceImageryProvider({
                url: "https://www.scgis.net/services/newtianditudom/WMTS?ak=2d2ff68e27AXNpzlye66b334f70181f1",
                layer: "defaultLayer",
                style: "default",
                format: "image/png",
                tileMatrixSetID: "GetTileMatrix",
                crs: "EPSG:4326",
                tileMatrixLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'],
                tilingScheme: new Cesium.GeographicTilingScheme(),
                minimumLevel: 1,
                maximumLevel: 18,
            })
            const zj = new Cesium.WebMapTileServiceImageryProvider({
                url: "https://www.scgis.net/services/newtianditudomdlg/WMTS?ak=2d2ff68e27AXNpzlye66b334f70181f1",
                layer: "defaultLayer",
                style: "default",
                format: "image/png",
                tileMatrixSetID: "GetTileMatrix",
                crs: "EPSG:4326",
                tileMatrixLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'],
                tilingScheme: new Cesium.GeographicTilingScheme(),
                minimumLevel: 1,
                maximumLevel: 18,
            })
            mapsources.push(yx, zj)
            return mapsources
        }
    })
    viewer.baseLayerPicker.viewModel.imageryProviderViewModels.push(toomapModel)
}

onMounted(() => {
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0MjczNDgzMy1hYzE1LTRjNWYtODZhMS01MjZkNWRiMDc2MmUiLCJpZCI6ODIxMzAsImlhdCI6MTY0NDU0ODc0M30.LpGXXWsbQXucV5MTeC2g8BCAQWiZp612gosWcK-7ocE';

    viewer = new Cesium.Viewer("cesiumContainer", {
        infoBox: false,
        animation: false,
        terrain: Cesium.Terrain.fromWorldTerrain(),
        geocoder: false,
        homeButton: true,
        sceneModePicker: false,
        baseLayerPicker: true,
        navigationHelpButton: false,
        timeline: false,
        fullscreenButton: false,
        skyAtmosphere: false,
    });

    // 监听相机变化
    viewer.camera.changed.addEventListener(updateCameraInfo);
    // 初始化时立即更新一次
    updateCameraInfo();

    // 处理点击事件
    handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click) => {
        // 更新点击位置的经纬度
        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (cartesian) {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const longitude = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
            const latitude = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
            clickInfo.value = { longitude, latitude };
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    addTiandituLayer()
    addToomapLayer()

    const west = Cesium.Math.toRadians(101.9642680901);
    const south = Cesium.Math.toRadians(28.862478591599995);
    const east = Cesium.Math.toRadians(103.4113808093);
    const north = Cesium.Math.toRadians(30.922261509850014);

    const wmtsProvider = new Cesium.WebMapTileServiceImageryProvider({
        url: `${import.meta.env.VITE_API_BASE_URL}/geoserver/gwc/service/wmts`,
        layer: "hydro:ya_river",
        style: "",
        format: "image/png",
        tileMatrixSetID: "EPSG:900913",
        tileMatrixLabels: ["EPSG:900913:0", "EPSG:900913:1", "EPSG:900913:2", "EPSG:900913:3", "EPSG:900913:4", "EPSG:900913:5", "EPSG:900913:6",
            "EPSG:900913:7", "EPSG:900913:8", "EPSG:900913:9", "EPSG:900913:10", "EPSG:900913:11", "EPSG:900913:12", "EPSG:900913:13", "EPSG:900913:14",
            "EPSG:900913:15", "EPSG:900913:16", "EPSG:900913:17"],
        rectangle: new Cesium.Rectangle(west, south, east, north),
        maximumLevel: 18,
    });

    viewer.imageryLayers.addImageryProvider(wmtsProvider);

    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
            102.708731,
            30.563719,
            30000
        ),
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-80),
            roll: 0.0,
        },
    });
});

onUnmounted(() => {
    if (handler) {
        handler.destroy();
        handler = null;
    }
    if (viewer) {
        viewer.destroy();
        viewer = null;
    }
});
</script>

<style scoped>
:deep(.cesium-viewer-bottom) {
    display: none !important;
}

.full-screen {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
}

.page-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

.full-screen {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    position: absolute;
    top: 0;
    left: 0;
}

/* 页面说明样式 */
.page-info {
    position: absolute;
    top: 80px;
    right: 20px;
    z-index: 450;
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

.page-info .info-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border-bottom: none;
    padding: 0;
    text-shadow: none;
    margin-bottom: 0;
}

.page-info .info-item {
    font-size: 13px;
    color: #333;
    line-height: 1.8;
    padding-left: 8px;
    text-shadow: none;
    user-select: none;
}

.page-info .info-item:hover {
    background-color: transparent;
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

.camera-info {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 0;
    top: 10px;
    left: 10px;
    z-index: 450;
    background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
    padding: 0;
    border-radius: 12px;
    backdrop-filter: blur(15px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    min-width: 200px;
    transition: all 0.3s ease;
}

.click-info {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 0;
    top: 10px;
    left: 230px;
    z-index: 450;
    background: linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(50, 50, 50, 0.92) 100%);
    padding: 0;
    border-radius: 12px;
    backdrop-filter: blur(15px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    min-width: 200px;
    transition: all 0.3s ease;
}

.camera-info.collapsed,
.click-info.collapsed {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.info-title {
    color: white;
    font-size: 16px;
    font-weight: 600;
    text-align: center;
    padding: 12px 16px;
    background: linear-gradient(135deg, rgba(60, 60, 60, 0.6) 0%, rgba(80, 80, 80, 0.5) 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
    letter-spacing: 0.5px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.3s ease;
}

.info-title:hover {
    background: linear-gradient(135deg, rgba(70, 70, 70, 0.7) 0%, rgba(90, 90, 90, 0.6) 100%);
}

.collapse-icon {
    transition: transform 0.3s ease;
    flex-shrink: 0;
}

.collapse-icon.rotated {
    transform: rotate(-180deg);
}

.info-content {
    display: flex;
    flex-direction: column;
}

.info-item {
    color: rgba(255, 255, 255, 0.95);
    font-size: 14px;
    font-weight: 500;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    line-height: 1.4;
    padding: 8px 16px;
    transition: background-color 0.2s ease;
}

.info-item:hover {
    background-color: rgba(255, 255, 255, 0.08);
}

/* 过渡动画 */
.slide-fade-enter-active {
    transition: all 0.01s ease;
}

.slide-fade-leave-active {
    transition: all 0.01s ease;
}

.slide-fade-enter-from {
    transform: translateY(-5px);
    opacity: 0;
}

.slide-fade-leave-to {
    transform: translateY(-5px);
    opacity: 0;
}
</style>
