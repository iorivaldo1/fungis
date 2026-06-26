<template>
  <div class="shader-page">
    <!-- 特效选择控制面板 -->
    <div class="shader-controls" :class="{ collapsed: isControlCollapsed }">
      <div class="control-header" @click="toggleControlCollapse">
        <span>Shader 特效</span>
        <IconChevronDown class="collapse-icon" :class="{ rotated: isControlCollapsed }" width="20" height="20" />
      </div>
      <transition name="slide-fade">
        <div v-show="!isControlCollapsed" class="control-content">
          <div class="effect-group">
            <div class="group-title">扩散圆环</div>
            <button class="effect-btn" :class="{ active: activeEffects.includes('expandingRing1') }"
              @click="toggleEffect('expandingRing1')">
              静态圆环
            </button>
            <button class="effect-btn" :class="{ active: activeEffects.includes('expandingRing2') }"
              @click="toggleEffect('expandingRing2')">
              动态扩散圆环
            </button>
            <button class="effect-btn" :class="{ active: activeEffects.includes('groundRing') }"
              @click="toggleEffect('groundRing')">
              贴地扩散圆环
            </button>
          </div>

          <div class="effect-group">
            <div class="group-title">流动线条</div>
            <button class="effect-btn" :class="{ active: activeEffects.includes('flowLine') }"
              @click="toggleEffect('flowLine')">
              红色流动线
            </button>
            <button class="effect-btn" :class="{ active: activeEffects.includes('greenFlowLine') }"
              @click="toggleEffect('greenFlowLine')">
              绿线-底红流动
            </button>
          </div>

          <div class="effect-group">
            <div class="group-title">轨迹球体</div>
            <button class="effect-btn" :class="{ active: activeEffects.includes('trailEllipsoid') }"
              @click="toggleEffect('trailEllipsoid')">
              轨迹流动球体
            </button>
          </div>

          <div class="effect-group">
            <div class="group-title">渐变几何体</div>
            <button class="effect-btn" :class="{ active: activeEffects.includes('gradientGeometry') }"
              @click="toggleEffect('gradientGeometry')">
              绿色渐变体
            </button>
          </div>

          <button class="clear-btn" @click="clearAllEffects">清除所有特效</button>
        </div>
      </transition>
    </div>

    <div id="cesiumContainer"></div>

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
        <div class="info-item">1. 展示多种Cesium Shader特效</div>
        <div class="info-item">2. 包含扩散圆环、流动线条、轨迹球体、渐变几何体等效果</div>
        <div class="info-item">3. 可通过右侧面板控制特效的开启与关闭</div>
        <div class="info-item">4. 点击特效按钮会自动定位到最佳观测视角</div>
        <div class="info-item">5. 显示相机参数（Heading, Pitch, Height等）和点击位置经纬度</div>
      </div>
      <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
        <span>📌</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import IconChevronDown from '../../components/icons/IconChevronDown.vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'


const isControlCollapsed = ref(false)

const activeEffects = ref([])
const showPageInfo = ref(true)

let viewer = null
let primitives = {}
let handler = null

// Camera and Click Info Refs
const isCollapsed = ref(true)
const isClickCollapsed = ref(true)
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

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const toggleClickCollapse = () => {
  isClickCollapsed.value = !isClickCollapsed.value
}

// Update Camera Info
const updateCameraInfo = () => {
  if (!viewer) return
  const heading = Cesium.Math.toDegrees(viewer.camera.heading).toFixed(2)
  const pitch = Cesium.Math.toDegrees(viewer.camera.pitch).toFixed(2)
  const positionCartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position)
  const longitude = Cesium.Math.toDegrees(positionCartographic.longitude).toFixed(2)
  const latitude = Cesium.Math.toDegrees(positionCartographic.latitude).toFixed(2)
  const height = positionCartographic.height.toFixed(2)

  cameraInfo.value = { heading, pitch, longitude, latitude, height }
}

