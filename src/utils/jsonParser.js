import { bd09ToWgs84, gcj02ToWgs84 } from '@/utils/baiduUtils.js'
import { ensureWgs84GeoJson } from '@/utils/shpMapRenderer.js'

/**
 * 坐标系转换工具：将 BD09 / GCJ02 转换回 WGS84 经纬度
 */
export function convertCoordinateToWgs84([lng, lat], crs = 'wgs84') {
  if (crs === 'bd09') {
    return bd09ToWgs84(lng, lat)
  }
  if (crs === 'gcj02') {
    return gcj02ToWgs84(lng, lat)
  }
  return [lng, lat]
}

/**
 * 将整份 GeoJSON 中的坐标按指定坐标系 (BD09 / GCJ02) 转回 WGS84
 */
export function transformGeoJsonCrs(geojson, crs = 'wgs84') {
  if (!crs || crs === 'wgs84' || !geojson || !geojson.features) return geojson

  const transformCoord = (coord) => {
    if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
      return convertCoordinateToWgs84(coord, crs)
    }
    if (Array.isArray(coord)) {
      return coord.map(transformCoord)
    }
    return coord
  }

  const newGeojson = JSON.parse(JSON.stringify(geojson))
  newGeojson.features.forEach(feature => {
    if (feature.geometry && feature.geometry.coordinates) {
      feature.geometry.coordinates = transformCoord(feature.geometry.coordinates)
    }
  })

  return newGeojson
}

/**
 * 将 TopoJSON 解码转换为 GeoJSON FeatureCollection
 */
function decodeTopoJson(topo) {
  if (!topo || topo.type !== 'Topology' || !topo.objects) return null

  const transform = topo.transform
  const rawArcs = topo.arcs || []

  // 解码 arcs
  const decodedArcs = rawArcs.map(arc => {
    let x = 0, y = 0
    const scale = transform ? transform.scale : [1, 1]
    const translate = transform ? transform.translate : [0, 0]
    return arc.map(pt => {
      x += pt[0]
      y += pt[1]
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]]
    })
  })

  function getArcCoordinates(arcIndex) {
    if (arcIndex >= 0) {
      return decodedArcs[arcIndex] ? [...decodedArcs[arcIndex]] : []
    } else {
      const idx = ~arcIndex
      const arc = decodedArcs[idx]
      return arc ? [...arc].reverse() : []
    }
  }

  function mergeArcLine(arcIndexes) {
    let line = []
    arcIndexes.forEach((arcIdx, i) => {
      const pts = getArcCoordinates(arcIdx)
      if (i > 0 && line.length > 0 && pts.length > 0) {
        line = line.concat(pts.slice(1))
      } else {
        line = line.concat(pts)
      }
    })
    return line
  }

  function convertGeometry(geom) {
    if (!geom) return null
    const type = geom.type
    const properties = geom.properties || {}
    let geometry = null

    if (type === 'Point' || type === 'MultiPoint') {
      geometry = { type, coordinates: geom.coordinates }
    } else if (type === 'LineString') {
      geometry = { type: 'LineString', coordinates: mergeArcLine(geom.arcs) }
    } else if (type === 'MultiLineString') {
      geometry = {
        type: 'MultiLineString',
        coordinates: (geom.arcs || []).map(arcIndexes => mergeArcLine(arcIndexes))
      }
    } else if (type === 'Polygon') {
      geometry = {
        type: 'Polygon',
        coordinates: (geom.arcs || []).map(arcIndexes => mergeArcLine(arcIndexes))
      }
    } else if (type === 'MultiPolygon') {
      geometry = {
        type: 'MultiPolygon',
        coordinates: (geom.arcs || []).map(polyArcs => polyArcs.map(arcIndexes => mergeArcLine(arcIndexes)))
      }
    }

    if (geometry) {
      return { type: 'Feature', geometry, properties }
    }
    return null
  }

  const features = []
  Object.keys(topo.objects).forEach(key => {
    const obj = topo.objects[key]
    if (obj.type === 'GeometryCollection' && Array.isArray(obj.geometries)) {
      obj.geometries.forEach(g => {
        const feat = convertGeometry(g)
        if (feat) features.push(feat)
      })
    } else {
      const feat = convertGeometry(obj)
      if (feat) features.push(feat)
    }
  })

  return { type: 'FeatureCollection', features }
}

/**
 * 提取单个对象或记录中的 GeoJSON Feature
 */
