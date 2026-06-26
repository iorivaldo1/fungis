import * as GeoTIFF from 'geotiff'

export const clearOverLays = (map, demOverLayerList) => {
    if (demOverLayerList) {
        demOverLayerList.forEach(ov => map.removeOverLay(ov))
        demOverLayerList.length = 0
    }
}

export const lngLatToTile = (lng, lat, zoom) => {
    const x = (lng + 180) / 360
    const y = (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2
    const tileCount = Math.pow(2, zoom)
    const tileCol = Math.floor(x * tileCount)
    const tileRow = Math.floor(y * tileCount)
    return [tileCol, tileRow]
}

export const tileToLngLat = (tileCol, tileRow, zoom) => {
    const n = Math.pow(2, zoom)
    const lng = (tileCol / n) * 360 - 180
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileRow) / n)))
    const lat = (latRad * 180) / Math.PI
    return [lng, lat]
}

export const getTileWMTSUrlIMG = (tileCol, tileRow, zoom) => {
    const serviceNum = Math.floor(Math.random() * 8)
    return `https://t${serviceNum}.tianditu.gov.cn/img_w/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=image%2Fpng&tk=be50c7492442ecf4e61ca7bd578d6b8b&TILECOL=${tileCol}&TILEROW=${tileRow}&TILEMATRIX=${zoom}`
}

export const getTileWMTSUrlCIA = (tileCol, tileRow, zoom) => {
    const serviceNum = Math.floor(Math.random() * 8)
    return `https://t${serviceNum}.tianditu.gov.cn/cia_w/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=image%2Fpng&tk=be50c7492442ecf4e61ca7bd578d6b8b&TILECOL=${tileCol}&TILEROW=${tileRow}&TILEMATRIX=${zoom}`
}

export const calculateBounds = (tiles) => {
    const cols = tiles.map(t => t.col)
    const rows = tiles.map(t => t.row)
    return {
        minCol: Math.min(...cols),
        maxCol: Math.max(...cols),
        minRow: Math.min(...rows),
        maxRow: Math.max(...rows)
    }
}

export const loadImage = (url, timeout = 50000) => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        const timer = setTimeout(() => reject(new Error(`Timeout: ${url}`)), timeout)
        img.onload = () => { clearTimeout(timer); resolve(img) }
        img.onerror = (err) => { clearTimeout(timer); reject(err) }
        img.src = url
    })
}

export const getAllImages = async (tiles) => {
    const promises = tiles.map(tile => loadImage(tile.url).catch(e => { console.error(e); return null }))
    return Promise.all(promises)
}

export const getAllImagesWithProgress = async (tiles, progressState) => {
    const { showProgress, loadedTiles, totalTiles, downloadProgress } = progressState
    const loadPromises = tiles.map((tile, index) =>
        loadImage(tile.url).then(img => {
            if (showProgress) {
                loadedTiles.value++
                downloadProgress.value = (loadedTiles.value / totalTiles.value) * 100
            }
            return img
        }).catch(error => {
            console.error(`加载瓦片失败: ${tile.url}`, error)
            if (showProgress) {
                loadedTiles.value++
                downloadProgress.value = (loadedTiles.value / totalTiles.value) * 100
            }
            return null
        })
    )
    return await Promise.all(loadPromises)
}

