import * as THREE from 'three'
import * as GeoTIFF from 'geotiff'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export const c_mesh_dem = async (demData, camera, m_meshname) => {
    const tiff = await GeoTIFF.fromArrayBuffer(demData)
    const image = await tiff.getImage()
    const rasters = await image.readRasters()
    const width = image.getWidth()
    const height = image.getHeight()
    const elevationData = new Float32Array(rasters[0])
    const geometry = new THREE.PlaneGeometry(5, 5 * height / width, width - 1, height - 1)

    let maxElevation = -Infinity
    let minElevation = Infinity
    for (let i = 0; i < elevationData.length; i++) {
        const val = elevationData[i]
        if (val > maxElevation) maxElevation = val
        if (val !== 0 && val < minElevation) minElevation = val
    }

    const positions = geometry.attributes.position.array
    for (let i = 0; i < elevationData.length; i++) {
        if (maxElevation === minElevation) {
            positions[i * 3 + 2] = 0
        } else {
            positions[i * 3 + 2] = (elevationData[i] - minElevation) / (maxElevation - minElevation)
        }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    const meshMaterial = new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true })
    const mesh_dem = new THREE.Mesh(geometry, meshMaterial)
    mesh_dem.name = m_meshname
    mesh_dem.rotation.x = -Math.PI / 2
    camera.position.set(0, 5, 3.5)
    return [mesh_dem, minElevation, maxElevation, geometry]
}

export function lineSegmentsIntersect(seg1, seg2, epsilon = 1e-10) {
    const [p1, p2] = seg1;
    const [p3, p4] = seg2;

    const d1x = p2[0] - p1[0];
    const d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0];
    const d2y = p4[1] - p3[1];

    const denominator = d1x * d2y - d1y * d2x;

    if (Math.abs(denominator) < epsilon) {
        return { intersects: false };
    }

    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denominator;
    const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denominator;

    const isTInside = t > epsilon && t < 1 - epsilon;
    const isUInside = u > epsilon && u < 1 - epsilon;

    if (isTInside && isUInside) {
        const intersectionX = p1[0] + t * d1x;
        const intersectionY = p1[1] + t * d1y;

        return {
            intersects: true,
            intersectionPoint: [intersectionX, intersectionY],
            t: t,
            u: u
        };
    }

    return { intersects: false };
}

export function setupLineProgress(geometry, points) {
    let totalLength = 0;
    const segmentLengths = [];
    for (let i = 0; i < points.length - 1; i++) {
        const length = points[i].distanceTo(points[i + 1]);
        segmentLengths.push(length);
        totalLength += length;
    }
    const lineProgress = new Float32Array(points.length);
    lineProgress[0] = 0;
    let accumulatedLength = 0;
    for (let i = 1; i < points.length; i++) {
        accumulatedLength += segmentLengths[i - 1];
        lineProgress[i] = accumulatedLength / totalLength;
    }

    geometry.setAttribute('lineProgress', new THREE.BufferAttribute(lineProgress, 1));
    return totalLength;
}

export function deleteGroup(scene, groupName) {
    const group = scene.getObjectByName(groupName);
    if (group) {
        scene.remove(group)
    }
}

export function calFontSizeByGeoBBox(bbox) {
    const minX = bbox.getSouthWest().lng
    const minY = bbox.getSouthWest().lat
    const maxX = bbox.getNorthEast().lng
    const maxY = bbox.getNorthEast().lat
    const width = maxX - minX
    const height = maxY - minY
    const geoSize = Math.max(width, height)

    let fontSize
    if (geoSize < 0.001) {
        fontSize = 24
    } else if (geoSize < 0.01) {
        fontSize = 12
    } else if (geoSize < 0.1) {
        fontSize = 6
    } else if (geoSize < 1) {
        fontSize = 6
    } else {
        fontSize = 6
    }
    fontSize = Math.max(4, Math.min(36, fontSize))

    return fontSize
}

