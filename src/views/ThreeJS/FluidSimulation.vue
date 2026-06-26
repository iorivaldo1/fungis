<template>
    <div ref="container" class="fluid-sim-container"></div>
    <div class="loading-overlay" v-if="loading">
        <div class="spinner"></div>
        <div class="loading-text">Loading Terrain & Fluid Data...</div>
    </div>

    <!-- 页面说明 -->
    <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
        <div class="info-container" v-if="showPageInfo">
            <div class="info-header">
                <div class="info-title">📌 页面说明</div>
                <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
            </div>
            <div class="info-item">1. 基于浅水方程(SWE)的实时流体模拟</div>
            <div class="info-item">2. 左键点击地形可注入流体</div>
            <div class="info-item">3. 包含水深、通量、污染扩散等物理过程</div>
            <div class="info-item">4. 使用GPGPU技术加速计算</div>
        </div>
        <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
            <span>📌</span>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as GeoTIFF from 'geotiff';
import {
    createFluxShader,
    createWaterShader,
    createWaterRenderMaterial,
    createGPGPUMaterial,
    createPollutionShader
} from '../../assets/shaders/FluidShaders.js';

const container = ref(null);
const loading = ref(true);
const showPageInfo = ref(true);

// Core configuration
const TERRAIN_SIZE = 10;
const HEIGHT_SCALE = 1.0;

const params = {
    gravity: 15.0,
    pipeArea: 0.35,
    pipeLength: 0.8,
    dt: 0.005,
    injectAmount: 2.6,
    injectRadius: 0.01,
    evaporation: 0.0000
};

// Three.js variables
let scene, camera, renderer, controls;
let animationId;
let simHeightData;
let tiffWidth, tiffHeight;

// Simulation variables
let rtWater, rtFlux, rtPollution;
let currentBuffer = 0;
let gpgpuScene, gpgpuCamera, gpgpuQuad;
let fluxMesh, waterMesh, pollutionMesh;
let fluxUniforms, waterUniforms, pollutionUniforms;
let waterRenderMat, terrainMat;
let terrainMesh;

// Interaction variables
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isInjecting = false;
let injectUV = new THREE.Vector2();

const initScene = () => {
    scene = new THREE.Scene();
    // Using a dark background similar to test.html
    scene.background = new THREE.Color(0x050a10);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(4, 4, 4);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.value.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // GPGPU Setup
    gpgpuScene = new THREE.Scene();
    gpgpuCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    gpgpuQuad = new THREE.PlaneGeometry(2, 2);
};

const createRenderTarget = (useLinear = false) => {
    return new THREE.WebGLRenderTarget(tiffWidth, tiffHeight, {
        minFilter: useLinear ? THREE.LinearFilter : THREE.NearestFilter,
        magFilter: useLinear ? THREE.LinearFilter : THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        depthBuffer: false,
        stencilBuffer: false
    });
};