export const c_dom_img_cia_lv = async (bbox, lv, progressState) => {
    const zoom = lv
    const tileSize = 256
    const minX = bbox.getSouthWest().lng
    const minY = bbox.getSouthWest().lat
    const maxX = bbox.getNorthEast().lng
    const maxY = bbox.getNorthEast().lat

    const nw = lngLatToTile(minX, maxY, zoom)
    const ne = lngLatToTile(maxX, maxY, zoom)
    const sw = lngLatToTile(minX, minY, zoom)
    const se = lngLatToTile(maxX, minY, zoom)

    const minCol = Math.min(nw[0], sw[0])
    const maxCol = Math.max(ne[0], se[0])
    const minRow = Math.min(ne[1], se[1])
    const maxRow = Math.max(nw[1], sw[1])

    const tiles = []
    const tiles2 = []
    for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
            tiles.push({ url: getTileWMTSUrlIMG(col, row, zoom), col, row })
            tiles2.push({ url: getTileWMTSUrlCIA(col, row, zoom), col, row })
        }
    }

    const bounds = calculateBounds(tiles)
    const canvasWidth = (bounds.maxCol - bounds.minCol + 1) * tileSize
    const canvasHeight = (bounds.maxRow - bounds.minRow + 1) * tileSize

    const canvas1 = document.createElement('canvas')
    const ctx1 = canvas1.getContext('2d', { willReadFrequently: true })
    canvas1.width = canvasWidth
    canvas1.height = canvasHeight

    const [firstTile_nw_x, firstTile_nw_y] = tileToLngLat(minCol, minRow, zoom)
    const [lastTile_se_x, lastTile_se_y] = tileToLngLat(maxCol + 1, maxRow + 1, zoom)
    const geo_width = lastTile_se_x - firstTile_nw_x
    const geo_height = lastTile_se_y - firstTile_nw_y
    const pixelsPerDegreeX = canvasWidth / geo_width
    const pixelsPerDegreeY = canvasHeight / geo_height
    const selectionPixelWidth = (maxX - minX) * pixelsPerDegreeX
    const selectionPixelHeight = (minY - maxY) * pixelsPerDegreeY

    const canvas2 = document.createElement('canvas')
    canvas2.width = Math.ceil(selectionPixelWidth)
    canvas2.height = Math.ceil(selectionPixelHeight)
    const ctx2 = canvas2.getContext('2d')

    const offset_x = (minX - firstTile_nw_x) * pixelsPerDegreeX
    const offset_y = (maxY - firstTile_nw_y) * pixelsPerDegreeY

    if (progressState.showProgress) {
        progressState.totalTiles.value = tiles.length + tiles2.length
        progressState.loadedTiles.value = 0
        progressState.downloadProgress.value = 0
    }

    const images = await getAllImagesWithProgress(tiles, progressState)
    images.forEach((img, idx) => {
        if (img) {
            const tile = tiles[idx]
            const x = (tile.col - bounds.minCol) * tileSize
            const y = (tile.row - bounds.minRow) * tileSize
            ctx1.drawImage(img, x, y, tileSize, tileSize)
        }
    })
    const cias = await getAllImagesWithProgress(tiles2, progressState)
    cias.forEach((cia, idx) => {
        if (cia) {
            const tile = tiles2[idx]
            const x = (tile.col - bounds.minCol) * tileSize
            const y = (tile.row - bounds.minRow) * tileSize
            ctx1.drawImage(cia, x, y, tileSize, tileSize)
        }
    })

    const imageData = ctx1.getImageData(Math.floor(offset_x), Math.floor(offset_y), canvas2.width, canvas2.height)
    ctx2.putImageData(imageData, 0, 0)
    return canvas2
}

export const setDEMUrl = async (layerName, bbox) => {
    const resolution = 0.00027777778
    const minX = bbox.getSouthWest().lng
    const minY = bbox.getSouthWest().lat
    const maxX = bbox.getNorthEast().lng
    const maxY = bbox.getNorthEast().lat

    let wcsURL = `${import.meta.env.VITE_API_BASE_URL}/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${layerName}&format=image/tiff&subset=Long(${minX},${maxX})&subset=Lat(${minY},${maxY})`

    try {
        const demData = await fetch(wcsURL)
        const arrayBuffer = await demData.arrayBuffer()
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
        const image = await tiff.getImage()
        const dem_range = image.getBoundingBox()
        let [dem_minX, dem_minY, dem_maxX, dem_maxY] = dem_range

        if (minX < dem_minX) dem_minX -= resolution
        if (minY < dem_minY) dem_minY -= resolution
        if (maxX > dem_maxX) dem_maxX += resolution
        if (maxY > dem_maxY) dem_maxY += resolution

        wcsURL = `${import.meta.env.VITE_API_BASE_URL}/geoserver/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${layerName}&format=image/tiff&subset=Long(${dem_minX},${dem_maxX})&subset=Lat(${dem_minY},${dem_maxY})`
        return [wcsURL, [dem_minX, dem_minY, dem_maxX, dem_maxY]]
    } catch (e) {
        console.error("Failed to fetch DEM for bounds calculation", e)
        return [wcsURL, [minX, minY, maxX, maxY]]
    }
}

export const setSourceBounds = async (url, layerName, map) => {
    try {
        const response = await fetch(url)
        const xmlText = await response.text()
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
        const layerElements = xmlDoc.getElementsByTagName('Layer')
        for (let layerElem of layerElements) {
            const name = layerElem.getElementsByTagName('Name')[0]?.textContent
            if (name == layerName) {
                const bbox = layerElem.getElementsByTagName('BoundingBox')[0]
                if (bbox) {
                    const minX = parseFloat(bbox.getAttribute('minx'))
                    const minY = parseFloat(bbox.getAttribute('miny'))
                    const maxX = parseFloat(bbox.getAttribute('maxx'))
                    const maxy = parseFloat(bbox.getAttribute('maxy'))
                    const points = [
                        new window.T.LngLat(minX, maxy),
                        new window.T.LngLat(maxX, maxy),
                        new window.T.LngLat(maxX, minY),
                        new window.T.LngLat(minX, minY),
                        new window.T.LngLat(minX, maxy)
                    ]
                    const line = new window.T.Polyline(points, { color: '#049ef4', weight: 1, opacity: 0.7, lineStyle: 'dashed' })
                    map.addOverLay(line)
                }
            }
        }
    } catch (e) {
        console.warn("SetSourceBounds failed", e)
    }
}

