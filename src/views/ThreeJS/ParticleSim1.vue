<template>
    <div ref="container" class="three-container">
        <div v-if="loading" class="loading-overlay">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading Terrain...</div>
        </div>
        <!-- 页面说明 -->
        <div class="page-info" :class="{ 'info-collapsed': !showPageInfo }">
            <div class="info-container" v-if="showPageInfo">
                <div class="info-header">
                    <div class="info-title">📌 页面说明</div>
                    <div class="close-btn" @click="showPageInfo = false" title="收起">×</div>
                </div>
                <div class="info-item">1. 基于GPGPU的粒子模拟</div>
                <div class="info-item">2. 粒子沿地形流动，可视化流场</div>
                <div class="info-item">3. 点击地形可发射交互粒子</div>
                <div class="info-item">4.右上角面板可调节参数</div>
            </div>
            <div class="info-collapsed-icon" v-else @click="showPageInfo = true" title="展开说明">
                <span>📌</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as GeoTIFF from 'geotiff';
import GUI from 'lil-gui';
import {
    createPosShader,
    createRenderMat,
    createVelShader,
    createTrailParticleMaterial,
    createFadeMaterial,
    createTerrainWireframeMaterial
} from '@/assets/shaders/ParticleShader.js';

const container = ref(null);
const loading = ref(true);
const showPageInfo = ref(true);
let scene, camera, renderer, controls, animationId;
let rtPosCurr, rtPosNext, rtVelCurr, rtVelNext, simScene, simCamera, simQuad, posShader, velShader, renderMat;
let rtTrailCurr, rtTrailNext, trailScene, trailCamera, fadeQuad, trailParticles, trailParticleMat, fadeMat, terrainMat;
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const lastIntersect = new THREE.Vector3();
let spawnRequest = false;
let gui;

// Configuration
let texSize = 23;
let PARTICLE_COUNT = texSize * texSize;

const params = {
    range: 0.2, // Default matching shader default
    particleCount: 23, // Sqrt of particle count
    keepTrail: true,
    showTexture: true
};

const initScene = () => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // renderer.setPixelRatio(window.devicePixelRatio); // Optional, might be heavy
    container.value.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
};

const loadTerrain = async () => {
    try {
        const file = '/dem/terrain8.tif';
        const res = await fetch(file);
        const arrayBuffer = await res.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const rasters = await image.readRasters();
        const width = image.getWidth();
        const height = image.getHeight();
        const elevationData = new Float32Array(rasters[0]);

        let minElevation = Infinity, maxElevation = -Infinity;
        for (let i = 0; i < elevationData.length; i++) {
            const val = elevationData[i];
            if (val !== 0) {
                if (val < minElevation) minElevation = val;
                if (val > maxElevation) maxElevation = val;
            }
        }

        const heightData = new Float32Array(width * height);
        for (let i = 0; i < elevationData.length; i++) {
            heightData[i] = (elevationData[i] - minElevation) / (maxElevation - minElevation);
        }

        const heightTexture = new THREE.DataTexture(heightData, width, height, THREE.RedFormat, THREE.FloatType);
        heightTexture.needsUpdate = true;

        // Load DOM (Ortho Image)
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

        // Terrain Geometry
        const planeSize = 10;
        const terrainAspect = height / width;
        const terrainGeo = new THREE.PlaneGeometry(planeSize, planeSize * terrainAspect, width - 1, height - 1);
        const posAttr = terrainGeo.attributes.position.array;
        for (let i = 0; i < elevationData.length; i++) {
            posAttr[i * 3 + 2] = heightData[i] * 2.0;
        }
        terrainGeo.computeVertexNormals();

        // Initial terrain mat (will be updated with trail texture in initSimulation)
        // Note: passing domTexture here now
        terrainMat = createTerrainWireframeMaterial(heightTexture, terrainAspect, domTexture);
        const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
        terrainMesh.rotation.x = -Math.PI / 2;
        // Assign name for raycasting
        terrainMesh.name = "Terrain";
        scene.add(terrainMesh);

        // Add lighting for textured mode
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);

        initSimulation(heightTexture, width, height, terrainAspect, domTexture);
        initGUI(heightTexture, width, height, terrainAspect, domTexture); // Pass params to re-init if needed
        loading.value = false;
    } catch (error) {
        console.error("Failed to load terrain:", error);
        loading.value = false;
    }
};