const toggleControlCollapse = () => {
  isControlCollapsed.value = !isControlCollapsed.value
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

  // 监听相机变化
  viewer.camera.changed.addEventListener(updateCameraInfo)
  // 初始化时立即更新一次
  updateCameraInfo()

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
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // Add custom map layers
  addTiandituLayer()
  addToomapLayer()

  // 注册自定义材质
  registerCustomMaterials()

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(114, 25, 10000),
    duration: 0
  })
}

// Custom Material Property Class
class EllipsoidTrailMaterialProperty {
  constructor(options) {
    this._definitionChanged = new Cesium.Event();
    this._color = undefined;
    this._speed = undefined;
    this.color = options.color;
    this.speed = options.speed;
  }
  get isConstant() { return false; }
  get definitionChanged() { return this._definitionChanged; }
  getType(time) { return 'EllipsoidTrailMaterialType'; }
  getValue(time, result) {
    if (!Cesium.defined(result)) { result = {}; }
    result.color = Cesium.Property.getValueOrDefault(this._color, time, Cesium.Color.RED, result.color);
    result.speed = Cesium.Property.getValueOrDefault(this._speed, time, 10, result.speed);
    return result;
  }
  equals(other) {
    return this === other || (other instanceof EllipsoidTrailMaterialProperty && Cesium.Property.equals(this._color, other._color) && Cesium.Property.equals(this._speed, other._speed));
  }
}

Object.defineProperties(EllipsoidTrailMaterialProperty.prototype, {
  color: Cesium.createPropertyDescriptor("color"),
  speed: Cesium.createPropertyDescriptor("speed"),
});

// 注册自定义材质
const registerCustomMaterials = () => {
  if (!Cesium.Material._materialCache.getMaterial('EllipsoidTrailMaterialType')) {
    const EllipsoidTrailMaterialSource = `
      uniform vec4 color;
      uniform float speed;
      czm_material czm_getMaterial(czm_materialInput materialInput){
        czm_material material = czm_getDefaultMaterial(materialInput);
        vec2 st = materialInput.st;
        float time = fract(czm_frameNumber * speed / 10000.0);
        float alpha = abs(smoothstep(0.5,1.,fract( -st.t - time)));
        alpha += .1;
        material.alpha = alpha;
        material.diffuse = color.rgb;
        return material;
      }
    `;

    Cesium.Material._materialCache.addMaterial('EllipsoidTrailMaterialType', {
      fabric: {
        type: 'EllipsoidTrailMaterialType',
        uniforms: {
          color: new Cesium.Color(1.0, 0.0, 0.0, 1.0),
          speed: 10.0,
        },
        source: EllipsoidTrailMaterialSource,
      },
      translucent: function (material) { return true; },
    });
  }
}

// 创建静态圆环特效
const createExpandingRing1 = () => {
  const shaderSource = `
    czm_material czm_getMaterial(czm_materialInput materialInput){
      czm_material material = czm_getDefaultMaterial(materialInput);
      vec2 st = materialInput.st;
      float dist = distance(st, vec2(0.5));
      if(dist <= 0.5 && dist > 0.4){
        dist = smoothstep(0.2, 0.9, dist);
        material.diffuse = vec3(1.0 - dist, 0.0, 0.0);
        material.alpha = 1.0 - dist;
      } else {
        material.alpha = 0.0;
      }
      return material;
    }
  `

  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.CircleGeometry({
        center: Cesium.Cartesian3.fromDegrees(113.997, 25, 1000),
        radius: 100.0,
        height: 1000,
      })
    }),
    appearance: new Cesium.MaterialAppearance({
      material: new Cesium.Material({
        translucent: false,
        fabric: {
          type: 'expandingRing1',
          uniforms: {
            color: new Cesium.Color(1, 0, 0, 1),
          },
          source: shaderSource
        }
      })
    })
  })

  viewer.scene.primitives.add(primitive)
  return primitive
}

