<template>
  <div class="cesium-page">
    <div class="preview-container" :class="{ active: previewActive }">
      <div class="preview-info" v-html="previewInfo"></div>
      <img :src="previewSrc" class="preview-img-item" alt="图片预览">
    </div>

    <input type="file" id="fileInput" ref="fileInput" @change="handleFileChange" accept=".jpg,.jpeg,.png" multiple
      style="display: none;">

    <button id="uploadBtn" @click="triggerFileInput" title="打开照片">
      <IconPhoto width="24" height="24" />
    </button>

    <button id="locationBtn" :class="{ loading: isLocating }" @click="handleLocation" title="定位到当前位置">
      <IconLocation width="24" height="24" />
    </button>

    <div id="cesiumContainer">
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
          <IconChevronDown class="collapse-icon" :class="{ rotated: isClickCollapsed }" width="20" height="20" />
        </div>
        <transition name="slide-fade">
          <div v-show="!isClickCollapsed" class="info-content">
            <div class="info-item">经度: {{ clickInfo.longitude }}</div>
            <div class="info-item">纬度: {{ clickInfo.latitude }}</div>
          </div>
        </transition>
      </div>

      <!-- 页面说明 -->
      <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
        <div class="info-container" v-if="showPageInfo">
          <div class="info-header">
            <div class="info-title">📌 页面说明</div>
            <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
          </div>
          <div class="info-item">1. 点击右下图标打开带有GPS信息的照片，在地图上展示拍摄位置</div>
          <div class="info-item">2. 支持定位当前位置（GPS或IP定位）</div>
          <div class="info-item">3. 显示相机参数（Heading, Pitch, Height等）和点击位置经纬度</div>
          <div class="info-item">4. 点击照片图标可预览照片详情</div>
        </div>
        <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
          <span>📌</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as Cesium from 'cesium'
import exifr from 'exifr'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import IconChevronDown from '../../components/icons/IconChevronDown.vue'
import IconPhoto from '../../components/icons/IconPhoto.vue'
import IconLocation from '../../components/icons/IconLocation.vue'


const router = useRouter()
const fileInput = ref(null)
const previewActive = ref(false)
const previewInfo = ref('')
const previewSrc = ref('')
const isLocating = ref(false)

const cameraInfo = ref({
  heading: '0.00',
  pitch: '0.00',
  longitude: '0.00',
  latitude: '0.00',
  height: '0.00'
})

const clickInfo = ref({
  longitude: '--',
  latitude: '--'
})

const isCollapsed = ref(true)

const isClickCollapsed = ref(true)
const showPageInfo = ref(true)

let viewer = null
let photosData = {}
let currentPhotoId = null
let handler = null

const goBack = () => {
  router.push('/')
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const toggleClickCollapse = () => {
  isClickCollapsed.value = !isClickCollapsed.value
}

const triggerFileInput = () => {
  fileInput.value.click()
}



const initCesium = () => {
  Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0MjczNDgzMy1hYzE1LTRjNWYtODZhMS01MjZkNWRiMDc2MmUiLCJpZCI6ODIxMzAsImlhdCI6MTY0NDU0ODc0M30.LpGXXWsbQXucV5MTeC2g8BCAQWiZp612gosWcK-7ocE"

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
  })

  // 更新相机信息的函数
  const updateCameraInfo = () => {
    const heading = Cesium.Math.toDegrees(viewer.camera.heading).toFixed(2)
    const pitch = Cesium.Math.toDegrees(viewer.camera.pitch).toFixed(2)
    const positionCartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position)
    const longitude = Cesium.Math.toDegrees(positionCartographic.longitude).toFixed(2)
    const latitude = Cesium.Math.toDegrees(positionCartographic.latitude).toFixed(2)
    const height = positionCartographic.height.toFixed(2)

    cameraInfo.value = { heading, pitch, longitude, latitude, height }
  }

  // 监听相机变化
  viewer.camera.changed.addEventListener(updateCameraInfo)

  // 初始化时立即更新一次
  updateCameraInfo()

  // 添加天地图
  addTiandituLayer()
  addToomapLayer()

  // 处理点击事件
  handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
  handler.setInputAction((click) => {
    // 更新点击位置的经纬度
    const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid)
    if (cartesian) {
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
      const longitude = Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)
      const latitude = Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)
      clickInfo.value = { longitude, latitude }
    }

    const pickedObject = viewer.scene.pick(click.position)

    if (!Cesium.defined(pickedObject) || !pickedObject.id) {
      previewActive.value = false
      currentPhotoId = null
      return
    }

    const entity = pickedObject.id
    const photoId = entity.id || entity._id

    if (!photosData[photoId]) {
      return
    }

    const photo = photosData[photoId]

    if (currentPhotoId === photoId && previewActive.value) {
      previewActive.value = false
      currentPhotoId = null
    } else {
      previewSrc.value = photo.src
      previewInfo.value = `<div>文件: ${photo.fileName}</div><div>坐标: (${photo.longitude.toFixed(6)},${photo.latitude.toFixed(6)} )</div><div>时间: ${photo.timestamp}</div>`
      previewActive.value = true
      currentPhotoId = photoId
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
}

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

