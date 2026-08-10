<template>
  <div class="postgis-rtree-page">
    <div id="mapDiv"></div>

    <div id="controlBar">
      <label>经度(X): <input type="number" v-model.number="inputX" step="0.1"></label>
      <label>纬度(Y): <input type="number" v-model.number="inputY" step="0.1"></label>
      <button :disabled="loading" @click="handleStart">{{ startBtnText }}</button>
      <button :disabled="!canPrev" @click="handlePrev" class="btn-warning">上一步 (Prev)</button>
      <button :disabled="!canStep" @click="handleStep" class="btn-success">下一步 (Step)</button>
    </div>

    <div id="queuePanel" v-show="pq.length > 0">
      <strong style="margin-right:10px; color:#1976d2; font-size: 14px;">GiST 优先队列<br>(升序小顶堆)</strong>
      <div v-for="(item, idx) in displayQueue" :key="idx" class="queue-item"
        :class="[item.type, { 'final-result': item.isFinal }]" title="点击在地图上高亮该范围"
        @click="handleQueueItemClick(item)">
        <span v-if="item.isMore">... 其它 {{ pq.length - 10 }} 项</span>
        <template v-else>
          <span>{{ item.type === 'node' ? '索引页: Page ' + item.pageIndex : '要素: CTID(' + item.op_blkid + ',' + item.ip_posid + ')' }}</span>
          <span class="dist">MinDist: {{ item.minDist === Infinity ? '∞' : item.minDist.toFixed(6) }}</span>
        </template>
      </div>
      <span v-if="pq.length === 0" style="color:#999; font-size: 13px;">(空)</span>
    </div>

    <div id="logPanel">
      <h3 style="margin-top:0; border-bottom: 2px solid #2196F3; padding-bottom: 10px;">PostGIS GiST KNN 步进与 SQL 执行日志</h3>
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
import { parseGist } from '@/utils/spatialIndexParser.mjs'
import { initBBoxLayer } from '@/utils/spatialRender.mjs'
import { getToken } from '@/utils/request.js'

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

let pageMap = new Map() // pageIndex -> Page Object
let relFilePath = ''
let bestDist = Infinity
let bestItem = null

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

const parseGeoJsonParts = (geoJsonStr) => {
  if (!geoJsonStr) return null
  try {
    const geo = typeof geoJsonStr === 'string' ? JSON.parse(geoJsonStr) : geoJsonStr
    let parts = []
    if (geo.type === 'LineString') {
      const part = geo.coordinates.map(pt => new window.T.LngLat(pt[0], pt[1]))
      parts.push(part)
    } else if (geo.type === 'MultiLineString') {
      parts = geo.coordinates.map(line => line.map(pt => new window.T.LngLat(pt[0], pt[1])))
    }
    return parts.length > 0 ? parts : null
  } catch (err) {
    return null
  }
}

const fetchFeatureByTid = async (op_blkid, ip_posid) => {
  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8085'
    const headers = {}
    const token = getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const res = await fetch(`${baseUrl}/get_geo_pg/geo/ya_river_by_tid/${op_blkid}/${ip_posid}`, { headers })
    if (!res.ok) return null
    const json = await res.json()
    return json && json.data ? json.data : null
  } catch (err) {
    return null
  }
}

