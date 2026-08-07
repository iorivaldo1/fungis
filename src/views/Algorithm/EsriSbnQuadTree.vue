<template>
  <div class="sbn-quadtree-page">
    <div id="mapDiv"></div>

    <div id="controlBar">
      <label>经度(X): <input type="number" v-model.number="inputX" step="0.1"></label>
      <label>纬度(Y): <input type="number" v-model.number="inputY" step="0.1"></label>
      <button :disabled="loading" @click="handleStart">{{ startBtnText }}</button>
      <button :disabled="!canPrev" @click="handlePrev" class="btn-warning">上一步 (Prev)</button>
      <button :disabled="!canStep" @click="handleStep" class="btn-success">下一步 (Step)</button>
    </div>

    <div id="queuePanel" v-show="pq.length > 0">
      <strong style="margin-right:10px; color:#1976d2; font-size: 14px;">SBN 优先队列<br>(升序)</strong>
      <div v-for="(item, idx) in displayQueue" :key="idx" class="queue-item"
        :class="[item.type, { 'final-result': item.isFinal, 'null-node': item.isNull }]" title="点击在地图上高亮该范围"
        @click="handleQueueItemClick(item)">
        <span v-if="item.isMore">... 其它 {{ pq.length - 10 }} 项</span>
        <template v-else>
          <span>{{ item.type === 'node' ? '节点: ' + item.path : '要素: Shape_' + item.shapeId }}</span>
          <span class="dist">MinDist: {{ item.minDist === Infinity ? '∞' : item.minDist.toFixed(4) }}</span>
        </template>
      </div>
      <span v-if="pq.length === 0" style="color:#999; font-size: 13px;">(空)</span>
    </div>

    <div id="logPanel">
      <h3 style="margin-top:0; border-bottom: 2px solid #2196F3; padding-bottom: 10px;">SBN 索引算法分析日志</h3>
      <div id="logContent" ref="logContentRef">
        <div v-if="logs.length === 0">请设定目标坐标并点击“开始分析”。</div>
        <div v-for="(log, index) in logs" :key="index" class="log-step" :class="{ collapsed: log.collapsed }">
          <div class="log-step-title" @click="log.collapsed = !log.collapsed">
            [步骤 {{ log.step }}] <span v-html="log.title"></span>
          </div>
          <div class="log-step-body">
            <div class="log-action" v-for="(act, actIdx) in log.actions" :key="actIdx" v-html="'· ' + act"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="layerControl">
      <label style="cursor: pointer; margin-right: 15px;">
        <input type="checkbox" v-model="showRiverLayer" @change="toggleLayer"> 显示河流底图
      </label>
      <label style="cursor: pointer;">
        <input type="checkbox" v-model="showMouseCoord"> 显示鼠标位置坐标
      </label>
      <span v-if="showMouseCoord" class="mouse-coord">
        X: {{ mouseLng.toFixed(4) }} | Y: {{ mouseLat.toFixed(4) }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { parseSbn, coordToBin } from '@/utils/sbnIndexParser.mjs'
import { initBBoxLayer } from '@/utils/spatialRender.mjs'

const inputX = ref(103.00)
const inputY = ref(30.00)
const loading = ref(false)
const startBtnText = ref('开始分析')
const canPrev = ref(false)
const canStep = ref(false)

const pq = ref([])
const logs = ref([])
const showRiverLayer = ref(false)
const showMouseCoord = ref(false)
const mouseLng = ref(0)
const mouseLat = ref(0)

const handleMapMouseMove = (e) => {
  if (e && e.lnglat) {
    mouseLng.value = typeof e.lnglat.getLng === 'function' ? e.lnglat.getLng() : e.lnglat.lng
    mouseLat.value = typeof e.lnglat.getLat === 'function' ? e.lnglat.getLat() : e.lnglat.lat
  }
}

const logContentRef = ref(null)

const displayQueue = computed(() => {
  const top10 = pq.value.slice(0, 10)
  if (pq.value.length > 10) {
    top10.push({ isMore: true })
  }
  return top10
})

let map = null
let lay = null
let bboxLayer = null

let sbnParsedData = null
let sbnTreeRoot = null

let stepCount = 0
let pMarker = null
let px = 0, py = 0

let currentBBoxes = []
let permanentShapes = []
let historyStates = []
let activeHighlightPolygon = null
let activeHighlightPolylines = []

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

const initMap = () => {
  map = new window.T.Map("mapDiv")
  map.centerAndZoom(new window.T.LngLat(103, 30), 8)

  const imageURL =
    `${import.meta.env.VITE_API_BASE_URL || ''}/geoserver/gwc/service/wmts?` +
    'Request=GetTile' +
    '&Service=WMTS' +
    '&Version=1.0.0' +
    '&LAYER=hydro%3Aya_river' +
    '&STYLE=' +
    '&Format=image%2Fpng' +
    '&TILEMATRIXSET=EPSG%3A900913' +
    '&TILEMATRIX=EPSG%3A900913%3A{z}' +
    '&TILEROW={y}' +
    '&TILECOL={x}'

  const southWest = new window.T.LngLat(101.96, 28.86)
  const northEast = new window.T.LngLat(103.41, 30.92)
  const f_bounds = new window.T.LngLatBounds(southWest, northEast)

  lay = new window.T.TileLayer(imageURL, { minZoom: 1, maxZoom: 18, bounds: f_bounds })
  lay.setZIndex(1000)

  if (initBBoxLayer) {
    bboxLayer = initBBoxLayer(map)
  }

  map.addEventListener('mousemove', handleMapMouseMove)
}

const toggleLayer = () => {
  if (showRiverLayer.value) {
    map.addLayer(lay)
  } else {
    map.removeLayer(lay)
  }
}

const distToBBox = (px, py, xmin, ymin, xmax, ymax) => {
  const dx = Math.max(xmin - px, 0, px - xmax)
  const dy = Math.max(ymin - py, 0, py - ymax)
  return Math.sqrt(dx * dx + dy * dy)
}

const distToSegment = (px, py, x1, y1, x2, y2) => {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
  if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
  t = Math.max(0, Math.min(1, t))
  const projX = x1 + t * (x2 - x1)
  const projY = y1 + t * (y2 - y1)
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}

const fetchShapeChunk = async (shapeId) => {
  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8085'
    // SBN 中的 featureId 为 1-based 存储，请求后端 .shp 记录时转换为 0-based 索引 (shapeId - 1)
    const shpRecordIndex = shapeId > 0 ? shapeId - 1 : shapeId
    const response = await fetch(`${baseUrl}/get_geo_pg/shp_record/${shpRecordIndex}`)
    if (!response.ok) {
      return null
    }
    const buffer = await response.arrayBuffer()
    return new DataView(buffer)
  } catch (err) {
    return null
  }
}

