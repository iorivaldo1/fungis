import { wgs84ToGcj02, gcj02ToBd09 } from '@/utils/baiduUtils.js'
import * as Cesium from 'cesium'
import proj4 from 'proj4'

/**
 * 提取 PRJ 文本中的中央经线 (Central Meridian)
 */
function extractCentralMeridian(prjStr) {
  if (!prjStr || typeof prjStr !== 'string') return null

  // 1. 直接匹配 PARAMETER["Central_Meridian", 105.0] 或 Central_Meridian: 105
  let match = prjStr.match(/PARAMETER\["Central_Meridian"\s*,\s*([\d.]+)/i) ||
              prjStr.match(/Central_Meridian["\s,:]*([\d.]+)/i)
  if (match && match[1]) {
    const val = parseFloat(match[1])
    if (val > 0) return val
  }

  // 2. 匹配名称中的 CM_105E / CM_105 / 105E
  match = prjStr.match(/CM_([\d.]+)/i) || prjStr.match(/_([\d]{2,3})E/i)
  if (match && match[1]) {
    const val = parseFloat(match[1])
    if (val >= 70 && val <= 140) return val
  }

  // 3. 匹配带号 (如 3_Degree_GK_Zone_35 或 Zone_35 或 35带)
  match = prjStr.match(/Zone_([\d]+)/i) || prjStr.match(/([\d]{2})带/i)
  if (match && match[1]) {
    const z = parseInt(match[1], 10)
    if (z >= 24 && z <= 45) {
      return z * 3 // 3度带 (Zone 35 -> 105)
    }
    if (z >= 13 && z <= 23) {
      return z * 6 - 3 // 6度带 (Zone 18 -> 105)
    }
  }

  return null
}

/**
 * 获取第一个包含坐标的有效点
 */
function getFirstPoint(geojson) {
  if (!geojson || !geojson.features) return null
  for (const feature of geojson.features) {
    if (!feature.geometry || !feature.geometry.coordinates) continue
    let coords = feature.geometry.coordinates
    while (Array.isArray(coords) && Array.isArray(coords[0])) {
      coords = coords[0]
    }
    if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      return coords
    }
  }
  return null
}

/**
 * 递归转换坐标点
 */
function transformCoord(coord, transformFn) {
  if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
    return transformFn(coord[0], coord[1])
  }
  if (Array.isArray(coord)) {
    return coord.map(c => transformCoord(c, transformFn))
  }
  return coord
}

/**
 * 检查并确保 GeoJSON 为 WGS84 经纬度单位
 * 如果为平面投影坐标（如 CGCS2000 高斯克吕格 / UTM 等米制坐标），自动转回 WGS84
 */
export function ensureWgs84GeoJson(geojson, prjText = '') {
  if (!geojson || !geojson.features || geojson.features.length === 0) return geojson

  const samplePoint = getFirstPoint(geojson)
  if (!samplePoint) return geojson

  const [sampleX, sampleY] = samplePoint
  // 如果坐标已在 [-180, 180] 和 [-90, 90] 范围内，说明已经是地理经纬度
  if (Math.abs(sampleX) <= 180 && Math.abs(sampleY) <= 90) {
    return geojson
  }

  console.log('检测到 Shapefile 为平面投影坐标，正在自动重投影转为 WGS84 经纬度:', sampleX, sampleY)

  const extractedCM = extractCentralMeridian(prjText)

  const transformFn = (X, Y) => {
    const absX = Math.abs(X)
    let centralMeridian = extractedCM
    let actualX = X

    // 1. 如果 X 坐标包含带号 (8位数以上，如 35xxxxxx 或 18xxxxxx)
    if (absX >= 10000000) {
      const zone = Math.floor(absX / 1000000)
      actualX = X % 1000000

      if (!centralMeridian) {
        if (zone >= 24 && zone <= 45) {
          // 3度分带 (例如 35带 -> 105°)
          centralMeridian = zone * 3
        } else if (zone >= 13 && zone <= 23) {
          // 6度分带 (例如 18带 -> 105°)
          centralMeridian = zone * 6 - 3
        }
      }
    }

    // 2. 如果中央经线依然未识别出，默认使用 105° (沐川/乐山/四川最常用的 35带/105E 中央经线)
    if (!centralMeridian) {
      centralMeridian = 105
    }

    const cgcs2000Proj = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`
    const wgs84Proj = `+proj=longlat +datum=WGS84 +no_defs`

    try {
      const [lng, lat] = proj4(cgcs2000Proj, wgs84Proj, [actualX, Y])
      return [lng, lat]
    } catch (e) {
      console.warn('投影转换失败:', e)
      return [X, Y]
    }
  }

  // 深拷贝 GeoJSON 并转换所有坐标
  const newGeojson = JSON.parse(JSON.stringify(geojson))
  newGeojson.features.forEach(feature => {
    if (feature.geometry && feature.geometry.coordinates) {
      feature.geometry.coordinates = transformCoord(feature.geometry.coordinates, transformFn)
    }
  })

  return newGeojson
}

/**
 * 创建天地图圆点 Marker 覆盖物
 */
function createTiandituPointMarker(pt, color = '#3b82f6', size = 14, fillOpacity = 0.85) {
  const radius = size / 2
  const innerRadius = Math.max(1, radius - 1.5)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${radius}" cy="${radius}" r="${innerRadius}" fill="${color}" fill-opacity="${fillOpacity}" stroke="#ffffff" stroke-width="2"/>
  </svg>`
  const iconUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  const icon = new window.T.Icon({
    iconUrl,
    iconSize: new window.T.Point(size, size),
    iconAnchor: new window.T.Point(radius, radius)
  })
  return new window.T.Marker(pt, { icon })
}

/**
 * 将 GeoJSON 渲染为天地图 (TMap) 覆盖物组
 * @param {Object} map 天地图实例 (window.T.Map)
 * @param {Object} rawGeojson GeoJSON 数据
 * @param {String} color 渲染颜色 HEX/RGB
 * @returns {Object} { overlays: Array, boundsPoints: Array<T.LngLat> }
 */
export function renderGeoJsonToTianditu(map, rawGeojson, color = '#3b82f6') {
  const geojson = ensureWgs84GeoJson(rawGeojson)
  if (!map || !window.T || !geojson || !geojson.features) return { overlays: [], boundsPoints: [] }

  const overlays = []
  const boundsPoints = []

  const parseCoordsToLngLats = (coords) => {
    return coords.map(c => {
      const pt = new window.T.LngLat(c[0], c[1])
      boundsPoints.push(pt)
      return pt
    })
  }

  geojson.features.forEach(feature => {
    if (!feature.geometry) return
    const type = feature.geometry.type
    const coordinates = feature.geometry.coordinates

    if (type === 'Point') {
      const pt = new window.T.LngLat(coordinates[0], coordinates[1])
      boundsPoints.push(pt)
      const marker = createTiandituPointMarker(pt, color, 14, 0.85)
      map.addOverLay(marker)
      overlays.push(marker)
    } else if (type === 'MultiPoint') {
      coordinates.forEach(c => {
        const pt = new window.T.LngLat(c[0], c[1])
        boundsPoints.push(pt)
        const marker = createTiandituPointMarker(pt, color, 14, 0.85)
        map.addOverLay(marker)
        overlays.push(marker)
      })
    } else if (type === 'LineString') {
      const pts = parseCoordsToLngLats(coordinates)
      const polyline = new window.T.Polyline(pts, {
        color: color,
        weight: 3,
        opacity: 0.85
      })
      map.addOverLay(polyline)
      overlays.push(polyline)
    } else if (type === 'MultiLineString') {
      coordinates.forEach(lineCoords => {
        const pts = parseCoordsToLngLats(lineCoords)
        const polyline = new window.T.Polyline(pts, {
          color: color,
          weight: 3,
          opacity: 0.85
        })
        map.addOverLay(polyline)
        overlays.push(polyline)
      })
    } else if (type === 'Polygon') {
      const outerRing = parseCoordsToLngLats(coordinates[0] || [])
      const polygon = new window.T.Polygon(outerRing, {
        color: color,
        weight: 2,
        opacity: 0.85,
        fillColor: color,
        fillOpacity: 0.35
      })
      map.addOverLay(polygon)
      overlays.push(polygon)
    } else if (type === 'MultiPolygon') {
      coordinates.forEach(polyCoords => {
        const outerRing = parseCoordsToLngLats(polyCoords[0] || [])
        const polygon = new window.T.Polygon(outerRing, {
          color: color,
          weight: 2,
          opacity: 0.85,
          fillColor: color,
          fillOpacity: 0.35
        })
        map.addOverLay(polygon)
        overlays.push(polygon)
      })
    }
  })

  return { overlays, boundsPoints }
}

/**
 * 将 GeoJSON (WGS84) 转换坐标并渲染为百度地图 (BMap/BMapGL) 覆盖物组
 * @param {Object} map 百度地图实例
 * @param {Object} rawGeojson GeoJSON 数据 (WGS84)
 * @param {String} color 渲染颜色 HEX/RGB
 * @returns {Object} { overlays: Array, boundsPoints: Array<BMap.Point> }
 */
export function renderGeoJsonToBaidu(map, rawGeojson, color = '#3b82f6') {
  const geojson = ensureWgs84GeoJson(rawGeojson)
  if (!map || !geojson || !geojson.features) return { overlays: [], boundsPoints: [] }
  const BMap = window.BMap || window.BMapGL
  if (!BMap) return { overlays: [], boundsPoints: [] }

  const overlays = []
  const boundsPoints = []

  const convertWgsToBdPoint = (lng, lat) => {
    const gcj = wgs84ToGcj02(lng, lat)
    const [bdLng, bdLat] = gcj02ToBd09(gcj[0], gcj[1])
    const pt = new BMap.Point(bdLng, bdLat)
    boundsPoints.push(pt)
    return pt
  }

  const parseCoordsToBdPoints = (coords) => {
    return coords.map(c => convertWgsToBdPoint(c[0], c[1]))
  }

  geojson.features.forEach(feature => {
    if (!feature.geometry) return
    const type = feature.geometry.type
    const coordinates = feature.geometry.coordinates

    if (type === 'Point') {
      const pt = convertWgsToBdPoint(coordinates[0], coordinates[1])
      const marker = new BMap.Marker(pt)
      map.addOverlay(marker)
      overlays.push(marker)
    } else if (type === 'MultiPoint') {
      coordinates.forEach(c => {
        const pt = convertWgsToBdPoint(c[0], c[1])
        const marker = new BMap.Marker(pt)
        map.addOverlay(marker)
        overlays.push(marker)
      })
    } else if (type === 'LineString') {
      const pts = parseCoordsToBdPoints(coordinates)
      const polyline = new BMap.Polyline(pts, {
        strokeColor: color,
        strokeWeight: 3,
        strokeOpacity: 0.85
      })
      map.addOverlay(polyline)
      overlays.push(polyline)
    } else if (type === 'MultiLineString') {
      coordinates.forEach(lineCoords => {
        const pts = parseCoordsToBdPoints(lineCoords)
        const polyline = new BMap.Polyline(pts, {
          strokeColor: color,
          strokeWeight: 3,
          strokeOpacity: 0.85
        })
        map.addOverlay(polyline)
        overlays.push(polyline)
      })
    } else if (type === 'Polygon') {
      const outerRing = parseCoordsToBdPoints(coordinates[0] || [])
      const polygon = new BMap.Polygon(outerRing, {
        strokeColor: color,
        strokeWeight: 2,
        strokeOpacity: 0.85,
        fillColor: color,
        fillOpacity: 0.35
      })
      map.addOverlay(polygon)
      overlays.push(polygon)
    } else if (type === 'MultiPolygon') {
      coordinates.forEach(polyCoords => {
        const outerRing = parseCoordsToBdPoints(polyCoords[0] || [])
        const polygon = new BMap.Polygon(outerRing, {
          strokeColor: color,
          strokeWeight: 2,
          strokeOpacity: 0.85,
          fillColor: color,
          fillOpacity: 0.35
        })
        map.addOverlay(polygon)
        overlays.push(polygon)
      })
    }
  })

  return { overlays, boundsPoints }
}

/**
 * 获取 GeoJSON Feature 的中心点与包围盒
 */
export function getFeatureCenterAndBounds(feature) {
  if (!feature || !feature.geometry || !feature.geometry.coordinates) return null
  const pts = []
  function extractPts(coords) {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      pts.push([coords[0], coords[1]])
    } else if (Array.isArray(coords)) {
      coords.forEach(extractPts)
    }
  }
  extractPts(feature.geometry.coordinates)
  if (pts.length === 0) return null

  let minLng = pts[0][0], maxLng = pts[0][0], minLat = pts[0][1], maxLat = pts[0][1]
  let sumLng = 0, sumLat = 0
  pts.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    sumLng += lng
    sumLat += lat
  })

  const centerLng = sumLng / pts.length
  const centerLat = sumLat / pts.length

  return {
    center: [centerLng, centerLat],
    bounds: [[minLng, minLat], [maxLng, maxLat]],
    pts
  }
}