export const calculateIntersection = (line1, line2) => {
    const [p1, p2] = line1
    const [p3, p4] = line2
    const x1 = p1[0], y1 = p1[1]
    const x2 = p2[0], y2 = p2[1]
    const x3 = p3[0], y3 = p3[1]
    const x4 = p4[0], y4 = p4[1]
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (denominator === 0) return null
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
    }
    return null
}

export const linesIntersectWithPoint = (line1, line2) => {
    const intersection = calculateIntersection(line1, line2)
    return { intersects: intersection !== null, intersectionPoint: intersection }
}

export const c_bbox_line = (bbox) => {
    const NE = bbox.getNorthEast()
    const SW = bbox.getSouthWest()
    const minX = SW.lng, minY = SW.lat
    const maxX = NE.lng, maxY = NE.lat
    return [
        [[minX, minY], [minX, maxY]],
        [[minX, maxY], [maxX, maxY]],
        [[maxX, maxY], [maxX, minY]],
        [[maxX, minY], [minX, minY]]
    ]
}

export const cal_riv_intersects = (rivList, bboxGeo, map, demOverLayerList) => {
    const riv_ins = []
    const NE = bboxGeo.getNorthEast()
    const SW = bboxGeo.getSouthWest()
    const minX = SW.lng, minY = SW.lat
    const maxX = NE.lng, maxY = NE.lat
    const T = window.T

    rivList.forEach(river => {
        if (!bboxGeo.intersects(river[0].getBounds())) return
        const riv_coords = river[0].getLngLats()
        const point_in_bbox_list = []
        const p_index = []
        for (let i = 0; i < riv_coords.length; i++) {
            if (bboxGeo.contains(riv_coords[i])) {
                if (riv_coords[i].lng != minX && riv_coords[i].lng != maxX &&
                    riv_coords[i].lat != minY && riv_coords[i].lat != maxY) {
                    point_in_bbox_list.push(riv_coords[i])
                    p_index.push(i)
                }
            }
        }

        if (p_index.length === 0) {
            const cross_point_list = []
            const ins_bounds_lines = c_bbox_line(bboxGeo)
            for (let i = 0; i < riv_coords.length - 1; i++) {
                const single_line = [[riv_coords[i].lng, riv_coords[i].lat], [riv_coords[i + 1].lng, riv_coords[i + 1].lat]]
                ins_bounds_lines.forEach(l => {
                    const ins = linesIntersectWithPoint(single_line, l)
                    if (ins.intersects) {
                        const cp = new T.LngLat(ins.intersectionPoint[0], ins.intersectionPoint[1])
                        cross_point_list.push([ins.intersectionPoint, riv_coords[i].distanceTo(cp)])
                    }
                })
            }
            cross_point_list.sort((a, b) => a[1] - b[1])
            if (cross_point_list.length >= 2) {
                const slice = [
                    new T.LngLat(cross_point_list[0][0][0], cross_point_list[0][0][1]),
                    new T.LngLat(cross_point_list[1][0][0], cross_point_list[1][0][1])
                ]
                riv_ins.push([slice, river[1]])
            }
            return
        }

        let isSingleLine = true
        for (let i = 0; i < p_index.length - 1; i++) {
            if (p_index[i] + 1 !== p_index[i + 1]) { isSingleLine = false; break }
        }

        const ins_bounds_lines = c_bbox_line(bboxGeo)

        if (!isSingleLine) {
            const startsInside = p_index[0] === 0
            const endsInside = p_index.at(-1) === riv_coords.length - 1

            let near_bounds_point_index = []
            for (let i = 0; i < p_index.length - 1; i++) {
                if (p_index[i + 1] - p_index[i] !== 1) {
                    near_bounds_point_index.push(p_index[i])
                    near_bounds_point_index.push(p_index[i + 1])
                }
            }

            if (startsInside && endsInside) {
                near_bounds_point_index.unshift(0)
                near_bounds_point_index.push(riv_coords.length - 1)
            } else if (!startsInside && endsInside) {
                near_bounds_point_index.unshift(p_index[0])
                near_bounds_point_index.push(riv_coords.length - 1)
            } else if (startsInside && !endsInside) {
                near_bounds_point_index.unshift(p_index[0])
                near_bounds_point_index.push(p_index.at(-1))
            } else {
                near_bounds_point_index.unshift(p_index[0])
                near_bounds_point_index.push(p_index.at(-1))
            }

            const cross_line_list = []
            for (let i = 0; i < near_bounds_point_index.length - 2; i += 2) {
                const idxA = near_bounds_point_index[i]
                const idxB = near_bounds_point_index[i + 1]
                if (idxA < riv_coords.length - 1) {
                    cross_line_list.push([
                        [riv_coords[idxA].lng, riv_coords[idxA].lat],
                        [riv_coords[idxA + 1].lng, riv_coords[idxA + 1].lat]
                    ])
                }
                if (idxB > 0) {
                    cross_line_list.push([
                        [riv_coords[idxB - 1].lng, riv_coords[idxB - 1].lat],
                        [riv_coords[idxB].lng, riv_coords[idxB].lat]
                    ])
                }
            }

            const cross_point_list = []
            cross_line_list.forEach(cl => {
                ins_bounds_lines.forEach(l => {
                    const ins = linesIntersectWithPoint(cl, l)
                    if (ins.intersects) cross_point_list.push(ins.intersectionPoint)
                })
            })

            for (let i = 0; i < near_bounds_point_index.length / 2; i++) {
                const slice = riv_coords.slice(
                    near_bounds_point_index[i * 2],
                    near_bounds_point_index[i * 2 + 1] + 1
                )
                if (cross_point_list[i * 2]) slice.unshift(new T.LngLat(cross_point_list[i * 2][0], cross_point_list[i * 2][1]))
                if (cross_point_list[i * 2 + 1]) slice.push(new T.LngLat(cross_point_list[i * 2 + 1][0], cross_point_list[i * 2 + 1][1]))
                riv_ins.push([slice, river[1]])
            }
        } else {
            const startsInside = p_index[0] === 0
            const endsInside = p_index.at(-1) === riv_coords.length - 1

            if (startsInside && endsInside) {
                riv_ins.push([point_in_bbox_list, river[1]])
            } else if (!startsInside && endsInside) {
                const entry_line = [
                    [riv_coords[p_index[0] - 1].lng, riv_coords[p_index[0] - 1].lat],
                    [riv_coords[p_index[0]].lng, riv_coords[p_index[0]].lat]
                ]
                ins_bounds_lines.forEach(l => {
                    const ins = linesIntersectWithPoint(entry_line, l)
                    if (ins.intersects) point_in_bbox_list.unshift(new T.LngLat(ins.intersectionPoint[0], ins.intersectionPoint[1]))
                })
                riv_ins.push([point_in_bbox_list, river[1]])
            } else if (startsInside && !endsInside) {
                const exit_line = [
                    [riv_coords[p_index.at(-1)].lng, riv_coords[p_index.at(-1)].lat],
                    [riv_coords[p_index.at(-1) + 1].lng, riv_coords[p_index.at(-1) + 1].lat]
                ]
                ins_bounds_lines.forEach(l => {
                    const ins = linesIntersectWithPoint(exit_line, l)
                    if (ins.intersects) point_in_bbox_list.push(new T.LngLat(ins.intersectionPoint[0], ins.intersectionPoint[1]))
                })
                riv_ins.push([point_in_bbox_list, river[1]])
            } else {
                const entry_line = [
                    [riv_coords[p_index[0] - 1].lng, riv_coords[p_index[0] - 1].lat],
                    [riv_coords[p_index[0]].lng, riv_coords[p_index[0]].lat]
                ]
                const exit_line = [
                    [riv_coords[p_index.at(-1)].lng, riv_coords[p_index.at(-1)].lat],
                    [riv_coords[p_index.at(-1) + 1].lng, riv_coords[p_index.at(-1) + 1].lat]
                ]
                ins_bounds_lines.forEach(l => {
                    const ins1 = linesIntersectWithPoint(entry_line, l)
                    if (ins1.intersects) point_in_bbox_list.unshift(new T.LngLat(ins1.intersectionPoint[0], ins1.intersectionPoint[1]))
                    const ins2 = linesIntersectWithPoint(exit_line, l)
                    if (ins2.intersects) point_in_bbox_list.push(new T.LngLat(ins2.intersectionPoint[0], ins2.intersectionPoint[1]))
                })
                riv_ins.push([point_in_bbox_list, river[1]])
            }
        }
    })

    riv_ins.forEach(riv => {
        const line = new window.T.Polyline(riv[0], {
            color: 'blue',
            weight: 3,
            opacity: 0.8,
            lineStyle: 'dashed'
        })
        map.addOverLay(line)
        demOverLayerList.push(line)
    })

    return riv_ins
}

export const getBbox = (recTool) => {
    return new Promise((resolve) => {
        const handler = (e) => {
            const bbox = e.currentBounds
            recTool.removeEventListener('draw', handler)
            resolve(bbox)
        }
        recTool.addEventListener('draw', handler)
    })
}