const handleFileChange = (event) => {
  viewer.entities.removeAll()
  previewActive.value = false
  photosData = {}
  currentPhotoId = null

  const files = event.target.files
  if (!files || files.length === 0) return

  let processedCount = 0

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    // Use exifr to parse GPS data asynchronously
    exifr.parse(file, {
      gps: true,  // Extract GPS data
      xmp: false,  // Skip XMP data for performance
      icc: false,  // Skip ICC profile for performance
      iptc: false  // Skip IPTC data for performance
    }).then(exifData => {
      if (!exifData || !exifData.latitude || !exifData.longitude) {
        console.warn(`图片 ${file.name} 没有GPS信息，已跳过`)
        processedCount++
        return
      }

      // exifr already converts GPS coordinates to decimal degrees
      const jd = exifData.longitude
      const wd = exifData.latitude

      // Read file as data URL for preview
      const fileReader = new FileReader()

      fileReader.onload = function (fileEvent) {
        const photoId = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        photosData[photoId] = {
          src: fileEvent.target.result,
          fileName: file.name,
          latitude: wd,
          longitude: jd,
          timestamp: new Date().toLocaleString()
        }

        const positions = [Cesium.Cartographic.fromDegrees(jd, wd)]
        Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions)
          .then(updated => {
            const h = updated[0].height ?? 0
            viewer.entities.add({
              id: photoId,
              position: Cesium.Cartesian3.fromDegrees(jd, wd, h),
              point: {
                color: Cesium.Color.FIREBRICK,
                pixelSize: 8,
                outlineColor: Cesium.Color.DARKSLATEGREY,
                outlineWidth: 3,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }
            })
          })

        processedCount++

        if (processedCount === files.length) {
          const firstPhotoId = Object.keys(photosData)[0]
          if (firstPhotoId) {
            const photo = photosData[firstPhotoId]
            viewer.camera.setView({
              destination: Cesium.Cartesian3.fromDegrees(photo.longitude, photo.latitude, 9400),
            })
          }
        }
      }

      fileReader.readAsDataURL(file)
    }).catch(error => {
      console.warn(`读取图片 ${file.name} 的EXIF信息失败:`, error)
      processedCount++
    })

  }
}

const handleLocation = () => {
  const isSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost'

  if (!navigator.geolocation) {
    alert('您的浏览器不支持地理定位功能')
    return
  }

  if (!isSecureContext) {
    if (confirm('当前为HTTP环境，浏览器限制了GPS定位。\n\n是否使用IP定位？（精度较低，误差可能在城市级别）')) {
      useIPLocation()
    } else {
      alert('提示：请使用HTTPS协议访问以启用精确GPS定位')
    }
    return
  }

  isLocating.value = true

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const longitude = position.coords.longitude
      const latitude = position.coords.latitude

      viewer.entities.removeById('currentLocation')

      viewer.entities.add({
        id: 'currentLocation',
        position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
        point: {
          color: Cesium.Color.BLUE,
          pixelSize: 10,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: '当前位置',
          font: '14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -15),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      })

      // 计算镜头偏移位置，让定位点显示在视框中心
      const offsetDistance = 800 // 向南偏移800米
      const offsetLat = latitude - (offsetDistance / 111320) // 纬度减小=向南移动

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, offsetLat, 1500),
        duration: 2,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-60),
          roll: 0.0
        }
      })

      isLocating.value = false
    },
    (error) => {
      isLocating.value = false
      let errorMsg = ''
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = '用户拒绝了地理定位请求'
          break
        case error.POSITION_UNAVAILABLE:
          errorMsg = '位置信息不可用'
          break
        case error.TIMEOUT:
          errorMsg = '获取位置信息超时'
          break
        default:
          errorMsg = '未知错误'
          break
      }
      alert('定位失败：' + errorMsg)
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  )
}