export async function cal_mid_p_riv_label(rivName, rivPointList, sphereRadius, fontSize) {
    let riv_three_len = 0.0
    for (let i = 0; i < rivPointList.length - 1; i++) {
        const seg_len = rivPointList[i].distanceTo(rivPointList[i + 1])
        riv_three_len += seg_len
    }
    let p_m = 0.0
    for (let i = 1; i < rivPointList.length; i++) {
        const seg_len = rivPointList[i].distanceTo(rivPointList[i - 1])
        p_m += seg_len
        if (p_m > riv_three_len / 2) {
            const river_icon = '/images/river.png'
            const riv_label = await createTextSpriteWithIcon(rivName, rivPointList[i], sphereRadius, '#366ee5', fontSize, river_icon)
            return riv_label
        }
    }
}

export function createTextWithoutIcon(text, point, spere_radius, text_color, fontSize) {
    const scale = fontSize <= 8 ? 8 : 4
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const baseWidth = 256
    const baseHeight = 256
    canvas.width = baseWidth * scale
    canvas.height = baseHeight * scale
    context.scale(scale, scale)

    const fontFamily = 'Arial, sans-serif'
    context.font = `bold ${fontSize}px ${fontFamily}`
    context.textAlign = 'left'
    context.textBaseline = 'middle'

    const metrics = context.measureText(text)
    const textWidth = metrics.width
    const textHeight = fontSize

    const bgWidth = textWidth + fontSize
    const bgHeight = textHeight + fontSize

    const centerX = baseWidth / 2
    const centerY = baseHeight / 2
    const bgX = centerX - bgWidth / 2
    const bgY = centerY - bgHeight / 2

    context.fillStyle = '#ffffff'
    context.fillRect(
        Math.floor(bgX) + 0.5,
        Math.floor(bgY) + 0.5,
        Math.floor(bgWidth),
        Math.floor(bgHeight)
    )

    context.fillStyle = text_color
    context.fillText(text, Math.floor(bgX + fontSize / 2) + 0.5, Math.floor(centerY) + 0.5)

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(point);
    sprite.position.y += spere_radius * 4;

    return sprite;
}

export function createTextSpriteWithIcon(text, point, spere_radius, text_color, fontSize, iconUrl) {
    const scale = fontSize <= 8 ? 8 : 4
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const baseWidth = 256
    const baseHeight = 256
    canvas.width = baseWidth * scale
    canvas.height = baseHeight * scale
    context.scale(scale, scale)

    return new Promise((resolve) => {
        const icon = new Image()
        icon.onload = function () {
            const fontFamily = 'Arial, sans-serif'
            context.font = `bold ${fontSize}px ${fontFamily}`
            context.textAlign = 'left'
            context.textBaseline = 'middle'

            const metrics = context.measureText(text)
            const textWidth = metrics.width
            const textHeight = fontSize

            const iconSize = fontSize * 1.2
            const spacing = fontSize * 0.3

            const totalWidth = iconSize + spacing + textWidth

            const paddingH = Math.max(2, fontSize * 0.4)
            const paddingV = Math.max(1, fontSize * 0.3)
            const bgWidth = totalWidth + paddingH * 2
            const bgHeight = Math.max(iconSize, textHeight) + paddingV * 2

            const centerX = baseWidth / 2
            const centerY = baseHeight / 2
            const bgX = centerX - bgWidth / 2
            const bgY = centerY - bgHeight / 2

            const alignedBgX = Math.floor(bgX) + 0.5
            const alignedBgY = Math.floor(bgY) + 0.5
            const alignedBgWidth = Math.floor(bgWidth)
            const alignedBgHeight = Math.floor(bgHeight)

            context.fillStyle = '#ffffff'
            context.fillRect(
                alignedBgX,
                alignedBgY,
                alignedBgWidth,
                alignedBgHeight
            )

            const iconX = centerX - totalWidth / 2
            const iconY = centerY - iconSize / 2

            context.drawImage(
                icon,
                iconX,
                iconY,
                iconSize,
                iconSize
            )

            const textX = iconX + iconSize + spacing
            const alignedTextX = Math.floor(textX) + 0.5
            const alignedTextY = Math.floor(centerY) + 0.5

            context.fillStyle = text_color
            context.fillText(text, alignedTextX, alignedTextY)

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true
            });
            const sprite = new THREE.Sprite(material);
            sprite.position.copy(point);
            sprite.position.y += spere_radius * 4;

            resolve(sprite);
        }

        icon.onerror = function () {
            console.error('图标加载失败:', iconUrl)
            resolve(createTextWithoutIcon(text, point, spere_radius, text_color, fontSize))
        }

        icon.src = iconUrl
    })
}