const loadData = async () => {
    try {
        // 1. Load Terrain Data
        const file = '/dem/terrain8.tif';
        const res = await fetch(file);
        const arrayBuffer = await res.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const rasters = await image.readRasters();
        tiffWidth = image.getWidth();
        tiffHeight = image.getHeight();
        const elevationData = new Float32Array(rasters[0]);

        // Compute elevation range
        let minElevation = Infinity, maxElevation = -Infinity;
        for (let i = 0; i < elevationData.length; i++) {
            const val = elevationData[i];
            if (val !== 0) {
                minElevation = Math.min(minElevation, val);
                maxElevation = Math.max(maxElevation, val);
            }
        }

        // Normalize height data
        const heightData = new Float32Array(tiffWidth * tiffHeight);
        for (let i = 0; i < elevationData.length; i++) {
            heightData[i] = (elevationData[i] - minElevation) / (maxElevation - minElevation);
        }

        // Create height texture (RGBA for compatibility)
        const heightDataRGBA = new Float32Array(tiffWidth * tiffHeight * 4);
        for (let i = 0; i < heightData.length; i++) {
            heightDataRGBA[i * 4] = heightData[i];
        }
        const heightTexture = new THREE.DataTexture(heightDataRGBA, tiffWidth, tiffHeight, THREE.RGBAFormat, THREE.FloatType);
        heightTexture.needsUpdate = true;
        heightTexture.minFilter = THREE.LinearFilter;
        heightTexture.magFilter = THREE.LinearFilter;

        // 2. Load DOM (Ortho image)
        const domFile = '/dom/8.tif';
        const domRes = await fetch(domFile);
        const domArrayBuffer = await domRes.arrayBuffer();
        const domTiff = await GeoTIFF.fromArrayBuffer(domArrayBuffer);
        const domImage = await domTiff.getImage();
        const domRasters = await domImage.readRasters();
        const dWidth = domImage.getWidth();
        const dHeight = domImage.getHeight();
        const bands = domRasters.length;
        const domData = new Uint8Array(dWidth * dHeight * 4);

        for (let i = 0; i < dWidth * dHeight; i++) {
            if (bands >= 3) {
                domData[i * 4 + 0] = domRasters[0][i];
                domData[i * 4 + 1] = domRasters[1][i];
                domData[i * 4 + 2] = domRasters[2][i];
                domData[i * 4 + 3] = bands >= 4 ? domRasters[3][i] : 255;
            } else {
                // Grayscale
                const val = domRasters[0][i];
                domData[i * 4 + 0] = val;
                domData[i * 4 + 1] = val;
                domData[i * 4 + 2] = val;
                domData[i * 4 + 3] = 255;
            }
        }
        const domTexture = new THREE.DataTexture(domData, dWidth, dHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
        domTexture.minFilter = THREE.LinearFilter;
        domTexture.magFilter = THREE.LinearFilter;
        domTexture.needsUpdate = true;

        // 3. Create Simulation Height Texture (Full Resolution)
        // We reuse heightDataRGBA
        simHeightData = new Float32Array(tiffWidth * tiffHeight * 4);
        simHeightData.set(heightDataRGBA);
        const simHeightTexture = new THREE.DataTexture(simHeightData, tiffWidth, tiffHeight, THREE.RGBAFormat, THREE.FloatType);
        simHeightTexture.needsUpdate = true;
        simHeightTexture.minFilter = THREE.NearestFilter;
        simHeightTexture.magFilter = THREE.NearestFilter;


        // 4. Initialize GPGPU Resources
        rtWater = [createRenderTarget(true), createRenderTarget(true)];
        rtFlux = [createRenderTarget(false), createRenderTarget(false)];
        rtPollution = [createRenderTarget(true), createRenderTarget(true)];

        // Clear targets
        const clearColor = new THREE.Color(0, 0, 0);
        renderer.setClearColor(clearColor, 0);

        [...rtWater, ...rtFlux, ...rtPollution].forEach(rt => {
            renderer.setRenderTarget(rt);
            renderer.clear();
        });
        renderer.setRenderTarget(null);

        // 5. Create Visible Terrain Mesh
        const terrainAspect = tiffHeight / tiffWidth;
        const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE * terrainAspect, tiffWidth - 1, tiffHeight - 1);

        terrainMat = new THREE.ShaderMaterial({
            uniforms: {
                uPollutionTex: { value: rtPollution[0].texture },
                uWaterTex: { value: rtWater[0].texture },
                uTerrainTex: { value: domTexture },
                uHasTerrainTex: { value: 1.0 },
                uTerrainColor: { value: new THREE.Color(0x3a5f3a) },
                uPollutionColor: { value: new THREE.Color(0x8b4513) },
                uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.5) },
                uAmbient: { value: 0.4 },
                uDiffuse: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec2 vUv;
                
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uPollutionTex;
                uniform sampler2D uWaterTex;
                uniform sampler2D uTerrainTex;
                uniform float uHasTerrainTex;
                uniform vec3 uTerrainColor;
                uniform vec3 uPollutionColor;
                uniform vec3 uLightDir;
                uniform float uAmbient;
                uniform float uDiffuse;
                
                varying vec3 vNormal;
                varying vec2 vUv;
                
                void main() {
                    // Flip Y to match
                    vec2 flippedUV = vec2(vUv.x, 1.0 - vUv.y);
                    
                    vec3 baseColor = uTerrainColor;
                    if (uHasTerrainTex > 0.5) {
                        baseColor = texture2D(uTerrainTex, flippedUV).rgb;
                    }
                    
                    float pollutionAmount = texture2D(uPollutionTex, flippedUV).r;
                    float pollutionStrength = smoothstep(0.002, 0.15, pollutionAmount);
                    
                    vec3 finalColor = mix(baseColor, uPollutionColor, pollutionStrength * 0.7);
                    
                    vec3 lightDir = normalize(uLightDir);
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 color = finalColor * (uAmbient + uDiffuse * diff);
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });

        // Apply height to terrain vertices
        const posAttr = terrainGeo.attributes.position.array;
        for (let i = 0; i < heightData.length; i++) {
            posAttr[i * 3 + 2] = heightData[i] * HEIGHT_SCALE;
        }
        terrainGeo.computeVertexNormals();

        terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
        terrainMesh.rotation.x = -Math.PI / 2;
        scene.add(terrainMesh);

        // 6. Create Compute Materials
        // Flux
        const fluxShader = createFluxShader();
        fluxUniforms = {
            uWaterTex: { value: null },
            uHeightTex: { value: simHeightTexture },
            uFluxTex: { value: null },
            uResolution: { value: new THREE.Vector2(tiffWidth, tiffHeight) },
            uDt: { value: params.dt },
            uGravity: { value: params.gravity },
            uPipeArea: { value: params.pipeArea },
            uPipeLength: { value: params.pipeLength }
        };
        const fluxMaterial = createGPGPUMaterial(fluxShader, fluxUniforms);
        fluxMesh = new THREE.Mesh(gpgpuQuad, fluxMaterial);

        // Water
        const waterShader = createWaterShader();
        waterUniforms = {
            uWaterTex: { value: null },
            uFluxTex: { value: null },
            uHeightTex: { value: simHeightTexture },
            uResolution: { value: new THREE.Vector2(tiffWidth, tiffHeight) },
            uDt: { value: params.dt },
            uPipeLength: { value: params.pipeLength },
            uInjectActive: { value: false },
            uInjectPos: { value: new THREE.Vector2(-1, -1) },
            uInjectRadius: { value: params.injectRadius },
            uInjectAmount: { value: params.injectAmount },
            uEvaporation: { value: 1.0 - params.evaporation },
            uSlopeDir: { value: new THREE.Vector2(0, 0) }
        };
        const waterMaterial = createGPGPUMaterial(waterShader, waterUniforms);
        waterMesh = new THREE.Mesh(gpgpuQuad.clone(), waterMaterial); // Clone geometry just in case

        // Pollution
        const pollutionShader = createPollutionShader();
        pollutionUniforms = {
            uPollutionTex: { value: null },
            uWaterTex: { value: null },
            uPollutionRate: { value: 0.3 },
            uDecayRate: { value: 0.00001 }
        };
        const pollutionMaterial = createGPGPUMaterial(pollutionShader, pollutionUniforms);
        pollutionMesh = new THREE.Mesh(gpgpuQuad.clone(), pollutionMaterial);

        // 7. Water Surface Mesh
        const waterGeo = new THREE.PlaneGeometry(
            TERRAIN_SIZE,
            TERRAIN_SIZE * terrainAspect,
            tiffWidth * 2 - 1,
            tiffHeight * 2 - 1
        );
        waterRenderMat = createWaterRenderMaterial();
        waterRenderMat.uniforms.uHeightTex.value = heightTexture;
        waterRenderMat.uniforms.uHeightScale.value = HEIGHT_SCALE;
        waterRenderMat.uniforms.uMaxDepth.value = 0.05;
        waterRenderMat.uniforms.uResolution.value.set(tiffWidth, tiffHeight);

        // Lighting updates for water
        waterRenderMat.uniforms.uTerrainSize.value = TERRAIN_SIZE;
        const dirLightObj = scene.children.find(c => c.isDirectionalLight);
        if (dirLightObj) waterRenderMat.uniforms.uLightDir.value.copy(dirLightObj.position).normalize();
        waterRenderMat.uniforms.uSpecularColor.value.setHex(0xffffff);
        waterRenderMat.uniforms.uShininess.value = 100.0;

        const waterSurface = new THREE.Mesh(waterGeo, waterRenderMat);
        waterSurface.rotation.x = -Math.PI / 2;
        waterSurface.position.y = 0.001;
        scene.add(waterSurface);

        loading.value = false;
        animate();

    } catch (error) {
        console.error("Error loading simulation data:", error);
        loading.value = false;
    }
};