/**
 * 在天地图上聚焦并高亮闪烁 Feature 3 次
 */
export function flashFeatureTianditu(map, feature, highlightColor = '#ff0055') {
  if (!map || !window.T || !feature || !feature.geometry) return

  const info = getFeatureCenterAndBounds(feature)
  if (!info) return

  // 1. 视图居中
  const centerPt = new window.T.LngLat(info.center[0], info.center[1])
  const currentZoom = map.getZoom ? map.getZoom() : 14
  map.centerAndZoom(centerPt, Math.max(currentZoom, 16))

  // 2. 创建高亮闪烁覆盖物
  const geometry = feature.geometry
  const type = geometry.type
  const coords = geometry.coordinates
  let flashOverlay = null

  const parseCoords = (cList) => cList.map(c => new window.T.LngLat(c[0], c[1]))

  if (type === 'Point') {
    flashOverlay = createTiandituPointMarker(centerPt, highlightColor, 22, 0.95)
  } else if (type === 'LineString') {
    flashOverlay = new window.T.Polyline(parseCoords(coords), {
      color: highlightColor,
      weight: 6,
      opacity: 1
    })
  } else if (type === 'MultiLineString') {
    const polylines = coords.map(c => new window.T.Polyline(parseCoords(c), { color: highlightColor, weight: 6, opacity: 1 }))
    flashOverlay = {
      addToMap: () => polylines.forEach(p => map.addOverLay(p)),
      removeFromMap: () => polylines.forEach(p => map.removeOverLay(p)),
      setOpacity: (op) => polylines.forEach(p => p.setOpacity && p.setOpacity(op))
    }
  } else if (type === 'Polygon') {
    flashOverlay = new window.T.Polygon(parseCoords(coords[0] || []), {
      color: highlightColor,
      weight: 4,
      opacity: 1,
      fillColor: highlightColor,
      fillOpacity: 0.5
    })
  } else if (type === 'MultiPolygon') {
    const polygons = coords.map(pCoords => new window.T.Polygon(parseCoords(pCoords[0] || []), {
      color: highlightColor,
      weight: 4,
      opacity: 1,
      fillColor: highlightColor,
      fillOpacity: 0.5
    }))
    flashOverlay = {
      addToMap: () => polygons.forEach(p => map.addOverLay(p)),
      removeFromMap: () => polygons.forEach(p => map.removeOverLay(p)),
      setOpacity: (op) => polygons.forEach(p => p.setOpacity && p.setOpacity(op))
    }
  }

  if (!flashOverlay) return

  if (flashOverlay.addToMap) {
    flashOverlay.addToMap()
  } else {
    map.addOverLay(flashOverlay)
  }

  // 闪烁 3 下 (在 ON/OFF 间切换 6 次)
  let count = 0
  const interval = setInterval(() => {
    count++
    const visible = count % 2 === 1
    if (flashOverlay.setOpacity) {
      flashOverlay.setOpacity(visible ? 1 : 0.1)
    } else if (flashOverlay.setOpacity === undefined) {
      if (visible) {
        if (flashOverlay.addToMap) flashOverlay.addToMap()
        else map.addOverLay(flashOverlay)
      } else {
        if (flashOverlay.removeFromMap) flashOverlay.removeFromMap()
        else map.removeOverLay(flashOverlay)
      }
    }
    if (count >= 6) {
      clearInterval(interval)
      if (flashOverlay.removeFromMap) {
        flashOverlay.removeFromMap()
      } else {
        map.removeOverLay(flashOverlay)
      }
    }
  }, 280)
}