const getShapeExactDistanceAsync = async (shapeId, entryRealBBox, px, py) => {
  const chunkDataView = await fetchShapeChunk(shapeId)
  if (chunkDataView) {
    const shapeType = chunkDataView.getInt32(8, true)
    if (shapeType === 3 || shapeType === 5) {
      const numParts = chunkDataView.getInt32(44, true)
      const numPoints = chunkDataView.getInt32(48, true)
      const partsOffset = 52
      const pointsOffset = partsOffset + numParts * 4
      let minDist = Infinity

      for (let i = 0; i < numParts; i++) {
        const startIdx = chunkDataView.getInt32(partsOffset + i * 4, true)
        const endIdx = (i === numParts - 1) ? numPoints : chunkDataView.getInt32(partsOffset + (i + 1) * 4, true)

        for (let j = startIdx; j < endIdx - 1; j++) {
          const x1 = chunkDataView.getFloat64(pointsOffset + j * 16, true)
          const y1 = chunkDataView.getFloat64(pointsOffset + j * 16 + 8, true)
          const x2 = chunkDataView.getFloat64(pointsOffset + (j + 1) * 16, true)
          const y2 = chunkDataView.getFloat64(pointsOffset + (j + 1) * 16 + 8, true)
          const d = distToSegment(px, py, x1, y1, x2, y2)
          if (d < minDist) minDist = d
        }
      }
      return minDist === Infinity ? null : minDist
    }
  }

  // 备用降级逻辑：如无后端接口，使用 SBN 还原的实数 MBR 几何质心/包围盒距离作为参考
  if (entryRealBBox) {
    return distToBBox(px, py, entryRealBBox.xmin, entryRealBBox.ymin, entryRealBBox.xmax, entryRealBBox.ymax)
  }
  return null
}