const calculateSlopeDirection = (u, v) => {
    const texelX = 1 / tiffWidth;
    const texelY = 1 / tiffHeight;

    const ix = Math.floor(u * tiffWidth);
    const iy = Math.floor(v * tiffHeight);

    const getHeight = (x, y) => {
        x = Math.max(0, Math.min(tiffWidth - 1, x));
        y = Math.max(0, Math.min(tiffHeight - 1, y));
        return simHeightData[(y * tiffWidth + x) * 4];
    };

    const hC = getHeight(ix, iy);
    const hR = getHeight(ix + 1, iy);
    const hL = getHeight(ix - 1, iy);
    const hT = getHeight(ix, iy + 1);
    const hB = getHeight(ix, iy - 1);

    const gradX = -(hR - hL) * texelX;
    const gradY = -(hT - hB) * texelY;

    const len = Math.sqrt(gradX * gradX + gradY * gradY);
    if (len > 1e-6) {
        return new THREE.Vector2(gradX / len, gradY / len);
    }
    return new THREE.Vector2(0, 0);
};

const resetSimulation = () => {
    const clearColor = new THREE.Color(0, 0, 0);
    renderer.setClearColor(clearColor, 0);

    rtWater.forEach(rt => { renderer.setRenderTarget(rt); renderer.clear(); });
    rtFlux.forEach(rt => { renderer.setRenderTarget(rt); renderer.clear(); });
    rtPollution.forEach(rt => { renderer.setRenderTarget(rt); renderer.clear(); });

    renderer.setRenderTarget(null);
};

