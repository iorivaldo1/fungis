const X_PI = (Math.PI * 3000.0) / 180.0
const AXIS = 6378245.0
const OFFSET = 0.00669342162296594323

const MCBAND = [12890594.86, 8362377.87, 5591021, 3481989.83, 1678043.12, 0]
const MC2LL = [
  [
    1.410526172116255e-8, 0.00000898305509648872, -1.9939833816331,
    200.9824383106796, -187.2403703815547, 91.6087516669843, -23.38765649603339,
    2.57121317296198, -0.03801003308653, 17337981.2
  ],
  [
    -7.435856389565537e-9, 0.000008983055097726239, -0.78625201886289,
    96.32687599759846, -1.85204757529826, -59.36935905485877, 47.40033549296737,
    -16.50741931063887, 2.28786674699375, 10260144.86
  ],
  [
    -3.030883460898826e-8, 0.00000898305509983578, 0.30071316287616,
    59.74293618442277, 7.357984074871, -25.38371002664745, 13.45380521110908,
    -3.29883767235584, 0.32710905363475, 6856817.37
  ],
  [
    -1.981981304930552e-8, 0.000008983055099779535, 0.03278182852591,
    40.31678527705744, 0.65659298677277, -4.44255534477492, 0.85341911805263,
    0.12923347998204, -0.04625736007561, 4482777.06
  ],
  [
    3.09191371068437e-9, 0.000008983055096812155, 0.00006995724062,
    23.10934304144901, -0.00023663490511, -0.6321817810242, -0.00663494467273,
    0.03430082397953, -0.00466043876332, 2555164.4
  ],
  [
    2.890871144776878e-9, 0.000008983055095805407, -0.00000003068298,
    7.47137025468032, -0.00000353937994, -0.02145144861037, -0.00001234426596,
    0.00010322952773, -0.00000323890364, 826088.5
  ]
]

const BAIDU_SCRIPT_ID = 'baidu-map-script'
const BAIDU_CALLBACK = '__fungisBMapReadyCallback'
const DEFAULT_TIMEOUT_MS = 12000
let baiduScriptPromise = null

function getBMapNamespace () {
  return window.BMap || window.BMapGL || null
}

function isBMapReady () {
  const bmap = getBMapNamespace()
  return Boolean(bmap && bmap.Point && bmap.Map && bmap.TileLayer)
}

function waitForBMapReady (timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = 50) {
  return new Promise((resolve, reject) => {
    if (isBMapReady()) {
      resolve()
      return
    }

    const start = Date.now()
    const timer = window.setInterval(() => {
      if (isBMapReady()) {
        window.clearInterval(timer)
        resolve()
        return
      }
      if (Date.now() - start >= timeoutMs) {
        window.clearInterval(timer)
        reject(new Error('百度地图脚本已加载，但 BMap 未就绪'))
      }
    }, intervalMs)
  })
}

function loadScriptOnce (src, id, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let timeoutId = null
    let settled = false
    const finishResolve = () => {
      if (settled) return
      settled = true
      if (timeoutId) window.clearTimeout(timeoutId)
      resolve()
    }
    const finishReject = error => {
      if (settled) return
      settled = true
      if (timeoutId) window.clearTimeout(timeoutId)
      reject(error)
    }

    const existedScript = document.getElementById(id)
    if (existedScript) {
      if (isBMapReady()) {
        finishResolve()
        return
      }
      existedScript.remove()
    }

    window[BAIDU_CALLBACK] = () => {
      waitForBMapReady(timeoutMs).then(finishResolve).catch(finishReject)
    }

    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.onerror = () =>
      finishReject(new Error(`百度地图脚本加载失败: ${src}`))
    document.head.appendChild(script)

    timeoutId = window.setTimeout(() => {
      finishReject(
        new Error('百度地图脚本加载超时（可能是 AK 白名单或网络问题）')
      )
    }, timeoutMs)
  })
}

function getRange (value, min, max) {
  let result = value
  if (min != null) result = Math.max(result, min)
  if (max != null) result = Math.min(result, max)
  return result
}

function getLoop (value, min, max) {
  let result = value
  while (result > max) result -= max - min
  while (result < min) result += max - min
  return result
}

function convertor (point, factor) {
  if (!point || !factor) return null
  const x = factor[0] + factor[1] * Math.abs(point.lng)
  const c = Math.abs(point.lat) / factor[9]
  const y =
    factor[2] +
    factor[3] * c +
    factor[4] * c ** 2 +
    factor[5] * c ** 3 +
    factor[6] * c ** 4 +
    factor[7] * c ** 5 +
    factor[8] * c ** 6
  return {
    lng: x * (point.lng < 0 ? -1 : 1),
    lat: y * (point.lat < 0 ? -1 : 1)
  }
}

export function bd09mcToLngLat (x, y) {
  let factor = null
  for (let i = 0; i < MCBAND.length; i += 1) {
    if (Math.abs(y) >= MCBAND[i]) {
      factor = MC2LL[i]
      break
    }
  }
  const point = convertor({ lng: x, lat: y }, factor || MC2LL[MC2LL.length - 1])
  if (!point) {
    return { lng: 0, lat: 0 }
  }
  return {
    lng: getLoop(point.lng, -180, 180),
    lat: getRange(point.lat, -74, 74)
  }
}

function transformLat (x, y) {
  let ret =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x))
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret +=
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  ret +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3
  return ret
}

function transformLng (x, y) {
  let ret =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret +=
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  ret +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3
  return ret
}

function outOfChina (lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function bd09ToGcj02 (lng, lat) {
  const x = lng - 0.0065
  const y = lat - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI)
  return [z * Math.cos(theta), z * Math.sin(theta)]
}