const getShapeCoordinatesAsync = async (shapeId, entryRealBBox) => {
  const chunkDataView = await fetchShapeChunk(shapeId)
  if (chunkDataView) {
    const shapeType = chunkDataView.getInt32(8, true)
    if (shapeType === 3 || shapeType === 5) {
      const numParts = chunkDataView.getInt32(44, true)
      const numPoints = chunkDataView.getInt32(48, true)
      const partsOffset = 52
      const pointsOffset = partsOffset + numParts * 4

      let parts = []
      for (let i = 0; i < numParts; i++) {
        const startIdx = chunkDataView.getInt32(partsOffset + i * 4, true)
        const endIdx = (i === numParts - 1) ? numPoints : chunkDataView.getInt32(partsOffset + (i + 1) * 4, true)

        let part = []
        for (let j = startIdx; j < endIdx; j++) {
          const x = chunkDataView.getFloat64(pointsOffset + j * 16, true)
          const y = chunkDataView.getFloat64(pointsOffset + j * 16 + 8, true)
          part.push(new window.T.LngLat(x, y))
        }
        parts.push(part)
      }
      return parts
    }
  }

  // 备用：基于 realBBox 绘制外包框代替
  if (entryRealBBox) {
    return [[
      new window.T.LngLat(entryRealBBox.xmin, entryRealBBox.ymin),
      new window.T.LngLat(entryRealBBox.xmax, entryRealBBox.ymin),
      new window.T.LngLat(entryRealBBox.xmax, entryRealBBox.ymax),
      new window.T.LngLat(entryRealBBox.xmin, entryRealBBox.ymax),
      new window.T.LngLat(entryRealBBox.xmin, entryRealBBox.ymin)
    ]]
  }
  return null
}

const clearHighlight = () => {
  if (activeHighlightPolygon) {
    map.removeOverLay(activeHighlightPolygon)
    activeHighlightPolygon = null
  }
  if (activeHighlightPolylines && activeHighlightPolylines.length > 0) {
    activeHighlightPolylines.forEach(pl => map.removeOverLay(pl))
    activeHighlightPolylines = []
  }
}

const highlightBBox = (xmin, ymin, xmax, ymax) => {
  clearHighlight()
  const points = [
    new window.T.LngLat(xmin, ymin),
    new window.T.LngLat(xmax, ymin),
    new window.T.LngLat(xmax, ymax),
    new window.T.LngLat(xmin, ymax)
  ]
  activeHighlightPolygon = new window.T.Polygon(points, {
    color: "#ffeb3b", weight: 6, opacity: 1,
    fillColor: "#ffeb3b", fillOpacity: 0.5
  })
  map.addOverLay(activeHighlightPolygon)

  const cx = (xmin + xmax) / 2
  const cy = (ymin + ymax) / 2
  map.panTo(new window.T.LngLat(cx, cy))
}

