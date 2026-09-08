<template>
  <div class="upload-btn-wrapper">
    <!-- 隐藏的照片选择文件输入框 -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden-file-input"
      :accept="accept"
      multiple
      @change="handleFileChange"
      style="display: none;"
    />

    <!-- 照片预览浮动卡片 -->
    <div v-show="previewActive" class="preview-container" :class="{ active: previewActive }">
      <div class="preview-header">
        <div class="preview-info" v-html="previewInfo"></div>
        <button type="button" class="preview-close-btn" @click="closePreview" title="关闭预览">&times;</button>
      </div>
      <img :src="previewSrc" class="preview-img-item" alt="图片预览" />
    </div>

    <!-- 浮动打开照片按钮 -->
    <button
      id="uploadBtn"
      class="upload-btn"
      :style="buttonStyle"
      @click="triggerFileInput"
      :title="title"
      type="button"
    >
      <IconPhoto width="24" height="24" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import exifr from 'exifr'
import * as Cesium from 'cesium'
import L from 'leaflet'
import IconPhoto from '@/components/icons/IconPhoto.vue'
import { wgs84ToGcj02, gcj02ToBd09 } from '@/utils/baiduUtils.js'

const props = defineProps({
  map: {
    type: [Object, Function],
    default: null
  },
  viewer: {
    type: [Object, Function],
    default: null
  },
  getMap: {
    type: Function,
    default: null
  },
  mapType: {
    type: String,
    default: 'auto' // 'auto' | 'cesium' | 'leaflet' | 'baidu' | 'tianditu'
  },
  crs: {
    type: String,
    default: 'auto' // 'auto' | 'wgs84' | 'bd09'
  },
  bottom: {
    type: [Number, String],
    default: 30
  },
  right: {
    type: [Number, String],
    default: 100
  },
  title: {
    type: String,
    default: '打开照片'
  },
  accept: {
    type: String,
    default: '.jpg,.jpeg,.png'
  }
})

const emit = defineEmits(['photos-loaded', 'photo-click', 'preview-change'])

const fileInputRef = ref(null)
const previewActive = ref(false)
const previewInfo = ref('')
const previewSrc = ref('')
const currentPhotoId = ref(null)

let photosData = {}
let cesiumHandler = null
let leafletLayerGroup = null
let baiduMarkers = []
let tiandituMarkers = []
let cesiumEntityIds = []

const buttonStyle = computed(() => {
  const b = typeof props.bottom === 'number' ? `${props.bottom}px` : props.bottom
  const r = typeof props.right === 'number' ? `${props.right}px` : props.right
  return {
    bottom: b,
    right: r
  }
})

const resolveMap = () => {
  if (typeof props.getMap === 'function') return props.getMap()
  const m = props.map || props.viewer
  if (typeof m === 'function') return m()
  if (m && typeof m === 'object' && 'value' in m) return m.value
  return m
}

const detectMapType = (m) => {
  if (props.mapType && props.mapType !== 'auto') return props.mapType
  if (!m) return null
  if (m.camera && m.entities) return 'cesium'
  if (m.flyTo && m.addLayer) return 'leaflet'
  if (m.centerAndZoom && m.addOverlay && (window.BMap || window.BMapGL)) return 'baidu'
  if (m.centerAndZoom && m.addOverLay && window.T) return 'tianditu'
  return null
}

const wgs84ToBd09 = (lng, lat) => {
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat)
  return gcj02ToBd09(gcjLng, gcjLat)
}

