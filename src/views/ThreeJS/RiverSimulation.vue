<template>
    <div ref="container" class="river-sim-container">
        <div v-if="loading" class="loading-overlay">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading Terrain & River Data...</div>
        </div>

        <div id="camera-info" v-if="!loading">
            <div><span class="label">Camera Position:</span></div>
            <div>X: <span>{{ camPos.x }}</span></div>
            <div>Y: <span>{{ camPos.y }}</span></div>
            <div>Z: <span>{{ camPos.z }}</span></div>
            <div style="margin-top: 8px">
                <span class="label">Camera Target:</span>
            </div>
            <div>X: <span>{{ camTarget.x }}</span></div>
            <div>Y: <span>{{ camTarget.y }}</span></div>
            <div>Z: <span>{{ camTarget.z }}</span></div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as GeoTIFF from 'geotiff';
import { riverVS, riverFS } from '@/assets/shaders/RiverShader.js';

const container = ref(null);
const loading = ref(true);

const camPos = reactive({ x: '0.00', y: '0.00', z: '0.00' });
const camTarget = reactive({ x: '0.00', y: '0.00', z: '0.00' });

let scene, camera, renderer, controls, animationId;
let riverMat;
const clock = new THREE.Clock();

const initScene = () => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a10);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-0.39, 1.21, 4.18);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.value.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-1.36, -0.07, 2.32);
    controls.update();
    
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
};