// 创建动态扩散圆环
const createExpandingRing2 = () => {
  const shaderSource = `
    czm_material czm_getMaterial(czm_materialInput materialInput){
      czm_material material = czm_getDefaultMaterial(materialInput);
      vec2 st = materialInput.st;
      float dist = distance(st, vec2(0.5));
      float time = clamp(fract(czm_frameNumber / 500.0) * 0.5, 0.0, 0.5);
      float time2 = time + 0.01;
      float val = step(time, dist) * step(-time2, -dist);
      material.diffuse = vec3(val, 0.0, 0.0);
      material.alpha = val;
      return material;
    }
  `

  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.CircleGeometry({
        center: Cesium.Cartesian3.fromDegrees(114, 25, 1000),
        radius: 100.0,
        height: 1000,
      })
    }),
    appearance: new Cesium.MaterialAppearance({
      material: new Cesium.Material({
        translucent: false,
        fabric: {
          type: 'expandingRing2',
          uniforms: {
            color: new Cesium.Color(1, 0, 0, 1),
          },
          source: shaderSource
        }
      })
    })
  })

  viewer.scene.primitives.add(primitive)
  return primitive
}

// 创建贴地扩散圆环
const createGroundRing = () => {
  const shaderSource = `
    czm_material czm_getMaterial(czm_materialInput materialInput){
      czm_material material = czm_getDefaultMaterial(materialInput);
      vec2 st = materialInput.st;
      float dist = distance(st, vec2(0.5));
      float time = clamp(fract(czm_frameNumber / 500.0) * 0.5, 0.0, 0.5);
      float time2 = time + 0.01;
      float val = step(time, dist) * step(-time2, -dist);
      material.diffuse = vec3(val, 0.0, 0.0);
      material.alpha = val;
      return material;
    }
  `

  const primitive = new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.CircleGeometry({
        center: Cesium.Cartesian3.fromDegrees(113.997, 24.99, 0),
        radius: 200.0,
      })
    }),
    appearance: new Cesium.MaterialAppearance({
      material: new Cesium.Material({
        translucent: true,
        fabric: {
          type: 'groundRing',
          uniforms: {
            color: new Cesium.Color(1, 0, 0, 1),
          },
          source: shaderSource
        }
      })
    })
  })

  viewer.scene.primitives.add(primitive)
  return primitive
}

// 创建流动线条特效
const createFlowLine = () => {
  const shaderSource = `
    uniform vec4 color;
    czm_material czm_getMaterial(czm_materialInput materialInput)
    {
      czm_material material = czm_getDefaultMaterial(materialInput);
      vec2 st = materialInput.st;
      float dist = st.s;
      float time = clamp(fract(czm_frameNumber / 500.0) * 0.5, 0.0, 0.5);
      float time2 = time + 0.01;
      float val = step(time, dist) * step(-time2, -dist);
      material.diffuse = vec3(val, 0.0, 0.0);
      material.alpha = val;
      return material;
    }
  `

  const myMaterial = new Cesium.Material({
    translucent: false,
    fabric: {
      type: 'flowLine',
      uniforms: {
        color: new Cesium.Color(1, 1, 0, 1),
      },
      source: shaderSource
    }
  })

  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          114.02, 25.02, 1000,
          114.05, 25.02, 1000
        ]),
        width: 10,
      })
    }),
    appearance: new Cesium.PolylineMaterialAppearance({
      material: myMaterial
    })
  })

  viewer.scene.primitives.add(primitive)
  return primitive
}

// 创建绿线流动特效
const createGreenFlowLine = () => {
  const shaderSource = `
    uniform vec4 color;
    uniform float lineWidth;

    czm_material czm_getMaterial(czm_materialInput materialInput) {
      vec4 outColor = color;
      czm_material material = czm_getDefaultMaterial(materialInput);
      vec2 st = materialInput.st;
      float time = fract(czm_frameNumber / 1000.0);
      float linePositionX = time;
      if(st.s > linePositionX - lineWidth / 2.0 && st.s < linePositionX + lineWidth / 2.0) {
        outColor.rgb = vec3(0.0, 1.0, 0.0);
      }
      material.diffuse = czm_gammaCorrect(outColor.rgb);
      material.alpha = outColor.a;
      return material;
    }
  `

  const myMaterial = new Cesium.Material({
    translucent: false,
    fabric: {
      type: 'greenFlowLine',
      uniforms: {
        color: new Cesium.Color(1, 0, 0, 1),
        lineWidth: 0.1
      },
      source: shaderSource
    }
  })

  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          114.02, 25.04, 1000,
          114.05, 25.04, 1000
        ]),
        width: 10,
      })
    }),
    appearance: new Cesium.PolylineMaterialAppearance({
      material: myMaterial
    })
  })

  viewer.scene.primitives.add(primitive)
  return primitive
}