const triggerFileInput = () => {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

const closePreview = () => {
  previewActive.value = false
  currentPhotoId.value = null
  emit('preview-change', { active: false, photo: null })
}

const showPreview = (photo, bdLng = null, bdLat = null) => {
  if (currentPhotoId.value === photo.id && previewActive.value) {
    closePreview()
    return
  }

  currentPhotoId.value = photo.id
  previewSrc.value = photo.src

  if (bdLng !== null && bdLat !== null) {
    previewInfo.value = `
      <div style="font-weight:600; margin-bottom:4px; word-break:break-all;">文件: ${photo.fileName}</div>
      <div style="color:#93c5fd;">GPS(WGS84): (${photo.longitude.toFixed(6)}, ${photo.latitude.toFixed(6)})</div>
      <div style="color:#6ee7b7;">百度(BD09): (${bdLng.toFixed(6)}, ${bdLat.toFixed(6)})</div>
      <div style="color:#cbd5e1; font-size:12px; margin-top:2px;">时间: ${photo.timestamp}</div>
    `
  } else {
    previewInfo.value = `
      <div style="font-weight:600; margin-bottom:4px; word-break:break-all;">文件: ${photo.fileName}</div>
      <div style="color:#93c5fd;">坐标: (${photo.longitude.toFixed(6)}, ${photo.latitude.toFixed(6)})</div>
      <div style="color:#cbd5e1; font-size:12px; margin-top:2px;">时间: ${photo.timestamp}</div>
    `
  }

  previewActive.value = true
  emit('preview-change', { active: true, photo })
}

const clearMapPhotos = () => {
  const m = resolveMap()
  if (!m) return

  const currentMapType = detectMapType(m)

  if (currentMapType === 'cesium') {
    cesiumEntityIds.forEach((id) => {
      try {
        m.entities.removeById(id)
      } catch (_) {}
    })
    cesiumEntityIds = []
  } else if (currentMapType === 'leaflet') {
    if (leafletLayerGroup) {
      leafletLayerGroup.clearLayers()
    }
  } else if (currentMapType === 'baidu') {
    baiduMarkers.forEach((marker) => {
      try {
        m.removeOverlay(marker)
      } catch (_) {}
    })
    baiduMarkers = []
  } else if (currentMapType === 'tianditu') {
    tiandituMarkers.forEach((marker) => {
      try {
        m.removeOverLay(marker)
      } catch (_) {}
    })
    tiandituMarkers = []
  }
}

const initCesiumClickHandler = (viewer) => {
  if (cesiumHandler) {
    cesiumHandler.destroy()
    cesiumHandler = null
  }
  if (!viewer || !viewer.canvas) return

  cesiumHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
  cesiumHandler.setInputAction((click) => {
    const pickedObject = viewer.scene.pick(click.position)
    if (!Cesium.defined(pickedObject) || !pickedObject.id) {
      return
    }

    const entity = pickedObject.id
    const photoId = entity.id || entity._id
    if (photoId && photosData[photoId]) {
      const photo = photosData[photoId]
      showPreview(photo)
      emit('photo-click', photo)
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
}

const handleFileChange = async (event) => {
  closePreview()
  clearMapPhotos()
  photosData = {}

  const files = event.target.files
  if (!files || files.length === 0) return

  const m = resolveMap()
  const currentMapType = detectMapType(m)
  const isBaiduCrs = props.crs === 'bd09' || currentMapType === 'baidu'

  if (currentMapType === 'cesium' && m) {
    initCesiumClickHandler(m)
  }

  let processedCount = 0
  const loadedPhotos = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    try {
      const exifData = await exifr.parse(file, {
        gps: true,
        xmp: false,
        icc: false,
        iptc: false
      })

      if (!exifData || !exifData.latitude || !exifData.longitude) {
        console.warn(`图片 ${file.name} 没有 GPS 信息，已跳过`)
        processedCount++
        continue
      }

      const jd = exifData.longitude
      const wd = exifData.latitude

      const fileReader = new FileReader()
      fileReader.onload = (fileEvent) => {
        const photoId = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        let displayLng = jd
        let displayLat = wd
        let bdLng = null
        let bdLat = null

        if (isBaiduCrs) {
          const [bLng, bLat] = wgs84ToBd09(jd, wd)
          bdLng = bLng
          bdLat = bLat
          displayLng = bLng
          displayLat = bLat
        }

        const photo = {
          id: photoId,
          src: fileEvent.target.result,
          fileName: file.name,
          longitude: jd,
          latitude: wd,
          displayLng,
          displayLat,
          bdLng,
          bdLat,
          timestamp: new Date().toLocaleString()
        }

        photosData[photoId] = photo
        loadedPhotos.push(photo)

        // 渲染到对应地图
        if (m) {
          if (currentMapType === 'cesium') {
            cesiumEntityIds.push(photoId)
            const positions = [Cesium.Cartographic.fromDegrees(jd, wd)]
            Cesium.sampleTerrainMostDetailed(m.terrainProvider, positions)
              .then((updated) => {
                const h = updated[0]?.height ?? 0
                m.entities.add({
                  id: photoId,
                  position: Cesium.Cartesian3.fromDegrees(jd, wd, h),
                  point: {
                    color: Cesium.Color.FIREBRICK,
                    pixelSize: 8,
                    outlineColor: Cesium.Color.DARKSLATEGREY,
                    outlineWidth: 3,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                  }
                })
              })
              .catch(() => {
                m.entities.add({
                  id: photoId,
                  position: Cesium.Cartesian3.fromDegrees(jd, wd, 0),
                  point: {
                    color: Cesium.Color.FIREBRICK,
                    pixelSize: 8,
                    outlineColor: Cesium.Color.DARKSLATEGREY,
                    outlineWidth: 3,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                  }
                })
              })
          } else if (currentMapType === 'leaflet') {
            if (!leafletLayerGroup) {
              leafletLayerGroup = L.featureGroup().addTo(m)
            }
            const marker = L.circleMarker([wd, jd], {
              radius: 8,
              fillColor: '#b22222',
              color: '#2f4f4f',
              weight: 3,
              fillOpacity: 0.95
            })
            marker.bindTooltip(file.name, { direction: 'top', offset: [0, -8] })
            marker.on('click', () => {
              showPreview(photo)
              emit('photo-click', photo)
            })
            marker.addTo(leafletLayerGroup)
          } else if (currentMapType === 'baidu') {
            const BMap = window.BMap || window.BMapGL
            const pt = new BMap.Point(displayLng, displayLat)
            let marker
            if (typeof window.BMAP_SYMBOL_CIRCLE !== 'undefined') {
              const symbol = new BMap.Symbol(window.BMAP_SYMBOL_CIRCLE, {
                scale: 7,
                fillColor: '#b22222',
                fillOpacity: 1,
                strokeColor: '#2f4f4f',
                strokeWeight: 2
              })
              marker = new BMap.Marker(pt, { icon: symbol })
            } else {
              marker = new BMap.Marker(pt)
            }
            marker.setTitle(file.name)
            marker.addEventListener('click', () => {
              showPreview(photo, bdLng, bdLat)
              emit('photo-click', photo)
            })
            m.addOverlay(marker)
            baiduMarkers.push(marker)
          } else if (currentMapType === 'tianditu') {
            const pt = new window.T.LngLat(jd, wd)
            const marker = new window.T.Marker(pt)
            marker.addEventListener('click', () => {
              showPreview(photo)
              emit('photo-click', photo)
            })
            m.addOverLay(marker)
            tiandituMarkers.push(marker)
          }
        }

        processedCount++

        if (processedCount === files.length) {
          emit('photos-loaded', loadedPhotos)
          focusOnPhotos(m, currentMapType, loadedPhotos)
        }
      }

      fileReader.readAsDataURL(file)
    } catch (err) {
      console.warn(`读取图片 ${file.name} EXIF 失败:`, err)
      processedCount++
      if (processedCount === files.length && loadedPhotos.length > 0) {
        emit('photos-loaded', loadedPhotos)
        focusOnPhotos(m, currentMapType, loadedPhotos)
      }
    }
  }
}

const focusOnPhotos = (m, currentMapType, photos) => {
  if (!m || !photos || photos.length === 0) return
  const first = photos[0]

  if (currentMapType === 'cesium') {
    m.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(first.longitude, first.latitude, 9400)
    })
  } else if (currentMapType === 'leaflet') {
    if (leafletLayerGroup && leafletLayerGroup.getLayers().length > 0) {
      m.fitBounds(leafletLayerGroup.getBounds().pad(0.3))
    } else {
      m.setView([first.latitude, first.longitude], 14)
    }
  } else if (currentMapType === 'baidu') {
    const BMap = window.BMap || window.BMapGL
    m.centerAndZoom(new BMap.Point(first.displayLng, first.displayLat), 14)
  } else if (currentMapType === 'tianditu') {
    m.centerAndZoom(new window.T.LngLat(first.longitude, first.latitude), 14)
  }
}

onUnmounted(() => {
  if (cesiumHandler) {
    cesiumHandler.destroy()
    cesiumHandler = null
  }
  clearMapPhotos()
})
</script>

<style scoped>
.upload-btn {
  position: absolute;
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
  padding: 0;
}

.upload-btn:hover {
  background-color: #3085d6;
  color: white;
  transform: scale(1.1);
}

.upload-btn svg {
  width: 24px;
  height: 24px;
  transition: all 0.3s ease;
}

.preview-container {
  position: absolute;
  bottom: 30px;
  left: 20px;
  background-color: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(12px);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  display: none;
  z-index: 1000;
  width: fit-content;
  max-width: 340px;
  transition: all 0.3s ease;
}

.preview-container.active {
  display: block;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.preview-info {
  color: white;
  font-size: 13px;
  line-height: 1.5;
}

.preview-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.2s ease;
}

.preview-close-btn:hover {
  color: #ffffff;
}

.preview-img-item {
  width: 300px;
  height: 300px;
  margin-top: 10px;
  border: 2px solid #3085d6;
  border-radius: 6px;
  display: block;
  object-fit: contain;
  background-color: #0b0f19;
}
</style>