const highlightPolyline = (parts) => {
  clearHighlight()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  parts.forEach(part => {
    const polyline = new window.T.Polyline(part, {
      color: "#ff0000", weight: 6, opacity: 1, lineStyle: "solid"
    })
    map.addOverLay(polyline)
    activeHighlightPolylines.push(polyline)

    part.forEach(pt => {
      if (pt.lng < minX) minX = pt.lng
      if (pt.lng > maxX) maxX = pt.lng
      if (pt.lat < minY) minY = pt.lat
      if (pt.lat > maxY) maxY = pt.lat
    })
  })

  if (minX !== Infinity) {
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    map.panTo(new window.T.LngLat(cx, cy))
  }
}

const handleQueueItemClick = async (item) => {
  if (item.isMore || item.isNull) return
  if (item.type === 'node' && item.node.nodeBBox) {
    const b = item.node.nodeBBox
    highlightBBox(b.xmin, b.ymin, b.xmax, b.ymax)
  } else if (item.type === 'shape') {
    const parts = await getShapeCoordinatesAsync(item.shapeId, item.entryRealBBox)
    if (parts) highlightPolyline(parts)
  }
}

const addOverlayToBBoxLayer = (overlay) => {
  if (bboxLayer && bboxLayer.addLayer) bboxLayer.addLayer(overlay)
  else {
    map.addOverLay(overlay)
    if (bboxLayer) bboxLayer.push(overlay)
  }
}

const createPolygon = (b) => {
  const points = [
    new window.T.LngLat(b.xmin, b.ymin),
    new window.T.LngLat(b.xmax, b.ymin),
    new window.T.LngLat(b.xmax, b.ymax),
    new window.T.LngLat(b.xmin, b.ymax)
  ]
  const polygon = new window.T.Polygon(points, {
    color: b.color, weight: b.weight, opacity: 0.8,
    fillColor: b.color, fillOpacity: 0.1
  })
  addOverlayToBBoxLayer(polygon)
  return polygon
}

const drawBBox = (xmin, ymin, xmax, ymax, color, weight = 2) => {
  const params = { xmin, ymin, xmax, ymax, color, weight }
  const p = createPolygon(params)
  currentBBoxes.push({ p, params })
}

const clearMap = () => {
  if (bboxLayer && bboxLayer.clearLayers) bboxLayer.clearLayers()
  else if (bboxLayer) {
    bboxLayer.forEach(p => map.removeOverLay(p))
    bboxLayer.length = 0
  }

  currentBBoxes = []

  permanentShapes.forEach(item => {
    if (bboxLayer && bboxLayer.removeLayer) bboxLayer.removeLayer(item.p)
    else map.removeOverLay(item.p)
  })
  permanentShapes = []

  if (pMarker) {
    map.removeOverLay(pMarker)
    pMarker = null
  }
  clearHighlight()
  historyStates = []
}

const logMsg = (step, title, actions) => {
  logs.value.forEach(log => log.collapsed = true)
  logs.value.push({ step, title, actions, collapsed: false })
  nextTick(() => {
    if (logContentRef.value) {
      logContentRef.value.scrollTop = logContentRef.value.scrollHeight
    }
  })
}

const initAlgorithm = () => {
  stepCount = 0
  pq.value = []

  const bounds = sbnParsedData.header.bounds
  const cx = (bounds.xmin + bounds.xmax) / 2
  const cy = (bounds.ymin + bounds.ymax) / 2
  map.centerAndZoom(new window.T.LngLat(cx, cy), 9)

  const binX = coordToBin(px, bounds.xmin, bounds.xmax)
  const binY = coordToBin(py, bounds.ymin, bounds.ymax)

  const d = distToBBox(px, py, bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax)
  pq.value.push({ type: 'node', node: sbnTreeRoot, minDist: d, path: 'Slot_0 (Root)' })

  logMsg(0, "SBN 空间网格初始化", [
    `目标点 P(${px}, ${py})`,
    `SBN 映射全局包围盒 X:[${bounds.xmin.toFixed(2)}, ${bounds.xmax.toFixed(2)}], Y:[${bounds.ymin.toFixed(2)}, ${bounds.ymax.toFixed(2)}]`,
    `<b>256×256 归一化网格坐标:</b> Bin(${binX}, ${binY})`,
    `根节点 Slot 0 (DirectoryNode #1) 入队，MinDist = ${d.toFixed(4)}`
  ])

  canStep.value = true
  canPrev.value = false
}