// 创建轨迹球体特效
const createTrailEllipsoid = () => {
  const entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(113.97, 25, 1000),
    name: '轨迹球体',
    ellipsoid: {
      radii: new Cesium.Cartesian3(500.0, 500.0, 500.0),
      material: new EllipsoidTrailMaterialProperty({
        color: new Cesium.Color(1.0, 1.0, 0.0, 0.4),
        speed: 10.0
      })
    }
  })
  return entity
}

// 创建渐变几何体特效
const createGradientGeometry = () => {
  const shaderSource = `
    uniform vec4 color;
    uniform float gradationNumber;

    czm_material czm_getMaterial(czm_materialInput materialInput)
    {
      vec4 outColor = color;
      czm_material material = czm_getDefaultMaterial(materialInput);
      vec2 st = materialInput.st;
      outColor.a = fract(st.s * gradationNumber);
      material.diffuse = czm_gammaCorrect(outColor.rgb);
      material.alpha = outColor.a;
      return material;
    }
  `

  const myMaterial = new Cesium.Material({
    translucent: false,
    fabric: {
      type: 'gradientGeometry',
      uniforms: {
        color: new Cesium.Color(0, 1, 0, 1),
        gradationNumber: 4,
      },
      source: shaderSource
    }
  })

  const appearance = new Cesium.MaterialAppearance({
    material: myMaterial,
  })

  const polylineAppearance = new Cesium.PolylineMaterialAppearance({
    material: myMaterial
  })

  // 创建多边形
  const polygonPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray([
          114, 25,
          114.01, 25,
          114.01, 25.01,
          114, 25.01,
        ])),
        height: 1000
      })
    }),
    appearance
  })

  // 创建立方体
  const boxPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: Cesium.BoxGeometry.fromDimensions({
        dimensions: new Cesium.Cartesian3(1000, 1000, 1000)
      }),
      modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(114.005, 25.02, 1000))
    }),
    appearance
  })

  // 创建线条
  const polylinePrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          114.02, 25.02, 1000,
          114.05, 25.02, 1000
        ]),
        width: 2,
      })
    }),
    appearance: polylineAppearance
  })

  // 创建球体
  const ellipsoidPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.EllipsoidGeometry({
        radii: new Cesium.Cartesian3(1000, 1000, 1000),
      }),
      modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(114.03, 25.005, 1000))
    }),
    appearance
  })

  viewer.scene.primitives.add(polygonPrimitive)
  viewer.scene.primitives.add(boxPrimitive)
  viewer.scene.primitives.add(polylinePrimitive)
  viewer.scene.primitives.add(ellipsoidPrimitive)

  return [polygonPrimitive, boxPrimitive, polylinePrimitive, ellipsoidPrimitive]
}

// 切换特效
const toggleEffect = (effectName) => {
  if (activeEffects.value.includes(effectName)) {
    // 移除特效
    removeEffect(effectName)
    activeEffects.value = activeEffects.value.filter(e => e !== effectName)
  } else {
    // 添加特效
    addEffect(effectName)
    activeEffects.value.push(effectName)
  }
}