const generateRiverHeightTexture = async (jsonPath, geoExtent, heightData, demWidth, demHeight, options = {}) => {
    const { depth = 0.02, maxDistance = 50 } = options;

    const textureData = new Float32Array(demWidth * demHeight * 4);
    const pixelSegIndex = new Int32Array(demWidth * demHeight).fill(-1);
    const pixelSide = new Int8Array(demWidth * demHeight);
    
    for (let i = 0; i < demWidth * demHeight; i++) {
        const i4 = i * 4;
        textureData[i4] = -1;
        textureData[i4 + 1] = 0;
        textureData[i4 + 2] = 0;
        textureData[i4 + 3] = maxDistance;
    }

    try {
        const response = await fetch(jsonPath);
        const data = await response.json();

        const invLonRange = 1 / (geoExtent.maxLon - geoExtent.minLon);
        const invLatRange = 1 / (geoExtent.maxLat - geoExtent.minLat);

        const segments = [];
        let currentPathId = 0;

        if (data.features && Array.isArray(data.features)) {
            data.features.forEach((feature) => {
                if (feature.geometry && feature.geometry.paths) {
                    feature.geometry.paths.forEach((path) => {
                        const centerPixels = [];

                        path.forEach((coord) => {
                            const [lon, lat] = coord;
                            const normalizedX = (lon - geoExtent.minLon) * invLonRange;
                            const normalizedZ = (lat - geoExtent.minLat) * invLatRange;
                            const texX = Math.min(Math.max(normalizedX, 0), 1) * (demWidth - 1);
                            const texZ = Math.min(Math.max(1 - normalizedZ, 0), 1) * (demHeight - 1);
                            const index = Math.floor(texZ) * demWidth + Math.floor(texX);
                            const terrainHeight = heightData[index] || 0;
                            const waterHeight = terrainHeight + depth;

                            centerPixels.push({ x: texX, z: texZ, waterHeight });
                        });

                        let currentU = 0;
                        for (let i = 0; i < centerPixels.length - 1; i++) {
                            const p1 = centerPixels[i];
                            const p2 = centerPixels[i + 1];
                            const dx = p2.x - p1.x;
                            const dz = p2.z - p1.z;
                            const segmentLen = Math.sqrt(dx * dx + dz * dz);
                            segments.push({
                                p1, p2, dx, dz,
                                lengthSq: segmentLen * segmentLen,
                                length: segmentLen,
                                startU: currentU,
                                pathId: currentPathId,
                                minX: Math.min(p1.x, p2.x) - maxDistance,
                                maxX: Math.max(p1.x, p2.x) + maxDistance,
                                minZ: Math.min(p1.z, p2.z) - maxDistance,
                                maxZ: Math.max(p1.z, p2.z) + maxDistance,
                                isFirstSegment: i === 0,
                                isLastSegment: i === centerPixels.length - 2,
                            });
                            currentU += segmentLen;
                        }
                        currentPathId++;
                    });
                }
            });
        }

        const cellSize = maxDistance;
        const maxDistSq = maxDistance * maxDistance;
        const grid = new Map();

        for (let si = 0; si < segments.length; si++) {
            const seg = segments[si];
            const cxMin = Math.floor(seg.minX / cellSize);
            const cxMax = Math.floor(seg.maxX / cellSize);
            const czMin = Math.floor(seg.minZ / cellSize);
            const czMax = Math.floor(seg.maxZ / cellSize);
            for (let cz = czMin; cz <= czMax; cz++) {
                for (let cx = cxMin; cx <= cxMax; cx++) {
                    const key = cz * 100000 + cx;
                    let bucket = grid.get(key);
                    if (!bucket) {
                        bucket = [];
                        grid.set(key, bucket);
                    }
                    bucket.push(si);
                }
            }
        }

        for (let z = 0; z < demHeight; z++) {
            const cellZ = Math.floor(z / cellSize);
            for (let x = 0; x < demWidth; x++) {
                const cellX = Math.floor(x / cellSize);
                const key = cellZ * 100000 + cellX;
                const bucket = grid.get(key);
                if (!bucket) continue;

                let minDistSq = Infinity;
                let nearestWaterHeight = -1;
                let nearestU = 0;
                let nearestCapDist = 0;
                let nearestSegIdx = -1;
                let nearestClosestX = 0;
                let nearestClosestZ = 0;

                for (let bi = 0; bi < bucket.length; bi++) {
                    const seg = segments[bucket[bi]];

                    let tUnclamped = 0;
                    if (seg.lengthSq > 0) {
                        tUnclamped = ((x - seg.p1.x) * seg.dx + (z - seg.p1.z) * seg.dz) / seg.lengthSq;
                    }

                    let t = tUnclamped;
                    if (t < 0) t = 0;
                    else if (t > 1) t = 1;

                    const closestX = seg.p1.x + t * seg.dx;
                    const closestZ = seg.p1.z + t * seg.dz;
                    const dSq = (x - closestX) * (x - closestX) + (z - closestZ) * (z - closestZ);

                    let capDistForThis = 0;
                    if (seg.isFirstSegment && tUnclamped < 0) {
                        capDistForThis = -tUnclamped * seg.length;
                    } else if (seg.isLastSegment && tUnclamped > 1) {
                        capDistForThis = (tUnclamped - 1) * seg.length;
                    }

                    const epsilon = 1e-5;
                    if (dSq < minDistSq - epsilon) {
                        minDistSq = dSq;
                        nearestWaterHeight = seg.p1.waterHeight + t * (seg.p2.waterHeight - seg.p1.waterHeight);
                        nearestU = seg.startU + t * seg.length;
                        nearestCapDist = capDistForThis;
                        nearestSegIdx = bucket[bi];
                        nearestClosestX = closestX;
                        nearestClosestZ = closestZ;
                    } else if (Math.abs(dSq - minDistSq) <= epsilon) {
                        nearestCapDist = Math.min(nearestCapDist, capDistForThis);
                    }
                }

                if (minDistSq <= maxDistSq) {
                    const idx = z * demWidth + x;
                    const idx4 = idx * 4;
                    pixelSegIndex[idx] = nearestSegIdx;
                    
                    const nearestSeg = segments[nearestSegIdx];
                    const cross = nearestSeg.dx * (z - nearestClosestZ) - nearestSeg.dz * (x - nearestClosestX);
                    pixelSide[idx] = cross >= 0 ? 1 : -1;

                    textureData[idx4] = nearestWaterHeight;
                    const signedDist = Math.sqrt(minDistSq) * pixelSide[idx];
                    textureData[idx4 + 1] = signedDist;
                    textureData[idx4 + 2] = nearestU;
                    textureData[idx4 + 3] = nearestCapDist;
                }
            }
        }

        const riverTexture = new THREE.DataTexture(textureData, demWidth, demHeight, THREE.RGBAFormat, THREE.FloatType);
        riverTexture.wrapS = THREE.ClampToEdgeWrapping;
        riverTexture.wrapT = THREE.ClampToEdgeWrapping;
        riverTexture.minFilter = THREE.LinearFilter;
        riverTexture.magFilter = THREE.LinearFilter;
        riverTexture.needsUpdate = true;

        return riverTexture;
    } catch (error) {
        console.error("生成河流纹理失败:", error);
        return null;
    }
};