/**
 * 在百度地图上聚焦并高亮闪烁 Feature 3 次
 */
export function flashFeatureBaidu(map, feature, highlightColor = '#ff0055') {
  if (!map || !feature || !feature.geometry) return
  const BMap = window.BMap || window.BMapGL
  if (!BMap) return

  const info = getFeatureCenterAndBounds(feature)
  if (!info) return

  const gcj = wgs84ToGcj02(info.center[0], info.center[1])
  const [bdLng, bdLat] = gcj02ToBd09(gcj[0], gcj[1])
  const centerPt = new BMap.Point(bdLng, bdLat)

  // 1. 视图居中
  const currentZoom = map.getZoom ? map.getZoom() : 16
  map.centerAndZoom(centerPt, Math.max(currentZoom, 17))

  // 2. 创建高亮覆盖物
  const geometry = feature.geometry
  const type = geometry.type
  const coords = geometry.coordinates

  const convertCoords = (cList) => cList.map(c => {
    const g = wgs84ToGcj02(c[0], c[1])
    const b = gcj02ToBd09(g[0], g[1])
    return new BMap.Point(b[0], b[1])
  })

  let overlay = null
  if (type === 'Point') {
    overlay = new BMap.Marker(centerPt)
  } else if (type === 'LineString') {
    overlay = new BMap.Polyline(convertCoords(coords), { strokeColor: highlightColor, strokeWeight: 6, strokeOpacity: 1 })
  } else if (type === 'Polygon') {
    overlay = new BMap.Polygon(convertCoords(coords[0] || []), { strokeColor: highlightColor, strokeWeight: 4, strokeOpacity: 1, fillColor: highlightColor, fillOpacity: 0.5 })
  } else if (type === 'MultiPolygon') {
    const polygons = coords.map(pCoords => new BMap.Polygon(convertCoords(pCoords[0] || []), { strokeColor: highlightColor, strokeWeight: 4, strokeOpacity: 1, fillColor: highlightColor, fillOpacity: 0.5 }))
    overlay = {
      addToMap: () => polygons.forEach(p => map.addOverlay(p)),
      removeFromMap: () => polygons.forEach(p => map.removeOverlay(p)),
      show: () => polygons.forEach(p => p.show && p.show()),
      hide: () => polygons.forEach(p => p.hide && p.hide())
    }
  }

  if (!overlay) return

  if (overlay.addToMap) {
    overlay.addToMap()
  } else {
    map.addOverlay(overlay)
  }

  // 闪烁 3 次
  let count = 0
  const interval = setInterval(() => {
    count++
    const visible = count % 2 === 1
    if (overlay.show && overlay.hide) {
      if (visible) overlay.show()
      else overlay.hide()
    } else {
      if (visible) map.addOverlay(overlay)
      else map.removeOverlay(overlay)
    }
    if (count >= 6) {
      clearInterval(interval)
      if (overlay.removeFromMap) overlay.removeFromMap()
      else map.removeOverlay(overlay)
    }
  }, 280)
}