export async function c_polyline_riv_animate(scene, meshDem, box3, riverInsList, bboxGeo, material) {
    const raycaster = new THREE.Raycaster()

    deleteGroup(scene, 'river_group')
    const riverGroup = new THREE.Group()
    riverGroup.name = 'river_group'

    const geo_bounds_min_x = bboxGeo.getSouthWest().getLng()
    const geo_bounds_min_y = bboxGeo.getSouthWest().getLat()
    const geo_bounds_max_x = bboxGeo.getNorthEast().getLng()
    const geo_bounds_max_y = bboxGeo.getNorthEast().getLat()
    const geo_width = geo_bounds_max_x - geo_bounds_min_x
    const geo_height = geo_bounds_max_y - geo_bounds_min_y
    const dem_width = box3.max.x - box3.min.x
    const dem_height = box3.max.z - box3.min.z

    const mesh_col = meshDem.geometry.parameters.widthSegments
    const mesh_row = meshDem.geometry.parameters.heightSegments
    const spere_radius = 50 / Math.min(mesh_col / geo_width, mesh_row / geo_height)

    const wireframeGeometry = new THREE.WireframeGeometry(meshDem.geometry)
    meshDem.localToWorld(wireframeGeometry)
    const positionAttribute = wireframeGeometry.getAttribute('position')
    for (let i = 0; i < riverInsList.length; i++) {
        const riv_point_three = []
        for (let j = 0; j < riverInsList[i][0].length; j++) {
            const geoPoint = [riverInsList[i][0][j].lng, riverInsList[i][0][j].lat]
            const three_pos_x = ((geoPoint[0] - geo_bounds_min_x) * dem_width) / geo_width
            const three_pos_z = ((geoPoint[1] - geo_bounds_min_y) * dem_height) / geo_height
            let three_pos_x_trans = three_pos_x - dem_width / 2
            let three_pos_z_trans = dem_height / 2 - three_pos_z

            if (Math.abs(three_pos_x_trans - box3.min.x) < 0.00000001) {
                three_pos_x_trans += 0.00000001;
            } else if (Math.abs(three_pos_x_trans - box3.max.x) < 0.00000001) {
                three_pos_x_trans -= 0.00000001;
            } else if (Math.abs(three_pos_z_trans - box3.min.z) < 0.00000001) {
                three_pos_z_trans += 0.00000001;
            } else if (Math.abs(three_pos_z_trans - box3.max.z) < 0.00000001) {
                three_pos_z_trans -= 0.00000001;
            }

            const startY = meshDem.geometry.boundingBox.max.y + 10
            const direction = new THREE.Vector3(0, -1, 0)
            const rayOrigin = new THREE.Vector3(
                three_pos_x_trans,
                startY,
                three_pos_z_trans
            )
            raycaster.set(rayOrigin, direction)
            const intersects = raycaster.intersectObjects([meshDem])
            if (intersects.length > 0) {
                const point = intersects[0].point
                riv_point_three.push([[three_pos_x_trans, three_pos_z_trans], point])
            } else {
                console.log(box3, riverInsList[i][0].length, j, three_pos_x_trans, three_pos_z_trans)
            }
        }

        let river_point_list = []
        for (let j = 0; j < riv_point_three.length - 1; j++) {
            river_point_list.push([riv_point_three[j][1]])

            const riv_sp = riv_point_three[j][0]
            const riv_ep = riv_point_three[j + 1][0]
            const riv_line = [riv_sp, riv_ep]
            const seg_point_list = []
            for (let k = 0; k < positionAttribute.count - 1; k += 2) {
                const start = new THREE.Vector3()
                const end = new THREE.Vector3()
                start.fromBufferAttribute(positionAttribute, k)
                end.fromBufferAttribute(positionAttribute, k + 1)
                meshDem.localToWorld(start)
                meshDem.localToWorld(end)
                const seg_sp = [start.x, start.y]
                const seg_ep = [end.x, end.y]
                const seg_line = [seg_sp, seg_ep]
                const ins_point1 = lineSegmentsIntersect(seg_line, riv_line)

                if (ins_point1.intersects) {
                    const startY = meshDem.geometry.boundingBox.max.y + 10
                    const direction = new THREE.Vector3(0, -1, 0)
                    const rayOrigin = new THREE.Vector3(
                        ins_point1.intersectionPoint[0],
                        startY,
                        ins_point1.intersectionPoint[1]
                    )
                    raycaster.set(rayOrigin, direction)
                    const intersects = raycaster.intersectObjects([meshDem])
                    if (intersects.length > 0) {
                        const point = intersects[0].point
                        const dis = point.distanceTo(riv_point_three[j][1]);
                        seg_point_list.push([point, dis])
                    }
                }
            }
            seg_point_list.sort((a, b) => a[1] - b[1]);
            for (let k = 0; k < seg_point_list.length; k++) {
                river_point_list.push(seg_point_list[k])
            }

        }
        if (riv_point_three.length > 0) {
            river_point_list.push([riv_point_three.at(-1)[1], 10000])
        }

        const river_point_list_sorted = river_point_list.map(item => item[0])
        const riv_three_geo = new THREE.BufferGeometry().setFromPoints(river_point_list_sorted)
        setupLineProgress(riv_three_geo, river_point_list_sorted);
        const line = new THREE.Line(riv_three_geo, material)
        riverGroup.add(line)

        const fontSize = calFontSizeByGeoBBox(bboxGeo)
        const riv_label = await cal_mid_p_riv_label(riverInsList[i][1], river_point_list_sorted, spere_radius, fontSize)
        if (riv_label) riverGroup.add(riv_label)

        scene.add(riverGroup)
    }
    return riverGroup
}