function extractFeatureFromItem(item) {
  if (!item || typeof item !== 'object') return null

  // 已是 GeoJSON Feature
  if (item.type === 'Feature' && item.geometry) {
    return item
  }

  // 是 GeoJSON Geometry
  if (['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(item.type) && item.coordinates) {
    return { type: 'Feature', geometry: item, properties: {} }
  }

  // 包含 geometry 属性
  if (item.geometry && item.geometry.type && item.geometry.coordinates) {
    const { geometry, ...props } = item
    return { type: 'Feature', geometry, properties: item.properties || props }
  }

  // 包含点坐标字段 (lng/lon/longitude/jd, lat/latitude/wd)
  const lngVal = item.lng ?? item.lon ?? item.longitude ?? item.jd ?? item.x ?? item.LNG ?? item.LONGITUDE
  const latVal = item.lat ?? item.latitude ?? item.wd ?? item.y ?? item.LAT ?? item.LATITUDE

  const lng = parseFloat(lngVal)
  const lat = parseFloat(latVal)

  if (!isNaN(lng) && !isNaN(lat)) {
    const properties = { ...item }
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties
    }
  }

  return null
}

/**
 * 解析任意 JSON 内容为标准的 WGS84 GeoJSON FeatureCollection
 * @param {Object|String} rawData 原始 JSON 对象或 JSON 字符串
 * @param {String} prjText 可选投影参数文本
 * @returns {Object} GeoJSON FeatureCollection
 */
export function parseJsonToGeoJson(rawData, prjText = '') {
  let data = rawData
  if (typeof rawData === 'string') {
    try {
      data = JSON.parse(rawData)
    } catch (e) {
      throw new Error('JSON 格式解析失败: ' + e.message)
    }
  }

  if (!data || typeof data !== 'object') {
    throw new Error('无效的 JSON 数据结构')
  }

  let geojson = null

  // 1. 标准 GeoJSON FeatureCollection
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    geojson = data
  } 
  // 2. 单个 GeoJSON Feature
  else if (data.type === 'Feature' && data.geometry) {
    geojson = { type: 'FeatureCollection', features: [data] }
  }
  // 3. TopoJSON 格式
  else if (data.type === 'Topology' && data.objects) {
    geojson = decodeTopoJson(data)
  }
  // 4. 单个 GeoJSON Geometry
  else if (['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(data.type)) {
    geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: data, properties: {} }] }
  }
  // 5. 数组 (Feature 数组、Geometry 数组、或者带点坐标的对象数组)
  else if (Array.isArray(data)) {
    const features = data.map(extractFeatureFromItem).filter(Boolean)
    geojson = { type: 'FeatureCollection', features }
  }
  // 6. 包含 features / data / geometries / rows 列表的外层包装对象
  else {
    const list = data.features || data.data || data.geometries || data.rows || data.list || data.results || data.records
    if (Array.isArray(list)) {
      const features = list.map(extractFeatureFromItem).filter(Boolean)
      geojson = { type: 'FeatureCollection', features }
    } else {
      const feat = extractFeatureFromItem(data)
      if (feat) {
        geojson = { type: 'FeatureCollection', features: [feat] }
      }
    }
  }

  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
    throw new Error('未在 JSON 中自动找到标准 GeoJSON。建议通过映射确认框指定经纬度字段。')
  }

  // 校验并重投影（如为米制平面坐标，自动转为 WGS84 经纬度）
  return ensureWgs84GeoJson(geojson, prjText)
}

/**
 * 分析 JSON 数据结构，获取可用节点路径、可用字段列表及推荐的经纬度字段名
 */
export function analyzeJsonStructure(rawData) {
  let data = rawData
  if (typeof rawData === 'string') {
    try {
      data = JSON.parse(rawData)
    } catch (e) {
      return { isGeoJson: false, rootPaths: [], fields: [], defaultLon: '', defaultLat: '', sampleList: [] }
    }
  }

  if (!data || typeof data !== 'object') {
    return { isGeoJson: false, rootPaths: [], fields: [], defaultLon: '', defaultLat: '', sampleList: [] }
  }

  const isGeoJson = (data.type === 'FeatureCollection' || data.type === 'Feature' || data.type === 'Topology')

  const rootPaths = []
  if (Array.isArray(data)) {
    rootPaths.push({ label: `根节点 [Array] (${data.length}条)`, value: '' })
  } else {
    Object.keys(data).forEach(key => {
      if (Array.isArray(data[key])) {
        rootPaths.push({ label: `${key} [Array] (${data[key].length}条)`, value: key })
      }
    })
    if (rootPaths.length === 0) {
      rootPaths.push({ label: '根节点对象', value: '' })
    }
  }

  // 获取第一层数据样本
  let sampleList = []
  if (Array.isArray(data)) {
    sampleList = data
  } else {
    const firstArrKey = rootPaths[0]?.value
    sampleList = firstArrKey ? data[firstArrKey] : (data.features || data.data || data.rows || data.records || data.list || [data])
  }

  const fieldsSet = new Set()
  if (Array.isArray(sampleList)) {
    sampleList.slice(0, 20).forEach(item => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach(k => fieldsSet.add(k))
      }
    })
  }

  const fields = Array.from(fieldsSet)

  // 推荐经纬度字段
  let defaultLon = ''
  let defaultLat = ''

  const lonRegex = /^(lng|lon|long|longitude|jd|经度|x|center_x)$/i
  const latRegex = /^(lat|lati|latitude|wd|纬度|y|center_y)$/i

  fields.forEach(f => {
    if (!defaultLon && lonRegex.test(f)) defaultLon = f
    if (!defaultLat && latRegex.test(f)) defaultLat = f
  })

  if (!defaultLon) {
    defaultLon = fields.find(f => /lng|lon|long|jd|经度|^x$/i.test(f)) || ''
  }
  if (!defaultLat) {
    defaultLat = fields.find(f => /lat|lati|wd|纬度|^y$/i.test(f)) || ''
  }

  return {
    isGeoJson,
    rootPaths,
    fields,
    defaultLon,
    defaultLat,
    sampleList: Array.isArray(sampleList) ? sampleList.slice(0, 5) : []
  }
}