/**
 * 在 Cesium 3D 上聚焦并高亮闪烁 Feature 3 次
 */
export function flashFeatureCesium(viewer, feature, highlightColor = '#ff0055') {
  if (!viewer || !feature || !feature.geometry) return

  const info = getFeatureCenterAndBounds(feature)
  if (!info) return

  const [lng, lat] = info.center

  // 1. 视角 FlyTo 居中
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat, 600),
    duration: 1.0
  })

  // 2. 加载高亮 GeoJSON 要素
  const singleFeatureGeojson = {
    type: 'FeatureCollection',
    features: [feature]
  }

  const cesiumColor = Cesium.Color.fromCssColorString(highlightColor)

  Cesium.GeoJsonDataSource.load(singleFeatureGeojson, {
    stroke: cesiumColor,
    fill: cesiumColor.withAlpha(0.6),
    strokeWidth: 6,
    markerColor: cesiumColor,
    clampToGround: true
  }).then(ds => {
    viewer.dataSources.add(ds)

    let count = 0
    const interval = setInterval(() => {
      count++
      ds.show = count % 2 === 1
      if (count >= 6) {
        clearInterval(interval)
        viewer.dataSources.remove(ds, true)
      }
    }, 280)
  })
}

/**
 * 在天地图上根据指定属性字段生成文字标注 Label 数组
 */