export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) {
    return [lng, lat]
  }
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - OFFSET * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * Math.PI)
  dLng = (dLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * Math.PI)
  const mgLat = lat + dLat
  const mgLng = lng + dLng
  return [mgLng, mgLat]
}

export function gcj02ToBd09(lng, lat) {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI)
  const bdLng = z * Math.cos(theta) + 0.0065
  const bdLat = z * Math.sin(theta) + 0.006
  return [bdLng, bdLat]
}

function gcj02ToWgs84 (lng, lat) {
  if (outOfChina(lng, lat)) {
    return [lng, lat]
  }
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - OFFSET * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat =
    (dLat * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * Math.PI)
  dLng = (dLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * Math.PI)
  const mgLat = lat + dLat
  const mgLng = lng + dLng
  return [lng * 2 - mgLng, lat * 2 - mgLat]
}

function bd09ToWgs84 (lng, lat) {
  const [gcjLng, gcjLat] = bd09ToGcj02(lng, lat)
  return gcj02ToWgs84(gcjLng, gcjLat)
}

function normalizeOpacity (opacity) {
  const value = Number(opacity)
  if (Number.isNaN(value)) return 0.6
  if (value < 0) return 0
  if (value > 1) return 1
  return Number(value.toFixed(2))
}

function createWmsLayer (layerName, zIndex, geoserverUrl, opacity = 0.6) {
  const bmap = getBMapNamespace()
  const layer = new bmap.TileLayer({ isTransparentPng: true, zIndex })
  layer.getTilesUrl = function getTilesUrl (tileCoord, zoom) {
    const x = tileCoord.x
    const y = tileCoord.y
    const res = 1 << (18 - zoom)
    const minX = x * 256 * res
    const minY = y * 256 * res
    const maxX = (x + 1) * 256 * res
    const maxY = (y + 1) * 256 * res

    const ptMin = bd09mcToLngLat(minX, minY)
    const ptMax = bd09mcToLngLat(maxX, maxY)
    const wgsMin = bd09ToWgs84(ptMin.lng, ptMin.lat)
    const wgsMax = bd09ToWgs84(ptMax.lng, ptMax.lat)
    const bbox = `${wgsMin[0]},${wgsMin[1]},${wgsMax[0]},${wgsMax[1]}`
    const normalizedOpacity = normalizeOpacity(opacity)

    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.1.0',
      REQUEST: 'GetMap',
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      LAYERS: layerName,
      SRS: 'EPSG:4326',
      STYLES: 'ras_opacity',
      env: `myOpacity:${normalizedOpacity}`,
      WIDTH: '256',
      HEIGHT: '256',
      BBOX: bbox
    })
    return `${geoserverUrl}?${params.toString()}`
  }
  return layer
}

export async function loadBaiduMapScript (ak) {
  if (!ak) {
    throw new Error('缺少百度地图 AK')
  }
  if (baiduScriptPromise) {
    return baiduScriptPromise
  }
  if (isBMapReady()) {
    return
  }
  const scriptUrl = `https://api.map.baidu.com/api?v=3.0&ak=${ak}&callback=${BAIDU_CALLBACK}`
  baiduScriptPromise = loadScriptOnce(scriptUrl, BAIDU_SCRIPT_ID).catch(
    error => {
      baiduScriptPromise = null
      throw error
    }
  )
  await baiduScriptPromise
}

export function initBaiduTopicMap ({
  containerId,
  geoserverUrl,
  layerName = 'WMS_JPG:sc_all_color',
  opacity = 0.6,
  zIndex = 1,
  centerLng = 104,
  centerLat = 30.7,
  zoom = 8
}) {
  if (!isBMapReady()) {
    throw new Error('百度地图 API 未就绪（BMap 不可用）')
  }
  const bmap = getBMapNamespace()
  const center = new bmap.Point(centerLng, centerLat)
  const map = new bmap.Map(containerId)
  map.centerAndZoom(center, zoom)
  map.enableScrollWheelZoom(true)
  if (typeof map.setMapStyleV2 === 'function') {
    map.setMapStyleV2({
      styleJson: [
        {
          featureType: 'districtlabel',
          elementType: 'all',
          stylers: { visibility: 'off' }
        }
      ]
    })
  }
  const topicLayer = createWmsLayer(layerName, zIndex, geoserverUrl, opacity)
  map.addTileLayer(topicLayer)
  return { map, topicLayer }
}

export function resetBaiduMapCenter (
  map,
  { lng = 104, lat = 30.7, zoom = 8 } = {}
) {
  if (!map) return
  const bmap = getBMapNamespace()
  if (!bmap) return
  const center = new bmap.Point(lng, lat)
  map.centerAndZoom(center, zoom)
}

export function disposeBaiduTopicMap (map, topicLayer) {
  if (map && topicLayer) {
    map.removeTileLayer(topicLayer)
  }
}

export function switchBaiduTopicLayer (
  map,
  currentLayer,
  { layerName, geoserverUrl, opacity = 0.6, zIndex = 1 }
) {
  if (!map) {
    throw new Error('地图实例不存在，无法切换图层')
  }
  if (!layerName) {
    throw new Error('缺少图层名称')
  }
  if (!geoserverUrl) {
    throw new Error('缺少 geoserverUrl')
  }
  if (currentLayer) {
    map.removeTileLayer(currentLayer)
  }
  const nextLayer = createWmsLayer(layerName, zIndex, geoserverUrl, opacity)
  map.addTileLayer(nextLayer)
  return nextLayer
}

export function normalizeError (error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return '未知错误'
}