const getTupleExactDistanceAsync = async (op_blkid, ip_posid, bbox, px, py) => {
  const river = await fetchFeatureByTid(op_blkid, ip_posid)
  if (river && river.geometry) {
    const parts = parseGeoJsonParts(river.geometry)
    if (parts) {
      let minDist = Infinity
      parts.forEach(part => {
        for (let i = 0; i < part.length - 1; i++) {
          const d = distToSegment(px, py, part[i].lng, part[i].lat, part[i + 1].lng, part[i + 1].lat)
          if (d < minDist) minDist = d
        }
      })
      return { dist: minDist === Infinity ? null : minDist, river, parts }
    }
  }

  // 备用降级逻辑：使用 16 字节 Tuple BBox 估计
  if (bbox) {
    const d = distToBBox(px, py, bbox.xmin, bbox.ymin, bbox.xmax, bbox.ymax)
    return { dist: d, river: null, parts: null }
  }
  return { dist: null, river: null, parts: null }
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
  if (item.isMore) return
  if (item.type === 'node' && item.bbox) {
    highlightBBox(item.bbox.xmin, item.bbox.ymin, item.bbox.xmax, item.bbox.ymax)
  } else if (item.type === 'tuple') {
    const res = await getTupleExactDistanceAsync(item.op_blkid, item.ip_posid, item.bbox, px, py)
    if (res && res.parts) highlightPolyline(res.parts)
    else if (item.bbox) highlightBBox(item.bbox.xmin, item.bbox.ymin, item.bbox.xmax, item.bbox.ymax)
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
  bestDist = Infinity
  bestItem = null

  const rootPage = pageMap.get(0)
  if (!rootPage) {
    alert("未找到 GiST 根节点 Page 0！")
    return
  }

  pq.value.push({
    type: 'node',
    pageIndex: 0,
    minDist: 0.0,
    bbox: null,
    path: 'Page 0 (Root Page)'
  })

  logMsg(0, "PostgreSQL GiST KNN 搜索初始化", [
    `<b>执行 KNN 搜索 SQL:</b><br><code style="background:#f5f5f5; color:#c62828; padding:2px 4px;">SELECT name, geom &lt;-&gt; ST_SetSRID(ST_Point(${px}, ${py}), 4326) AS dist FROM ya_data.rivers ORDER BY dist LIMIT 1;</code>`,
    `<b>动态读取实时 GiST 索引二进制流 SQL:</b><br><code style="background:#f5f5f5; color:#1565c6; padding:2px 4px;">SELECT pg_read_binary_file(pg_relation_filepath(i.indexrelid)) FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid WHERE c.relname = 'rivers';</code>`,
    `PostgreSQL 数据库内核中定位物理索引文件: <b>${relFilePath || 'PostgreSQL 动态索引流'}</b>`,
    `<b>压入根节点:</b> 物理页 Page 0 压入优先队列 (MinDist = 0.0000)`
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

  if (pageMap.size === 0) {
    loading.value = true
    startBtnText.value = "从 PostgreSQL 拉取 GiST 索引..."

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8085'
    const headers = {}
    const token = getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    fetch(`${baseUrl}/get_geo_pg/geo/gist_index`, { headers }).then(async r => {
      relFilePath = r.headers.get("X-PG-Index-RelPath") || ''
      if (!r.ok) {
        let errorMsg = `HTTP 请求失败, 状态码: ${r.status}`
        try {
          const errJson = await r.json()
          if (errJson && errJson.msg) errorMsg = errJson.msg
        } catch (e) {}
        throw new Error(errorMsg)
      }
      return r.arrayBuffer()
    }).then(buf => {
      const parsedPages = parseGist(new Uint8Array(buf))
      if (!parsedPages || parsedPages.length === 0) {
        throw new Error('GiST 物理索引解析失败，无有效 8KB 页数据')
      }
      pageMap.clear()
      parsedPages.forEach(p => pageMap.set(p.pageIndex, p))

      startBtnText.value = "开始分析"
      loading.value = false

      initAlgorithm()
    }).catch(err => {
      console.error(err)
      alert(`加载物理索引失败: ${err.message}`)
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
  bestDist = state.bestDist
  bestItem = state.bestItem ? { ...state.bestItem } : null

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
    logMsg("结束", "队列已空", ["已完成全图 GiST 索引搜寻"])
    canStep.value = false
    return
  }

  canStep.value = false
  canPrev.value = false
  clearHighlight()

  historyStates.push({
    stepCount: stepCount,
    bestDist: bestDist,
    bestItem: bestItem ? { ...bestItem } : null,
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

  // 1. 如果出队的是物理要素 Tuple
  if (topItem.type === 'tuple') {
    const blkid = topItem.op_blkid
    const posid = topItem.ip_posid

    // 早停判定（Early Stopping Check）：如果堆顶的 BBox 最短下界距离 > 当前找到的最好真实几何距离
    if (topItem.minDist > bestDist) {
      logMsg(stepCount, `<span style="color:#d32f2f; font-weight:bold;">🎉 触发数学完备早停剪枝！寻找成功！</span>`, [
        `堆顶元素: <b>CTID(${blkid}, ${posid})</b> (BBox 下界距离 = ${topItem.minDist.toFixed(6)})`,
        `当前最优真实几何要素: <b>${bestItem.riverName} (CTID: ${bestItem.op_blkid},${bestItem.ip_posid})</b>, 真实距离 = <b>${bestDist.toFixed(6)}</b>`,
        `<span style="color:#d32f2f; font-weight:bold;">基于小顶堆单调性，堆中剩余所有节点/BBox的最近可能距离 (>= ${topItem.minDist.toFixed(6)}) 绝对无法超越 ${bestDist.toFixed(6)}。SQL 引擎触发 Early Stopping 完美剪枝提前结束！</span>`
      ])
      canStep.value = false
      if (bestItem && bestItem.parts) highlightPolyline(bestItem.parts)
      return
    }

    // 发起物理 CTID 回表
    const res = await getTupleExactDistanceAsync(blkid, posid, topItem.bbox, px, py)
    const exactDist = res.dist
    const riverName = res.river ? (res.river.name || `GID_${res.river.id}`) : `TID(${blkid},${posid})`

    let actions = [
      `<b>物理 CTID 回表 SQL:</b><br><code style="background:#f5f5f5; color:#2e7d32; padding:2px 4px;">SELECT ctid, name, ST_AsGeoJSON(geom) FROM ya_data.rivers WHERE ctid = '(${blkid},${posid})'::tid;</code>`,
      `数据表中记录名: <b>${riverName}</b>`,
      `<b>PostGIS ST_Distance 精确折线距离算数:</b> ${exactDist !== null ? exactDist.toFixed(6) : 'N/A'}`
    ]

    if (exactDist !== null && exactDist < bestDist) {
      bestDist = exactDist
      bestItem = { op_blkid: blkid, ip_posid: posid, riverName, exactDist, parts: res.parts }
      actions.push(`<span style="color:#4caf50; font-weight:bold;">刷新最佳候选记录! 当前 Best_Dist = ${bestDist.toFixed(6)}</span>`)
    } else {
      actions.push(`真实距离 (${exactDist !== null ? exactDist.toFixed(6) : 'N/A'}) 大于当前最佳值 (${bestDist.toFixed(6)}), 淘汰此项。`)
    }

    if (res.parts) {
      res.parts.forEach(part => {
        const options = { color: "#00bcd4", weight: 3, opacity: 0.8, lineStyle: "dashed" }
        const polyline = new window.T.Polyline(part, options)
        addOverlayToBBoxLayer(polyline)
        permanentShapes.push({
          p: polyline,
          params: { type: 'polyline', part: part, options: options }
        })
      })
      highlightPolyline(res.parts)
    }

    const top5Str = pq.value.slice(0, 5).map(i => (i.type === 'node' ? 'Page_' + i.pageIndex : `CTID(${i.op_blkid},${i.ip_posid})`)).join(', ') + (pq.value.length > 5 ? ' ...' : '')
    actions.push(`<b>优先队列前 5 名:</b> ${top5Str}`)

    logMsg(stepCount, `CTID 回表重核 (Heap Fetch)`, actions)

    canStep.value = true
    canPrev.value = true
    return
  }

  // 2. 如果出队的是索引物理页节点
  const pageIdx = topItem.pageIndex
  const currPage = pageMap.get(pageIdx)

  if (!currPage) {
    logMsg(stepCount, `读取 Page ${pageIdx} 失败`, [`索引中不存在物理页 Page ${pageIdx}`])
    canStep.value = true
    canPrev.value = true
    return
  }

  if (currPage.isLeaf) {
    // ---- 2.1 叶子物理页展开 (Leaf Node Page) ----
    if (topItem.bbox) {
      drawBBox(topItem.bbox.xmin, topItem.bbox.ymin, topItem.bbox.xmax, topItem.bbox.ymax, '#e41a1c', 3)
    }

    let actions = [
      `<b>进入底层叶子物理页:</b> Page ${pageIdx} (包含 <code>F_LEAF = 0x0001</code> 标志位)`,
      `页内保存 <b>${currPage.tuples.length}</b> 个指向数据表 Heap 的 Tuple 物理行指针 (CTID)`
    ]

    currPage.tuples.forEach(tuple => {
      const b = { xmin: tuple.data.x_min, ymin: tuple.data.y_min, xmax: tuple.data.x_max, ymax: tuple.data.y_max }
      const d = distToBBox(px, py, b.xmin, b.ymin, b.xmax, b.ymax)
      pq.value.push({
        type: 'tuple',
        op_blkid: tuple.target_block,
        ip_posid: tuple.data.ip_posid,
        bbox: b,
        minDist: d
      })
      drawBBox(b.xmin, b.ymin, b.xmax, b.ymax, '#ff9800', 1)
    })

    pq.value.sort((a, b) => a.minDist - b.minDist)

    const top5Str = pq.value.slice(0, 5).map(i => (i.type === 'node' ? 'Page_' + i.pageIndex : `CTID(${i.op_blkid},${i.ip_posid})`)).join(', ') + (pq.value.length > 5 ? ' ...' : '')
    actions.push(`<b>全页面 Tuples 入堆后优先队列前 5 名:</b> ${top5Str}`)

    logMsg(stepCount, `叶子物理页展开 (Leaf Page ${pageIdx})`, actions)
  } else {
    // ---- 2.2 内部物理页展开 (Internal Node Page, 如 Page 0) ----
    let actions = [
      `<b>解包内部节点物理页:</b> Page ${pageIdx} (Root Page)`,
      `页内下挂 <b>${currPage.tuples.length}</b> 个子物理页指针 (Downlink Tuples)`
    ]

    currPage.tuples.forEach(tuple => {
      const targetChildPage = tuple.target_block
      const b = { xmin: tuple.data.x_min, ymin: tuple.data.y_min, xmax: tuple.data.x_max, ymax: tuple.data.y_max }
      const d = distToBBox(px, py, b.xmin, b.ymin, b.xmax, b.ymax)
      pq.value.push({
        type: 'node',
        pageIndex: targetChildPage,
        bbox: b,
        minDist: d,
        path: `Page 0 -> Page ${targetChildPage}`
      })
      drawBBox(b.xmin, b.ymin, b.xmax, b.ymax, '#2196F3', 2)
      actions.push(`子节点 Page ${targetChildPage} 入队, 16 字节 Tuple BBox 最短距离 = ${d.toFixed(6)}`)
    })

    pq.value.sort((a, b) => a.minDist - b.minDist)

    const top5Str = pq.value.slice(0, 5).map(i => (i.type === 'node' ? 'Page_' + i.pageIndex : `CTID(${i.op_blkid},${i.ip_posid})`)).join(', ') + (pq.value.length > 5 ? ' ...' : '')
    actions.push(`<b>优先队列前 5 名:</b> ${top5Str}`)

    logMsg(stepCount, `内部节点页展开 (Internal Page ${pageIdx})`, actions)
  }

  canStep.value = true
  canPrev.value = true
}

onMounted(async () => {
  try {
    await loadTiandituScript()
    initMap()
  } catch (error) {
    console.error('加载资源失败:', error)
  }
})

onUnmounted(() => {
  if (map) {
    map = null
  }
})
</script>

<style scoped>
.postgis-rtree-page {
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

.queue-item.tuple {
  background: #fff3e0;
  border-color: #ffe0b2;
  font-weight: bold;
}

.queue-item.tuple:hover {
  background: #ffe0b2;
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
  width: 360px;
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
  font-size: 13px;
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
  margin-left: 5px;
  color: #444;
  font-size: 12px;
  word-break: break-all;
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
  background: rgba(255, 255, 255, 0.9);
  padding: 8px 15px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #333;
}

.mouse-coord {
  margin-left: 10px;
  font-family: monospace;
  color: #1565c0;
}
</style>