const handleStart = () => {
  px = inputX.value
  py = inputY.value

  clearMap()
  logs.value = []

  pMarker = new window.T.Marker(new window.T.LngLat(px, py))
  map.addOverLay(pMarker)

  if (!sbnTreeRoot) {
    loading.value = true
    startBtnText.value = "加载 SBN 索引..."

    const sbnUrl = `${import.meta.env.BASE_URL || '/'}sbn/ya_river.sbn`.replace(/\/+/g, '/')
    fetch(sbnUrl).then(r => {
      if (!r.ok) {
        throw new Error(`HTTP 请求失败, 状态码: ${r.status}`)
      }
      return r.arrayBuffer()
    }).then(sbnBuf => {
      const result = parseSbn(sbnBuf)
      if (!result || !result.logicalTreeRoot) {
        throw new Error('SBN 二进制索引数据结构解析失败')
      }
      sbnParsedData = result
      sbnTreeRoot = result.logicalTreeRoot

      startBtnText.value = "开始分析"
      loading.value = false

      initAlgorithm()
    }).catch(err => {
      console.error(err)
      alert(`加载文件失败，请确保 ${sbnUrl} 文件存在。`)
      startBtnText.value = "开始分析"
      loading.value = false
    })
  } else {
    initAlgorithm()
  }
}

const handlePrev = () => {
  if (historyStates.length === 0) return
  const state = historyStates.pop()

  pq.value = state.pq.map(i => ({ ...i }))
  stepCount = state.stepCount

  clearHighlight()

  currentBBoxes.forEach(item => {
    if (bboxLayer && bboxLayer.removeLayer) bboxLayer.removeLayer(item.p)
    else {
      map.removeOverLay(item.p)
      if (bboxLayer) {
        const idx = bboxLayer.indexOf(item.p)
        if (idx > -1) bboxLayer.splice(idx, 1)
      }
    }
  })
  currentBBoxes = []

  if (state.permanentShapesLen !== undefined) {
    while (permanentShapes.length > state.permanentShapesLen) {
      const item = permanentShapes.pop()
      if (bboxLayer && bboxLayer.removeLayer) bboxLayer.removeLayer(item.p)
      else {
        map.removeOverLay(item.p)
        if (bboxLayer) {
          const idx = bboxLayer.indexOf(item.p)
          if (idx > -1) bboxLayer.splice(idx, 1)
        }
      }
    }
  }

  state.currBoxes.forEach(b => {
    if (b.type === 'polyline') {
      const pl = new window.T.Polyline(b.part, b.options)
      addOverlayToBBoxLayer(pl)
      currentBBoxes.push({ p: pl, params: b })
    } else {
      currentBBoxes.push({ p: createPolygon(b), params: b })
    }
  })

  logs.value = state.logs.map(i => ({ ...i }))

  canStep.value = true
  if (historyStates.length === 0) canPrev.value = false
}