export const createScene = (container, camera) => {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)

    const loader = new THREE.TextureLoader()
    const texture = loader.load('/images/bg1.jpeg', () => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        texture.colorSpace = THREE.SRGBColorSpace
        scene.background = texture
    })

    const ambientLight = new THREE.AmbientLight(0x404040)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(1, 1, 1)
    scene.add(ambientLight)
    scene.add(directionalLight)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const control = new OrbitControls(camera, renderer.domElement)
    control.enablePan = true

    return [scene, control, renderer]
}

const dash_line_flow_vs2 = `
    varying float vT;
    void main() {
        vT = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const dash_line_flow_fs2 = `
    uniform float time;
    uniform float line_len;
    varying float vT;
    void main() {
        float animatedT = vT + time * 0.2;
        float segment = mod(animatedT, line_len / 10.0);
        if (segment < line_len / 20.0) {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        } else {
            discard;
        }
    }
`;

export async function c_bridge(scene, meshDem, bridgePointList, bboxGeo) {
    deleteGroup(scene, 'bridge_group')
    const bridge_group = new THREE.Group()
    bridge_group.name = 'bridge_group'

    const raycaster = new THREE.Raycaster()
    const fontSize = calFontSizeByGeoBBox(bboxGeo)

    const box3 = new THREE.Box3().setFromObject(meshDem);
    const geo_bounds_min_x = bboxGeo.getSouthWest().getLng()
    const geo_bounds_min_y = bboxGeo.getSouthWest().getLat()
    const geo_bounds_max_x = bboxGeo.getNorthEast().getLng()
    const geo_bounds_max_y = bboxGeo.getNorthEast().getLat()
    const geo_width = geo_bounds_max_x - geo_bounds_min_x
    const geo_height = geo_bounds_max_y - geo_bounds_min_y
    const dem_width = box3.max.x - box3.min.x
    const dem_height = box3.max.z - box3.min.z
    const mesh_col = meshDem.geometry.parameters.widthSegments
    const mesh_row = meshDem.geometry.parameters.heightSegments
    const spere_radius = 100 / Math.min(mesh_col / geo_width, mesh_row / geo_height)

    //指示线-----Line，不用setupLineProgress方式来控制shader
    const dash_line_sp = new THREE.Vector3(0, 0, 0)
    const dash_line_ep = dash_line_sp.clone().setY(dash_line_sp.y + spere_radius * 4)
    const label_line_geometry = new THREE.BufferGeometry().setFromPoints([dash_line_sp, dash_line_ep])
    const lable_line_material = new THREE.ShaderMaterial({
        vertexShader: dash_line_flow_vs2,
        fragmentShader: dash_line_flow_fs2,
        uniforms: {
            time: { value: 0.0 },
            line_len: { value: dash_line_ep.distanceTo(dash_line_sp) }
        },
    });
    const label_line_mesh = new THREE.Line(label_line_geometry, lable_line_material)
    label_line_mesh.renderOrder = 999;
    label_line_mesh.frustumCulled = false;
    label_line_mesh.userData.material = lable_line_material;

    //筛选点
    const inBboxPointList = []
    bridgePointList.forEach(p => {
        const p_pos_tdt = new window.T.LngLat(p[0], p[1])
        if (bboxGeo.contains(p_pos_tdt)) {
            inBboxPointList.push([p[0], p[1], p[2]])
        }
    })

    for (let i = 0; i < inBboxPointList.length; i++) {
        const geoPoint = [inBboxPointList[i][0], inBboxPointList[i][1]]
        //平面
        const three_pos_x = ((geoPoint[0] - geo_bounds_min_x) * dem_width) / geo_width //将选择框缩放至dem大小，p点位置距dem左上角x距离等比缩放
        const three_pos_z = ((geoPoint[1] - geo_bounds_min_y) * dem_height) / geo_height //将选择框缩放至dem大小，p点位置距dem左上角y距离等比缩放
        let three_pos_x_trans = three_pos_x - dem_width / 2 //左上坐标系平移至中间点坐标系
        let three_pos_z_trans = dem_height / 2 - three_pos_z //左上坐标系平移至中间点坐标
        //*****先判断点是否刚好在边界上,若在,需要偏移极小量,否则不能相交
        if (Math.abs(three_pos_x_trans - box3.min.x) < 0.00000001) {
            three_pos_x_trans += 0.00000001;
        } else if (Math.abs(three_pos_x_trans - box3.max.x) < 0.00000001) {
            three_pos_x_trans -= 0.00000001;
        } else if (Math.abs(three_pos_z_trans - box3.min.z) < 0.00000001) {
            three_pos_z_trans += 0.00000001;
        } else if (Math.abs(three_pos_z_trans - box3.max.z) < 0.00000001) {
            three_pos_z_trans -= 0.00000001;
        }

        //高程
        const startY = meshDem.geometry.boundingBox.max.y + 10
        const direction = new THREE.Vector3(0, -1, 0)
        const rayOrigin = new THREE.Vector3(
            three_pos_x_trans,
            startY,
            three_pos_z_trans
        )
        raycaster.set(rayOrigin, direction)
        const intersects = raycaster.intersectObjects([meshDem])
        if (intersects.length > 0) {
            //指示线
            const label_line_mesh = new THREE.Line(label_line_geometry, lable_line_material)
            label_line_mesh.renderOrder = 999;
            label_line_mesh.frustumCulled = false;
            label_line_mesh.userData.material = lable_line_material;
            const point = intersects[0].point
            label_line_mesh.position.copy(point)
            bridge_group.add(label_line_mesh)

            //河流名称
            const brigde_icon = '/images/bridge.png'
            const bridge_name = await createTextSpriteWithIcon(inBboxPointList[i][2], point, spere_radius, '#366ee5', fontSize, brigde_icon)
            bridge_group.add(bridge_name)
        }
    }

    scene.add(bridge_group)

    return lable_line_material
}