// 添加特效
const addEffect = (effectName) => {
  let flyToTarget = null

  switch (effectName) {
    case 'expandingRing1':
      primitives[effectName] = createExpandingRing1()
      flyToTarget = { lon: 113.997, lat: 25, height: 2000 }
      break
    case 'expandingRing2':
      primitives[effectName] = createExpandingRing2()
      flyToTarget = { lon: 114, lat: 25, height: 2000 }
      break
    case 'groundRing':
      primitives[effectName] = createGroundRing()
      flyToTarget = { lon: 113.997, lat: 24.99, height: 2000 }
      break
    case 'flowLine':
      primitives[effectName] = createFlowLine()
      flyToTarget = { lon: 114.035, lat: 25.02, height: 3000 }
      break
    case 'greenFlowLine':
      primitives[effectName] = createGreenFlowLine()
      flyToTarget = { lon: 114.035, lat: 25.04, height: 3000 }
      break
    case 'trailEllipsoid':
      primitives[effectName] = createTrailEllipsoid()
      flyToTarget = { lon: 113.97, lat: 25, height: 3000 }
      break
    case 'gradientGeometry':
      primitives[effectName] = createGradientGeometry()
      flyToTarget = { lon: 114.01, lat: 25.01, height: 5000 }
      break
  }

  // 执行相机飞行
  if (flyToTarget && viewer) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(flyToTarget.lon, flyToTarget.lat, flyToTarget.height),
      duration: 1.5
    })
  }
}

// 移除特效
const removeEffect = (effectName) => {
  const primitive = primitives[effectName]
  if (primitive) {
    if (Array.isArray(primitive)) {
      primitive.forEach(p => viewer.scene.primitives.remove(p))
    } else if (primitive instanceof Cesium.Entity) {
      viewer.entities.remove(primitive)
    } else {
      viewer.scene.primitives.remove(primitive)
    }
    delete primitives[effectName]
  }
}

// 清除所有特效
const clearAllEffects = () => {
  activeEffects.value.forEach(effectName => {
    removeEffect(effectName)
  })
  activeEffects.value = []
}

onMounted(() => {
  initCesium()
})

onUnmounted(() => {
  if (handler) {
    handler.destroy()
    handler = null
  }
  if (viewer) {
    viewer.destroy()
  }
})
</script>

<style scoped>
.shader-page {
  width: 100%;
  height: 100%;
  position: relative;
}

#cesiumContainer {
  width: 100%;
  height: 100%;
}

:deep(.cesium-viewer-bottom) {
  display: none !important;
}

.shader-controls {
  position: absolute;
  top: 60px;
  right: 20px;
  width: 200px;
  background: rgba(20, 20, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  z-index: 1000;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  transition: all 0.3s ease;
}

.shader-controls.collapsed {
  width: 150px;
}

.control-header {
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(60, 60, 60, 0.6) 0%, rgba(80, 80, 80, 0.5) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}

.control-header:hover {
  background: linear-gradient(135deg, rgba(70, 70, 70, 0.7) 0%, rgba(90, 90, 90, 0.6) 100%);
}

.collapse-icon {
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

.control-content {
  padding: 12px;
  max-height: 70vh;
  overflow-y: auto;
}

.effect-group {
  margin-bottom: 15px;
}

.group-title {
  font-size: 12px;
  font-weight: 600;
  color: #3085d6;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(48, 133, 214, 0.3);
}

.effect-btn {
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.effect-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(48, 133, 214, 0.5);
}

.effect-btn.active {
  background: rgba(48, 133, 214, 0.2);
  border-color: #3085d6;
  color: #3085d6;
  font-weight: 600;
}

.clear-btn {
  width: 100%;
  padding: 6px 10px;
  margin-top: 5px;
  background: rgba(220, 53, 69, 0.2);
  border: 1px solid rgba(220, 53, 69, 0.5);
  border-radius: 4px;
  color: #dc3545;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: rgba(220, 53, 69, 0.3);
  border-color: #dc3545;
}

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

/* 滚动条样式 */
.control-content::-webkit-scrollbar {
  width: 6px;
}

.control-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.control-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.control-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 页面说明样式 */
.page-info {
  position: absolute;
  top: 80px;
  left: 20px;
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
</style>