/**
 * 根据指定的字段映射与渲染类型，将 JSON 数据转换为标准的 WGS84 GeoJSON FeatureCollection
 */
export function convertJsonWithMapping(rawData, mapping = {}) {
  const {
    crs = 'wgs84',         // 'wgs84' | 'bd09' | 'gcj02'
    featureType = 'auto',  // 'auto' | 'Point' | 'LineString' | 'Polygon'
    rootPath = '',         // 节点路径
    lonField = '',         // 经度字段名
    latField = '',         // 纬度字段名
    groupField = ''        // 分组字段名
  } = mapping

  let data = rawData
  if (typeof rawData === 'string') {
    try {
      data = JSON.parse(rawData)
    } catch (e) {
      throw new Error('JSON 解析失败: ' + e.message)
    }
  }

  // 1. 如果选择了 'auto' (自动模式)
  if (featureType === 'auto') {
    const rawGeojson = parseJsonToGeoJson(data)
    return transformGeoJsonCrs(rawGeojson, crs)
  }

  // 2. 查找目标数据数组
  let list = []
  if (rootPath !== undefined && rootPath !== '') {
    list = data[rootPath] || []
  } else if (Array.isArray(data)) {
    list = data
  } else if (data && typeof data === 'object') {
    list = data.features || data.data || data.rows || data.records || data.list || data.results || []
  }

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('未在 JSON 指定路径中找到有效的列表数据')
  }

  function parseCoord(item) {
    if (!item || typeof item !== 'object') return null
    let lngVal = item[lonField]
    let latVal = item[latField]

    if (lngVal === undefined || latVal === undefined) {
      lngVal = item.lng ?? item.lon ?? item.longitude ?? item.jd ?? item.x
      latVal = item.lat ?? item.latitude ?? item.wd ?? item.y
    }

    const rawLng = parseFloat(lngVal)
    const rawLat = parseFloat(latVal)

    if (!isNaN(rawLng) && !isNaN(rawLat)) {
      return convertCoordinateToWgs84([rawLng, rawLat], crs)
    }
    return null
  }

  const features = []

  // A. Point (点图层)
  if (featureType === 'Point') {
    list.forEach(item => {
      const coord = parseCoord(item)
      if (coord) {
        const { ...properties } = item
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coord },
          properties
        })
      }
    })
  }

  // B. LineString (折线图层)
  else if (featureType === 'LineString') {
    if (groupField) {
      const groups = {}
      list.forEach(item => {
        const key = item[groupField] ?? 'default'
        if (!groups[key]) groups[key] = { coords: [], props: item }
        const coord = parseCoord(item)
        if (coord) groups[key].coords.push(coord)
      })

      Object.keys(groups).forEach(key => {
        const { coords, props } = groups[key]
        if (coords.length >= 2) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { group: key, ...props }
          })
        }
      })
    } else {
      const coords = []
      list.forEach(item => {
        const c = parseCoord(item)
        if (c) coords.push(c)
      })
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { totalPoints: coords.length }
        })
      }
    }
  }

  // C. Polygon (多边形面图层)
  else if (featureType === 'Polygon') {
    if (groupField) {
      const groups = {}
      list.forEach(item => {
        const key = item[groupField] ?? 'default'
        if (!groups[key]) groups[key] = { coords: [], props: item }
        const coord = parseCoord(item)
        if (coord) groups[key].coords.push(coord)
      })

      Object.keys(groups).forEach(key => {
        const { coords, props } = groups[key]
        if (coords.length >= 3) {
          const ring = [...coords]
          const first = ring[0]
          const last = ring[ring.length - 1]
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]])
          }
          features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: { group: key, ...props }
          })
        }
      })
    } else {
      const coords = []
      list.forEach(item => {
        const c = parseCoord(item)
        if (c) coords.push(c)
      })
      if (coords.length >= 3) {
        const ring = [...coords]
        const first = ring[0]
        const last = ring[ring.length - 1]
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push([first[0], first[1]])
        }
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { totalPoints: coords.length }
        })
      }
    }
  }

  if (features.length === 0) {
    throw new Error('根据指定的字段映射未提取到有效的坐标数据。请检查经纬度字段选择。')
  }

  const geojson = { type: 'FeatureCollection', features }
  return ensureWgs84GeoJson(geojson)
}