const handleStep = async () => {
  if (pq.value.length === 0) {
    logMsg("结束", "队列已空", ["未找到更多要素"])
    canStep.value = false
    return
  }

  canStep.value = false
  canPrev.value = false

  clearHighlight()

  historyStates.push({
    stepCount: stepCount,
    pq: pq.value.map(i => ({ ...i })),
    currBoxes: currentBBoxes.map(i => i.params),
    permanentShapesLen: permanentShapes.length,
    logs: logs.value.map(i => ({ ...i }))
  })

  currentBBoxes.forEach(item => {
    if (bboxLayer && bboxLayer.removeLayer) bboxLayer.removeLayer(item.p)
    else {
      map.removeOverLay(item.p)
      if (bboxLayer) {
        const idx = bboxLayer.indexOf(item.p)
        if (idx > -1) bboxLayer.splice(idx, 1)
      }
    }
  })
  currentBBoxes = []

  stepCount++
  const topItem = pq.value.shift()

  if (topItem.type === 'shape') {
    logMsg(stepCount, `<span class="log-highlight" style="color: #d32f2f; font-weight: bold;">🎉 触底！找到最近河流要素</span>`, [
      `出队要素: <b>Shape ID = ${topItem.shapeId}</b>`,
      `目标要素精确几何距离 = ${topItem.minDist.toFixed(4)}`,
      `<span style="color:#d32f2f;">基于 ESRI SBN 256×256 网格归一化 + 二叉堆短路剪枝找到最近结果。</span>`
    ])
    canStep.value = false

    const parts = await getShapeCoordinatesAsync(topItem.shapeId, topItem.entryRealBBox)
    if (parts) highlightPolyline(parts)

    topItem.isFinal = true
    pq.value.unshift(topItem)
    canPrev.value = true
    return
  }

  const node = topItem.node

  // 如果遇到 Null Node (-1 / 0xFFFFFFFF 占位符卡槽)
  if (node.isNull) {
    logMsg(stepCount, `短路剪枝 (Null Node)`, [
      `出队槽位: ${topItem.path} (target_node_index = -1)`,
      `<span style="color:#e65100; font-weight:bold;">命中空插槽！该象限无派生子节点，触发零磁盘 I/O 零 CPU 算法短路剪枝！</span>`
    ])
    canStep.value = true
    canPrev.value = true
    return
  }

  if (node.nodeBBox) {
    drawBBox(node.nodeBBox.xmin, node.nodeBBox.ymin, node.nodeBBox.xmax, node.nodeBBox.ymax, '#e41a1c', 3)
  }

  let actions = [
    `<b>展开 SBN 节点</b>: ${topItem.path} (target_node_index = ${node.targetNodeIndex})`,
    `解析包含 ${node.children.length} 个堆子分支, ${node.entries.length} 个直接挂载要素 (FeatureEntries)`
  ]

  node.children.forEach((child) => {
    if (child.isNull) {
      actions.push(`子槽位 Slot_${child.slotIdx} (${child.path}) 为空节点 (-1) $\\rightarrow$ <span style="color:#999;">剪枝忽略</span>`)
    } else {
      const b = child.nodeBBox
      const d = distToBBox(px, py, b.xmin, b.ymin, b.xmax, b.ymax)
      pq.value.push({ type: 'node', node: child, minDist: d, path: `${topItem.path} -> Slot_${child.slotIdx}` })
      drawBBox(b.xmin, b.ymin, b.xmax, b.ymax, '#2196F3', 1)
      actions.push(`子节点 Slot_${child.slotIdx} (Node #${child.targetNodeIndex}) 入队, MinDist=${d.toFixed(4)}`)
    }
  })

  for (const entry of node.entries) {
    const sid = entry.featureId
    const realDist = await getShapeExactDistanceAsync(sid, entry.realBBox, px, py)
    if (realDist !== null) {
      pq.value.push({ type: 'shape', shapeId: sid, entryRealBBox: entry.realBBox, minDist: realDist })
      actions.push(`要素 Shape_${sid} (BinBBox: [${entry.binBBox.xmin}, ${entry.binBBox.ymin}, ${entry.binBBox.xmax}, ${entry.binBBox.ymax}]) 入队, 距离=${realDist.toFixed(4)}`)

      const parts = await getShapeCoordinatesAsync(sid, entry.realBBox)
      if (parts) {
        parts.forEach(part => {
          const options = { color: "#00bcd4", weight: 3, opacity: 0.8, lineStyle: "dashed" }
          const polyline = new window.T.Polyline(part, options)
          addOverlayToBBoxLayer(polyline)
          permanentShapes.push({
            p: polyline,
            params: { type: 'polyline', part: part, options: options }
          })
        })
      }
    } else {
      actions.push(`要素 Shape_${sid} 离线度量失败`)
    }
  }

  pq.value.sort((a, b) => a.minDist - b.minDist)

  const top5Str = pq.value.slice(0, 5).map(i => (i.type === 'node' ? (i.isNull ? 'NullSlot' : 'Node_' + i.node.targetNodeIndex) : 'Shape_' + i.shapeId)).join(', ') + (pq.value.length > 5 ? ' ...' : '')
  actions.push(`<b>优先队列前5名:</b> ${top5Str}`)

  logMsg(stepCount, "SBN 二叉分流与分支展开", actions)

  canStep.value = true
  canPrev.value = true
}