export function renderGeoJsonLabelsTianditu(map, geojson, fieldName, labelColor = '#1e293b') {
  if (!map || !window.T || !geojson || !geojson.features || !fieldName) return []

  const labels = []

  geojson.features.forEach(feature => {
    const val = feature.properties ? feature.properties[fieldName] : null
    if (val === undefined || val === null || String(val).trim() === '') return

    const info = getFeatureCenterAndBounds(feature)
    if (!info) return

    const pt = new window.T.LngLat(info.center[0], info.center[1])
    const label = new window.T.Label({
      text: String(val),
      position: pt,
      offset: new window.T.Point(-20, -12)
    })

    if (label.setBackgroundColor) label.setBackgroundColor('rgba(255, 255, 255, 0.92)')
    if (label.setFontColor) label.setFontColor(labelColor)
    if (label.setFontSize) label.setFontSize(12)
    if (label.setBorderColor) label.setBorderColor('#3b82f6')

    map.addOverLay(label)
    labels.push(label)
  })

  return labels
}

/**
 * 在百度地图上根据指定属性字段生成文字标注 Label 数组
 */
export function renderGeoJsonLabelsBaidu(map, geojson, fieldName, labelColor = '#1e293b') {
  if (!map || !geojson || !geojson.features || !fieldName) return []
  const BMap = window.BMap || window.BMapGL
  if (!BMap) return []

  const labels = []

  geojson.features.forEach(feature => {
    const val = feature.properties ? feature.properties[fieldName] : null
    if (val === undefined || val === null || String(val).trim() === '') return

    const info = getFeatureCenterAndBounds(feature)
    if (!info) return

    const gcj = wgs84ToGcj02(info.center[0], info.center[1])
    const [bdLng, bdLat] = gcj02ToBd09(gcj[0], gcj[1])
    const pt = new BMap.Point(bdLng, bdLat)

    const label = new BMap.Label(String(val), { position: pt, offset: new BMap.Size(-20, -14) })
    label.setStyle({
      color: labelColor,
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      borderColor: '#3b82f6',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderRadius: '4px',
      padding: '2px 6px',
      fontSize: '12px',
      fontWeight: '500',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
    })

    map.addOverlay(label)
    labels.push(label)
  })

  return labels
}