const useIPLocation = () => {
  isLocating.value = true

  fetch('https://ipapi.co/json/')
    .then(response => response.json())
    .then(data => {
      if (data.latitude && data.longitude) {
        const longitude = data.longitude
        const latitude = data.latitude
        const city = data.city || '未知城市'

        viewer.entities.removeById('currentLocation')

        viewer.entities.add({
          id: 'currentLocation',
          position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
          point: {
            color: Cesium.Color.ORANGE,
            pixelSize: 10,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `IP定位: ${city}`,
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        })

        // 计算镜头偏移位置，让定位点显示在视框中心
        const offsetDistance = 10000 // 向南偏移10公里
        const offsetLat = latitude - (offsetDistance / 111320) // 纬度减小=向南移动

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(longitude, offsetLat, 20000),
          duration: 2,
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-60),
            roll: 0.0
          }
        })

        isLocating.value = false
      } else {
        throw new Error('IP定位数据不完整')
      }
    })
    .catch(() => {
      alert('IP定位服务不可用。\n\n请联系管理员配置HTTPS以使用GPS精确定位。')
      isLocating.value = false
    })
}

onMounted(() => {
  initCesium()
})

onUnmounted(() => {
  if (handler) {
    handler.destroy()
  }
  if (viewer) {
    viewer.destroy()
  }
})
</script>

<style scoped>
.cesium-page {
  width: 100%;
  height: 100%;
  position: relative;
}

:deep(.cesium-viewer-bottom) {
  display: none !important;
}

.header-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  padding: 0 20px;
  z-index: 1000;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.back-btn svg {
  width: 20px;
  height: 20px;
}

.header-bar h1 {
  color: white;
  font-size: 24px;
  margin-left: 30px;
  font-weight: 600;
}

#cesiumContainer {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
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

#uploadBtn,
#locationBtn {
  position: absolute;
  bottom: 30px;
  width: 56px;
  height: 56px;
  background-color: #fff;
  border: 2px solid #3085d6;
  border-radius: 50%;
  cursor: pointer;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  color: #3085d6;
}

#uploadBtn {
  right: 100px;
}

#locationBtn {
  right: 30px;
}

#uploadBtn:hover,
#locationBtn:hover {
  background-color: #3085d6;
  color: white;
  transform: scale(1.1);
}

#uploadBtn svg,
#locationBtn svg {
  width: 24px;
  height: 24px;
  transition: all 0.3s ease;
}

.preview-container {
  position: absolute;
  bottom: 30px;
  left: 20px;
  background-color: rgba(0, 0, 0, 0.8);
  padding: 15px;
  border-radius: 10px;
  display: none;
  z-index: 999;
  width: fit-content;
  max-width: 330px;
}

.preview-container.active {
  display: block;
}

.preview-img-item {
  width: 300px;
  height: 300px;
  margin-top: 10px;
  border: 2px solid #3085d6;
  border-radius: 5px;
  display: block;
  object-fit: contain;
  background-color: #000;
}

.preview-info {
  color: white;
  font-size: 13px;
  line-height: 1.5;
}

#locationBtn {
  position: absolute;
  bottom: 30px;
  right: 30px;
  width: 56px;
  height: 56px;
  background-color: #fff;
  border: 2px solid #3085d6;
  border-radius: 50%;
  cursor: pointer;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

#locationBtn:hover {
  background-color: #3085d6;
  transform: scale(1.1);
}

#locationBtn:hover svg {
  fill: #fff;
}

#locationBtn svg {
  width: 28px;
  height: 28px;
  fill: #3085d6;
  transition: fill 0.3s ease;
}

#locationBtn.loading {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
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

.page-info .info-item {
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  padding-left: 8px;
  text-shadow: none;
  user-select: none;
}

.page-info .info-item:hover {
  background-color: transparent;
}
</style>