const loadDataAndBuild = async () => {
    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (url) => new Promise((resolve) => {
        textureLoader.load(url, (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            tex.needsUpdate = true;
            resolve(tex);
        });
    });

    const [waterNormalMapTex, foamMapTex, waterSpecularMapTex] = await Promise.all([
        loadTexture('/images/WaterNormal.jpg'),
        loadTexture('/images/foam.jpg'),
        loadTexture('/images/WaterSpecular.jpg')
    ]);

    const file = "/dem/terrain8.tif";
    const res = await fetch(file);
    const arrayBuffer = await res.arrayBuffer();
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const demWidth = image.getWidth();
    const demHeight = image.getHeight();
    const elevationData = new Float32Array(rasters[0]);
    
    let minElevation = Infinity, maxElevation = -Infinity;
    for (let i = 0; i < elevationData.length; i++) {
        const val = elevationData[i];
        if (val !== 0) {
            if (val < minElevation) minElevation = val;
            if (val > maxElevation) maxElevation = val;
        }
    }
    
    const heightData = new Float32Array(demWidth * demHeight);
    for (let i = 0; i < elevationData.length; i++) {
        heightData[i] = (elevationData[i] - minElevation) / (maxElevation - minElevation);
    }
    
    const heightTexture = new THREE.DataTexture(heightData, demWidth, demHeight, THREE.RedFormat, THREE.FloatType);
    heightTexture.wrapS = THREE.ClampToEdgeWrapping;
    heightTexture.wrapT = THREE.ClampToEdgeWrapping;
    heightTexture.minFilter = THREE.LinearFilter;
    heightTexture.magFilter = THREE.LinearFilter;
    heightTexture.needsUpdate = true;

    const planeWidth = 10;
    const planeHeight = (planeWidth * demHeight) / demWidth;

    const bbox = image.getBoundingBox();
    const geoExtent = {
        minLon: bbox[0],
        maxLon: bbox[2],
        minLat: bbox[1],
        maxLat: bbox[3],
    };

    const riverWidth = 60.0;
    const terrainColor = new THREE.Color(0xDDDDDD);

    const terrainGeo = new THREE.PlaneGeometry(planeWidth, planeHeight, demWidth - 1, demHeight - 1);
    const uvs = terrainGeo.attributes.uv.array;
    for (let i = 1; i < uvs.length; i += 2) {
        uvs[i] = 1.0 - uvs[i];
    }

    const terrainMat = new THREE.MeshStandardMaterial({
        color: terrainColor,
        wireframe: true,
        displacementMap: heightTexture,
        displacementScale: 1.0,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.rotation.x = -Math.PI / 2;
    scene.add(terrainMesh);

    const riverHeightTexture = await generateRiverHeightTexture(
        '/json/river.json',
        geoExtent,
        heightData,
        demWidth,
        demHeight,
        { depth: 0.02, maxDistance: riverWidth / 2 }
    );

    const riverGeo = new THREE.PlaneGeometry(planeWidth, planeHeight, demWidth - 1, demHeight - 1);

    riverMat = new THREE.ShaderMaterial({
        uniforms: {
            heightMap: { value: heightTexture },
            riverHeightMap: { value: riverHeightTexture },
            waterNormalMap: { value: waterNormalMapTex },
            foamMap: { value: foamMapTex },
            waterSpecularMap: { value: waterSpecularMapTex },
            terrainColor: { value: terrainColor },
            maxRiverWidth: { value: riverWidth / 2 },
            u_time: { value: 0 },
            texelSize: {
                value: new THREE.Vector2(1.0 / heightTexture.image.width, 1.0 / heightTexture.image.height),
            },
            riverTexSize: {
                value: new THREE.Vector2(demWidth, demHeight),
            },
        },
        vertexShader: riverVS,
        fragmentShader: riverFS,
        transparent: false,
    });

    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    riverMesh.rotation.x = -Math.PI / 2;
    scene.add(riverMesh);

    loading.value = false;
    animate();
};

const animate = () => {
    animationId = requestAnimationFrame(animate);

    if (riverMat) {
        const deltaTime = clock.getDelta();
        riverMat.uniforms.u_time.value += deltaTime * 0.01;
    }
    
    if (controls) {
        controls.update();
        camTarget.x = controls.target.x.toFixed(2);
        camTarget.y = controls.target.y.toFixed(2);
        camTarget.z = controls.target.z.toFixed(2);
    }

    if (camera) {
        camPos.x = camera.position.x.toFixed(2);
        camPos.y = camera.position.y.toFixed(2);
        camPos.z = camera.position.z.toFixed(2);
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
};

const onResize = () => {
    if (camera && renderer && container.value) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
};

onMounted(() => {
    initScene();
    loadDataAndBuild();
    window.addEventListener("resize", onResize);
    onResize();
});

onUnmounted(() => {
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(animationId);
    if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement = null;
    }
});
</script>

<style scoped>
.river-sim-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background-color: #050a10;
    user-select: none;
}

#camera-info {
    position: fixed;
    left: 20px;
    bottom: 20px;
    background: rgba(0, 0, 0, 0.7);
    color: #00ff00;
    padding: 15px;
    font-family: "Courier New", monospace;
    font-size: 15px;
    border-radius: 5px;
    border: 1px solid #00ff00;
    line-height: 1.6;
    z-index: 1000;
    min-width: 150px;
}

#camera-info .label {
    color: #00ccff;
    font-weight: bold;
}

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: white;
    z-index: 20;
}

.loading-spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>