/**
 * 在 Cesium 3D 上根据指定属性字段生成文字标注 Entity 数组
 */
export function renderGeoJsonLabelsCesium(viewer, geojson, fieldName, labelColorCss = '#ffffff', dataSource = null) {
  if (!viewer || !geojson || !geojson.features || !fieldName) return []

  const labelColor = Cesium.Color.fromCssColorString(labelColorCss)

  // 1. 如果提供了现成的 GeoJsonDataSource，直接将 Label 绑定到 DataSource 内部现有的 Entity 上
  if (dataSource && dataSource.entities && dataSource.entities.values.length > 0) {
    const dsEntities = dataSource.entities.values
    dsEntities.forEach((entity, idx) => {
      const feat = geojson.features[idx]
      let val = null
      if (entity.properties && typeof entity.properties.hasProperty === 'function' && entity.properties.hasProperty(fieldName)) {
        val = entity.properties[fieldName].getValue()
      } else if (feat && feat.properties) {
        val = feat.properties[fieldName]
      }

      if (val !== undefined && val !== null && String(val).trim() !== '') {
        if (!entity.position && feat) {
          const info = getFeatureCenterAndBounds(feat)
          if (info) {
            entity.position = Cesium.Cartesian3.fromDegrees(info.center[0], info.center[1])
          }
        }

        entity.label = new Cesium.LabelGraphics({
          text: String(val),
          font: 'bold 12px sans-serif',
          fillColor: labelColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: entity.billboard ? new Cesium.Cartesian2(0, -32) : new Cesium.Cartesian2(0, -10),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        })
      }
    })
    return []
  }

  // 2. 否则创建独立的文字标注 Entity
  const entities = []
  geojson.features.forEach(feature => {
    const val = feature.properties ? feature.properties[fieldName] : null
    if (val === undefined || val === null || String(val).trim() === '') return

    const info = getFeatureCenterAndBounds(feature)
    if (!info) return

    const [lng, lat] = info.center

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      label: {
        text: String(val),
        font: 'bold 12px sans-serif',
        fillColor: labelColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -32),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })

    entities.push(entity)
  })

  return entities
}

/**
 * 清除 Cesium 图层上的文字标注
 */
export function clearGeoJsonLabelsCesium(viewer, dataSource = null, labelEntities = []) {
  if (dataSource && dataSource.entities) {
    dataSource.entities.values.forEach(entity => {
      entity.label = undefined
    })
  }
  if (viewer && Array.isArray(labelEntities)) {
    labelEntities.forEach(entity => viewer.entities.remove(entity))
  }
}

/**
 * 将 GeoJSON 渲染到 Cesium Viewer 数据源
 * @param {Cesium.Viewer} viewer
 * @param {Object} rawGeojson
 * @param {String} colorCss
 * @returns {Promise<Cesium.GeoJsonDataSource>}
 */
export async function renderGeoJsonToCesium(viewer, rawGeojson, colorCss = '#3b82f6') {
  const geojson = ensureWgs84GeoJson(rawGeojson)
  if (!viewer || !geojson) return null

  const cesiumColor = Cesium.Color.fromCssColorString(colorCss)

  const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
    stroke: cesiumColor,
    fill: cesiumColor.withAlpha(0.35),
    strokeWidth: 3,
    markerColor: cesiumColor,
    clampToGround: true
  })

  viewer.dataSources.add(dataSource)
  return dataSource
}