const initSimulation = (heightTexture, width, height, terrainAspect, domTexture, size = 23) => {
    texSize = size;
    PARTICLE_COUNT = texSize * texSize;

    // Cleanup existing particles if re-initializing
    const existingParticles = scene.getObjectByName("Particles");
    if (existingParticles) {
        scene.remove(existingParticles);
        existingParticles.geometry.dispose();
        existingParticles.material.dispose();
    }

    // GPGPU setup
    const renderTargetOptions = {
        format: THREE.RGBAFormat,
        type: THREE.FloatType, // Important for position precision
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter
    };

    if (rtPosCurr) rtPosCurr.dispose();
    if (rtPosNext) rtPosNext.dispose();
    if (rtVelCurr) rtVelCurr.dispose();
    if (rtVelNext) rtVelNext.dispose();

    rtPosCurr = new THREE.WebGLRenderTarget(texSize, texSize, renderTargetOptions);
    rtPosNext = new THREE.WebGLRenderTarget(texSize, texSize, renderTargetOptions);
    rtVelCurr = new THREE.WebGLRenderTarget(texSize, texSize, renderTargetOptions);
    rtVelNext = new THREE.WebGLRenderTarget(texSize, texSize, renderTargetOptions);

    // Trail RTs
    const trailSize = 1024;
    if (rtTrailCurr) rtTrailCurr.dispose();
    if (rtTrailNext) rtTrailNext.dispose();
    rtTrailCurr = new THREE.WebGLRenderTarget(trailSize, trailSize, renderTargetOptions);
    rtTrailNext = new THREE.WebGLRenderTarget(trailSize, trailSize, renderTargetOptions);

    // Clear trails
    renderer.setRenderTarget(rtTrailCurr);
    renderer.clear();
    renderer.setRenderTarget(rtTrailNext);
    renderer.clear();
    renderer.setRenderTarget(null);

    // Initial positions and velocities
    const initialPos = new Float32Array(PARTICLE_COUNT * 4);
    const initialVel = new Float32Array(PARTICLE_COUNT * 4);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        initialPos[i * 4] = 999.0;
        initialPos[i * 4 + 1] = 0.0;
        initialPos[i * 4 + 2] = 0.0;
        initialPos[i * 4 + 3] = 1.0;

        initialVel[i * 4] = 0.0;
        initialVel[i * 4 + 1] = 0.0;
        initialVel[i * 4 + 2] = 0.0;
        initialVel[i * 4 + 3] = 1.0;
    }

    const posInitTex = new THREE.DataTexture(initialPos, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);
    posInitTex.needsUpdate = true;
    const velInitTex = new THREE.DataTexture(initialVel, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);
    velInitTex.needsUpdate = true;

    // Sim Scene
    if (!simScene) {
        simScene = new THREE.Scene();
        simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        simScene.add(simQuad);
    }

    // Trail Scene
    if (!trailScene) {
        trailScene = new THREE.Scene();
        // Area: -5 to 5 in X, -5*aspect to 5*aspect in Z
        const h = 5.0 * terrainAspect;
        trailCamera = new THREE.OrthographicCamera(-5, 5, h, -h, 0.1, 100);
        trailCamera.position.set(0, 10, 0);
        trailCamera.lookAt(0, 0, 0);

        fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); // Full screen quad for fade
        fadeQuad.rotation.x = -Math.PI / 2;
        fadeQuad.position.y = 0.05;
        trailScene.add(fadeQuad);
    }

    // Init Values
    const initShader = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`
    });

    simQuad.material = initShader;

    // Init Positions
    initShader.uniforms.tDiffuse.value = posInitTex;
    renderer.setRenderTarget(rtPosCurr);
    renderer.render(simScene, simCamera);

    // Init Velocities
    initShader.uniforms.tDiffuse.value = velInitTex;
    renderer.setRenderTarget(rtVelCurr);
    renderer.render(simScene, simCamera);
    renderer.setRenderTarget(null);

    // Shaders
    const texelStep = 2.0;
    const texelSize = new THREE.Vector2(texelStep / width, texelStep / height);

    velShader = createVelShader(heightTexture, terrainAspect, texelSize);
    posShader = createPosShader(terrainAspect);
    if (params.range) posShader.uniforms.uRange.value = params.range;

    renderMat = createRenderMat(heightTexture, terrainAspect);
    trailParticleMat = createTrailParticleMaterial(terrainAspect);
    fadeMat = createFadeMaterial();
    fadeQuad.material = fadeMat;

    // Trail Particles (Need to be recreated if count changes)
    if (trailParticles) {
        trailScene.remove(trailParticles);
        trailParticles.geometry.dispose();
    }
    trailParticles = new THREE.Points(new THREE.PlaneGeometry(1, 1, texSize - 1, texSize - 1), trailParticleMat);
    trailParticles.frustumCulled = false;
    trailScene.add(trailParticles);

    // Main Particles
    const particles = new THREE.Points(new THREE.PlaneGeometry(1, 1, texSize - 1, texSize - 1), renderMat);
    particles.frustumCulled = false;
    particles.name = "Particles";
    scene.add(particles);

    // Update terrain mat with trail texture support (if not already set correctly)
    if (terrainMat) {
        terrainMat.uniforms.tTrail.value = rtTrailNext.texture;
        // Make sure it has dom texture in case it was re-created
        if (domTexture) {
            terrainMat.uniforms.tDom.value = domTexture;
            terrainMat.uniforms.uShowTexture.value = params.showTexture ? 1.0 : 0.0;
            terrainMat.wireframe = !params.showTexture;
        }
    }

    animate();
};

const initGUI = (heightTexture, width, height, terrainAspect, domTexture) => {
    if (gui) gui.destroy();
    gui = new GUI();

    gui.domElement.style.position = 'absolute';
    gui.domElement.style.top = '2px';
    gui.domElement.style.right = '2px';
    container.value.appendChild(gui.domElement);

    gui.add(params, 'range', 0.01, 5.0).name('发射范围').onChange(v => {
        if (posShader) posShader.uniforms.uRange.value = v;
    });

    gui.add(params, 'particleCount', 2, 1024, 1).name('粒子数量(Sqrt)').onFinishChange(v => {
        initSimulation(heightTexture, width, height, terrainAspect, domTexture, parseInt(v));
    });

    gui.add(params, 'keepTrail').name('显示痕迹');

    gui.add(params, 'showTexture').name('显示DOM贴图').onChange(v => {
        if (terrainMat) {
            if (terrainMat.uniforms) {
                terrainMat.uniforms.uShowTexture.value = v ? 1.0 : 0.0;
            }
            terrainMat.wireframe = !v;
            terrainMat.needsUpdate = true;
        }
    });
};

const onMouseDown = (e) => {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Raycast against Terrain
    const terrain = scene.getObjectByName("Terrain");
    if (terrain) {
        const intersects = raycaster.intersectObject(terrain);
        if (intersects.length > 0) {
            lastIntersect.copy(intersects[0].point);
            spawnRequest = true;
        }
    }
};

const animate = () => {
    animationId = requestAnimationFrame(animate);

    if (!posShader || !renderMat || !velShader) return;

    const dt = clock.getDelta();
    const time = clock.elapsedTime;
    const delta = Math.min(dt, 0.1);

    // --- 1. Update Velocity ---
    simQuad.material = velShader;
    velShader.uniforms.tPos.value = rtPosCurr.texture;
    velShader.uniforms.tVel.value = rtVelCurr.texture; // Fix: was rtVelCurr.texture in test.js? Yes.
    // In test.js: velShader.uniforms.tVel.value = rtVelCurr.texture;
    velShader.uniforms.uSpawn.value = spawnRequest;
    velShader.uniforms.uTime.value = time;
    velShader.uniforms.uDelta.value = delta;

    renderer.setRenderTarget(rtVelNext);
    renderer.render(simScene, simCamera);

    // --- 2. Trail Logic ---
    if (!params.keepTrail || spawnRequest) {
        // Clear trails if disabled or spawning
        renderer.setRenderTarget(rtTrailCurr);
        renderer.clear();
        renderer.setRenderTarget(rtTrailNext);
        renderer.clear();
    } else {
        // (1) Fade old trails
        fadeQuad.visible = true;
        trailParticles.visible = false;
        fadeMat.uniforms.tTrail.value = rtTrailNext.texture;
        fadeMat.uniforms.uFade.value = 1.0;

        renderer.setRenderTarget(rtTrailCurr);
        renderer.render(trailScene, trailCamera);

        // (2) Draw new particles
        trailParticleMat.uniforms.tPos.value = rtPosCurr.texture;
        fadeQuad.visible = false;
        trailParticles.visible = true;

        renderer.autoClear = false;
        renderer.render(trailScene, trailCamera);
        renderer.autoClear = true;
    }

    // Swap Trail
    let tempTrail = rtTrailCurr;
    rtTrailCurr = rtTrailNext;
    rtTrailNext = tempTrail;

    // Validate terrain mat uniform
    if (terrainMat && terrainMat.uniforms.tTrail.value !== rtTrailNext.texture) {
        terrainMat.uniforms.tTrail.value = rtTrailNext.texture;
    }

    // --- 3. Update Position ---
    simQuad.material = posShader;
    posShader.uniforms.tPos.value = rtPosCurr.texture;
    posShader.uniforms.tVel.value = rtVelNext.texture;
    posShader.uniforms.uMousePos.value.copy(lastIntersect);
    posShader.uniforms.uSpawn.value = spawnRequest;
    posShader.uniforms.uTime.value = time;
    posShader.uniforms.uDelta.value = delta;

    renderer.setRenderTarget(rtPosNext);
    renderer.render(simScene, simCamera);
    renderer.setRenderTarget(null);

    // Reset spawn
    spawnRequest = false;

    // Swap Sim Buffers
    let temp = rtPosCurr;
    rtPosCurr = rtPosNext;
    rtPosNext = temp;

    temp = rtVelCurr;
    rtVelCurr = rtVelNext;
    rtVelNext = temp;

    // --- 4. Render ---
    renderMat.uniforms.tPos.value = rtPosCurr.texture;
    controls.update();
    renderer.render(scene, camera);
};

const onResize = () => {
    if (renderer && camera && container.value) {
        camera.aspect = container.value.clientWidth / container.value.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.value.clientWidth, container.value.clientHeight);
    }
};

onMounted(() => {
    initScene();
    loadTerrain();
    window.addEventListener('resize', onResize);
    // Move mousedown to canvas or container to avoid global interference, but window is fine for now
    window.addEventListener('mousedown', onMouseDown);
    onResize();
});

onUnmounted(() => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousedown', onMouseDown);
    cancelAnimationFrame(animationId);
    if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement = null;
    }
    if (gui) gui.destroy();
    // Dispose other resources...
});
</script>

<style scoped>
.three-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background-color: #050a10;
    user-select: none;
}

.page-info {
    position: absolute;
    top: 20px;
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

.info-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
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
    line-height: 1.8;
    padding-left: 8px;
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
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}
</style>