onMounted(async () => {
  try {
    await loadTiandituScript()
    initMap()
  } catch (error) {
    console.error('加载天地图资源失败:', error)
  }
})

onUnmounted(() => {
  if (map) {
    map = null
  }
})
</script>

<style scoped>
.sbn-quadtree-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  font-family: sans-serif;
  color: #333;
}

#mapDiv {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

#controlBar {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 500;
  background: rgba(255, 255, 255, 0.95);
  padding: 15px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  gap: 10px;
  align-items: center;
  color: #333;
}

#controlBar select {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #ccc;
}

#controlBar input {
  width: 80px;
  padding: 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

#controlBar button {
  padding: 6px 15px;
  cursor: pointer;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: bold;
}

#controlBar button:disabled {
  background: #ccc !important;
  cursor: not-allowed;
}

.btn-warning {
  background: #FF9800 !important;
}

.btn-success {
  background: #4CAF50 !important;
}

#queuePanel {
  position: absolute;
  top: 100px;
  left: 20px;
  z-index: 500;
  background: rgba(255, 255, 255, 0.9);
  padding: 10px;
  border-radius: 6px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  align-items: center;
  min-height: 50px;
  max-width: 70%;
  color: #333;
}

.queue-item {
  background: #e3f2fd;
  border: 1px solid #90caf9;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s;
}

.queue-item:hover {
  background: #bbdefb;
}

.queue-item.shape {
  background: #ffebee;
  border-color: #ef9a9a;
  font-weight: bold;
}

.queue-item.shape:hover {
  background: #ffcdd2;
}

.queue-item.null-node {
  background: #f5f5f5;
  color: #999;
  border-color: #ddd;
}

.queue-item .dist {
  font-size: 11px;
  color: #555;
}

.queue-item.final-result {
  background: #4caf50;
  color: white;
  border-color: #388e3c;
  box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
  font-weight: bold;
}

.queue-item.final-result .dist {
  color: #e8f5e9;
}

#logPanel {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 340px;
  z-index: 500;
  background: rgba(255, 255, 255, 0.95);
  padding: 15px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  color: #333;
  max-height: 90%;
}

#logContent {
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.6;
  flex: 1;
}

.log-step {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.log-step:last-child {
  border-bottom: none;
}

.log-step-title {
  font-weight: bold;
  color: #1976d2;
  margin-bottom: 5px;
  cursor: pointer;
  user-select: none;
}

.log-action {
  margin-left: 10px;
  color: #444;
  font-size: 13px;
}

.log-step.collapsed .log-step-body {
  display: none;
}

.log-step.collapsed .log-step-title::after {
  content: ' (点击展开)';
  font-size: 11px;
  font-weight: normal;
  color: #999;
}

#layerControl {
  position: absolute;
  bottom: 20px;
  left: 20px;
  z-index: 500;
  background: rgba(255, 255, 255, 0.95);
  padding: 10px 15px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 14px;
  color: #333;
}

.mouse-coord {
  margin-left: 15px;
  font-family: monospace;
  font-weight: bold;
  color: #1976d2;
}
</style>