const simulationStep = () => {
    const curr = currentBuffer;
    const next = 1 - curr;

    gpgpuScene.clear();

    // 1. Flux
    gpgpuScene.add(fluxMesh);
    fluxUniforms.uWaterTex.value = rtWater[curr].texture;
    fluxUniforms.uFluxTex.value = rtFlux[curr].texture;
    renderer.setRenderTarget(rtFlux[next]);
    renderer.render(gpgpuScene, gpgpuCamera);

    // 2. Water
    gpgpuScene.clear();
    gpgpuScene.add(waterMesh);
    waterUniforms.uWaterTex.value = rtWater[curr].texture;
    waterUniforms.uFluxTex.value = rtFlux[next].texture;
    renderer.setRenderTarget(rtWater[next]);
    renderer.render(gpgpuScene, gpgpuCamera);

    // 3. Pollution
    gpgpuScene.clear();
    gpgpuScene.add(pollutionMesh);
    pollutionUniforms.uPollutionTex.value = rtPollution[curr].texture;
    pollutionUniforms.uWaterTex.value = rtWater[next].texture;
    renderer.setRenderTarget(rtPollution[next]);
    renderer.render(gpgpuScene, gpgpuCamera);

    // 4. Swap
    currentBuffer = next;

    // Update simulation materials for next step or rendering
    waterRenderMat.uniforms.uWaterTex.value = rtWater[currentBuffer].texture;
    terrainMat.uniforms.uPollutionTex.value = rtPollution[currentBuffer].texture;
    terrainMat.uniforms.uWaterTex.value = rtWater[currentBuffer].texture;
};

const animate = () => {
    animationId = requestAnimationFrame(animate);

    const subSteps = 5;
    for (let i = 0; i < subSteps; i++) {
        simulationStep();
    }

    controls.update();
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
};

// Event Listeners
const onMouseDown = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);

    if (intersects.length > 0 && waterUniforms) {
        resetSimulation();
        const uv = intersects[0].uv;
        injectUV.set(uv.x, 1.0 - uv.y); // Flip Y

        const slopeDir = calculateSlopeDirection(uv.x, 1.0 - uv.y);
        waterUniforms.uSlopeDir.value.copy(slopeDir);

        isInjecting = true;
        waterUniforms.uInjectActive.value = true;
        waterUniforms.uInjectPos.value.copy(injectUV);
    }
};

const onMouseUp = () => {
    isInjecting = false;
    if (waterUniforms) {
        waterUniforms.uInjectActive.value = false;
    }
};

const onMouseMove = (event) => {
    if (!isInjecting) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);

    if (intersects.length > 0 && waterUniforms) {
        const uv = intersects[0].uv;
        injectUV.set(uv.x, 1.0 - uv.y);
        waterUniforms.uInjectPos.value.copy(injectUV);

        const slopeDir = calculateSlopeDirection(uv.x, 1.0 - uv.y);
        waterUniforms.uSlopeDir.value.copy(slopeDir);
    }
};

const onWindowResize = () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
};

onMounted(() => {
    initScene();
    loadData();

    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp); // Use window for mouseup to catch drifts
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseleave', onMouseUp);
});

onBeforeUnmount(() => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onWindowResize);
    window.removeEventListener('mouseup', onMouseUp);
    if (renderer) {
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        renderer.domElement.removeEventListener('mousemove', onMouseMove);
        renderer.domElement.removeEventListener('mouseleave', onMouseUp);
        renderer.dispose();
    }
    // Optional: Dispose of geometries, materials, textures to prevent leaks
});
</script>

<style scoped>
.fluid-sim-container {
    width: 100%;
    height: 100vh;
    position: absolute;
    top: 0;
    left: 0;
    background: #050a10;
    overflow: hidden;
}

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.spinner {
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top: 4px solid #fff;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.loading-text {
    font-family: sans-serif;
    font-size: 1.2rem;
    letter-spacing: 1px;
}

/* 页面说明样式 */
.page-info {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 450;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    padding: 15px 20px;
    max-width: 320px;
    pointer-events: auto;
    user-select: none;
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

.info-title {
    font-size: 16px;
    font-weight: 700;
    color: #333;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: none;
    padding-bottom: 0;
    margin-bottom: 0;
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
    margin-bottom: 6px;
    line-height: 1.5;
    padding-left: 4px;
}

.info-item:last-child {
    margin-bottom: 0;
}
</style>
