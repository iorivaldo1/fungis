<template>
  <div class="blog-container">
    <div ref="canvasContainer" class="canvas-container"></div>

    <button class="mobile-toggle" aria-label="菜单" @click="isSidebarOpen = !isSidebarOpen">☰</button>

    <nav class="blog-sidebar" :class="{ open: isSidebarOpen }">
      <div ref="sidebarCanvasContainer" class="sidebar-canvas-container"></div>
      <div class="sidebar-header">
        <div class="sidebar-logo"><span>📖</span> GLSL 学习笔记</div>
        <div class="sidebar-title">The Book of Shaders</div>
      </div>
      <ul class="nav-list">
        <li class="nav-item"><a class="nav-link active" href="#"><span class="nav-number">⌂</span> 首页</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/01-shaping.html"><span class="nav-number">01</span> 造型函数</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/02-colors.html"><span class="nav-number">02</span> 颜色</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/03-shapes.html"><span class="nav-number">03</span> 形状</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/04-matrices.html"><span class="nav-number">04</span> 二维矩阵</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/05-patterns.html"><span class="nav-number">05</span> 图案</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/06-random.html"><span class="nav-number">06</span> 随机</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/07-noise.html"><span class="nav-number">07</span> 噪声</a></li>
        <li class="nav-item"><a class="nav-link" href="blog/08-cellular.html"><span class="nav-number">08</span> 网格噪声</a></li>
      </ul>
      <div class="sidebar-footer">
        <a href="https://thebookofshaders.com/?lan=ch" target="_blank">📚 原始教程</a>
      </div>
    </nav>

    <div class="main-content">
      <div class="hero">
        <h1>GLSL Shader 学习笔记</h1>
        <p class="desc">
          基于 <strong>The Book of Shaders</strong> 的交互式学习记录。<br>
          每一章包含可运行的 WebGL shader 演示和关键源码解析。<br>
          点击下方卡片开始探索。
        </p>
      </div>

      <div class="chapters-grid">
        <a class="chapter-card" href="blog/01-shaping.html" style="--card-color: #6366f1;">
          <div class="card-num">Chapter 01</div>
          <h3>造型函数</h3>
          <p class="card-desc">step、smoothstep、pow、exp — 用数学函数绘制曲线与控制渐变</p>
          <span class="card-arrow">→</span>
        </a>
        <a class="chapter-card" href="blog/02-colors.html" style="--card-color: #ec4899;">
          <div class="card-num">Chapter 02</div>
          <h3>颜色</h3>
          <p class="card-desc">RGB 混合、HSB 色彩空间转换、极坐标色相环</p>
          <span class="card-arrow">→</span>
        </a>
        <a class="chapter-card" href="blog/03-shapes.html" style="--card-color: #14b8a6;">
          <div class="card-num">Chapter 03</div>
          <h3>形状</h3>
          <p class="card-desc">距离场 SDF、矩形、圆、多边形、布尔运算</p>
          <span class="card-arrow">→</span>
        </a>
        <a class="chapter-card" href="blog/04-matrices.html" style="--card-color: #f97316;">
          <div class="card-num">Chapter 04</div>
          <h3>二维矩阵</h3>
          <p class="card-desc">平移、旋转、缩放 — UV 坐标变换与动画</p>
          <span class="card-arrow">→</span>
        </a>
        <a class="chapter-card" href="blog/05-patterns.html" style="--card-color: #8b5cf6;">
          <div class="card-num">Chapter 05</div>
          <h3>图案</h3>
          <p class="card-desc">fract 网格分割、砖墙偏移、嵌套旋转、Truchet 瓷砖</p>
          <span class="card-arrow">→</span>
        </a>
        <a class="chapter-card" href="blog/06-random.html" style="--card-color: #06b6d4;">
          <div class="card-num">Chapter 06</div>
          <h3>随机</h3>
          <p class="card-desc">伪随机函数、噪点、迷宫生成、矩阵雨</p>
          <span class="card-arrow">→</span>
        </a>
        <a class="chapter-card" href="blog/07-noise.html" style="--card-color: #22c55e;">
          <div class="card-num">Chapter 07</div>
          <h3>噪声</h3>
          <p class="card-desc">值噪声、梯度噪声、FBM 分形、域扭曲</p>
          <span class="card-arrow">→</span>
        </a>
        <a class="chapter-card" href="blog/08-cellular.html" style="--card-color: #eab308;">
          <div class="card-num">Chapter 08</div>
          <h3>网格噪声</h3>
          <p class="card-desc">Voronoi、Worley 噪声、细胞边缘、Metaball 融合</p>
          <span class="card-arrow">→</span>
        </a>
      </div>

      <div class="footer">
        <a href="https://beian.miit.gov.cn/" target="_blank">蜀ICP备2026003524号-3</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';

const canvasContainer = ref(null);
const sidebarCanvasContainer = ref(null);
const isSidebarOpen = ref(false);

let animationId;
let renderer, sidebarRenderer;
let scene, camera, material;
let sidebarScene, sidebarCamera, sidebarMaterial;

const cloudVS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFS1 = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform vec2 u_mouse;
  uniform float u_time;
  uniform vec2 u_resolution;

  const float cloudscale = 1.1;
  const float speed = 0.01;
  const float clouddark = 0.5;
  const float cloudlight = 0.3;
  const float cloudcover = 0.2;
  const float cloudalpha = 8.0;
  const float skytint = 0.5;
  const vec3 skycolour1 = vec3(0.2, 0.4, 0.6);
  const vec3 skycolour2 = vec3(0.4, 0.7, 1.0);

  const mat2 m = mat2( 1.6,  1.2, -1.2,  1.6 );

  vec2 hash( vec2 p ) {
    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
  }

  float noise( in vec2 p ) {
    const float K1 = 0.366025404; // (sqrt(3)-1)/2;
    const float K2 = 0.211324865; // (3-sqrt(3))/6;
    vec2 i = floor(p + (p.x+p.y)*K1);
    vec2 a = p - i + (i.x+i.y)*K2;
    vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0*K2;
    vec3 h = max(0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
    vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
    return dot(n, vec3(70.0));
  }

  float fbm(vec2 n) {
    float total = 0.0, amplitude = 0.1;
    for (int i = 0; i < 7; i++) {
      total += noise(n) * amplitude;
      n = m * n;
      amplitude *= 0.4;
    }
    return total;
  }

  void main() {
    vec2 p = vUv;
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv_base = p * aspect;

    float time = u_time * speed;
    float q = fbm(uv_base * cloudscale * 0.5);

    // ridged noise shape
    float r = 0.0;
    vec2 uv = uv_base * cloudscale;
    uv -= q - time;
    float weight = 0.8;
    for (int i=0; i<8; i++){
      r += abs(weight*noise( uv ));
      uv = m*uv + time;
      weight *= 0.7;
    }

    // noise shape
    float f = 0.0;
    uv = uv_base * cloudscale;
    uv -= q - time;
    weight = 0.7;
    for (int i=0; i<8; i++){
      f += weight*noise( uv );
      uv = m*uv + time;
      weight *= 0.6;
    }

    f *= r + f;

    // noise colour
    float c = 0.0;
    time = u_time * speed * 2.0;
    uv = uv_base * cloudscale*2.0;
    uv -= q - time;
    weight = 0.4;
    for (int i=0; i<7; i++){
      c += weight*noise( uv );
      uv = m*uv + time;
      weight *= 0.6;
    }

    // noise ridge colour
    float c1 = 0.0;
    time = u_time * speed * 3.0;
    uv = uv_base * cloudscale*3.0;
    uv -= q - time;
    weight = 0.4;
    for (int i=0; i<7; i++){
      c1 += abs(weight*noise( uv ));
      uv = m*uv + time;
      weight *= 0.6;
    }

    c += c1;

    vec3 skycolour = mix(skycolour2, skycolour1, p.y);
    vec3 cloudcolour = vec3(1.1, 1.1, 0.9) * clamp((clouddark + cloudlight*c), 0.0, 1.0);

    f = cloudcover + cloudalpha*f*r;

    vec3 result = mix(skycolour, clamp(skytint * skycolour + cloudcolour, 0.0, 1.0), clamp(f + c, 0.0, 1.0));

    gl_FragColor = vec4( result, 1.0 );
  }
`;

const matrixFS = `
    varying vec2 vUv;
    uniform float u_time;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
        // 网格设置：30列 x 40行
        vec2 st = vUv;
        st.x *= 30.0;
        st.y *= 40.0;

        vec2 ipos = floor(st);
        vec2 fpos = fract(st);
        float col = ipos.x;

        // --- 字符边距 (字符之间留空隙) ---
        float charMask = step(0.15, fpos.x) * step(fpos.x, 0.85)
                       * step(0.1, fpos.y) * step(fpos.y, 0.9);

        // --- 字符像素点阵 (3x4 grid 模拟字符笔画) ---
        vec2 pxGrid = floor(fpos * vec2(3.0, 4.0));
        float pxRnd = random(ipos * 7.13 + pxGrid * 3.71 + floor(u_time * 2.0));
        float charPixel = step(0.3, pxRnd) * charMask;

        // === 雨流 1 ===
        float offset1 = random(vec2(col, 1.0));
        float speed1 = 0.15 + offset1 * 0.25;
        float phase1 = fract(ipos.y / 40.0 + u_time * speed1 + offset1 * 6.0);
        float tail1 = pow(1.0 - phase1, 3.0);
        float head1 = smoothstep(0.06, 0.0, phase1);

        // === 雨流 2 (不同速度和偏移) ===
        float offset2 = random(vec2(col, 23.0));
        float speed2 = 0.1 + offset2 * 0.3;
        float phase2 = fract(ipos.y / 40.0 + u_time * speed2 + offset2 * 9.0);
        float tail2 = pow(1.0 - phase2, 3.0);
        float head2 = smoothstep(0.06, 0.0, phase2);

        // 合并两条流
        float tail = clamp(tail1 + tail2 * 0.7, 0.0, 1.0);
        float head = clamp(head1 + head2, 0.0, 1.0);

        // --- 列级亮度差异 (深度感) ---
        float colBright = 0.5 + 0.5 * random(vec2(col * 0.37, 7.7));

        // --- 字符闪烁 ---
        float flicker = 0.7 + 0.3 * random(ipos + floor(u_time * 5.0));

        // --- 最终颜色 ---
        vec3 green = vec3(0.0, 1.0, 0.3);
        vec3 finalColor = green * tail * charPixel * colBright * flicker;

        // 头部白色高光
        finalColor += vec3(0.8, 1.0, 0.85) * head * charPixel * flicker;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const handleResize = () => {
  if (!canvasContainer.value || !sidebarCanvasContainer.value) return;
  
  let width = canvasContainer.value.clientWidth || window.innerWidth;
  let height = canvasContainer.value.clientHeight || window.innerHeight;
  if(renderer && material) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    material.uniforms.u_resolution.value.set(width, height);
  }

  let sidebarWidth = sidebarCanvasContainer.value.clientWidth || 260;
  let sidebarHeight = sidebarCanvasContainer.value.clientHeight || window.innerHeight;
  if(sidebarRenderer && sidebarMaterial) {
    sidebarRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    sidebarRenderer.setSize(sidebarWidth, sidebarHeight, false);
    sidebarMaterial.uniforms.u_resolution.value.set(sidebarWidth, sidebarHeight);
  }
};

onMounted(() => {
  if (!canvasContainer.value || !sidebarCanvasContainer.value) return;

  let width = canvasContainer.value.clientWidth || window.innerWidth;
  let height = canvasContainer.value.clientHeight || window.innerHeight;

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  camera.position.z = 1;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  canvasContainer.value.appendChild(renderer.domElement);

  const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(width, height) },
      u_mouse: { value: new THREE.Vector2(0, 0) }
  };

  material = new THREE.ShaderMaterial({
      vertexShader: cloudVS,
      fragmentShader: cloudFS1,
      uniforms: uniforms
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  let sidebarWidth = sidebarCanvasContainer.value.clientWidth || 260;
  let sidebarHeight = sidebarCanvasContainer.value.clientHeight || window.innerHeight;

  sidebarScene = new THREE.Scene();
  sidebarCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  sidebarCamera.position.z = 1;

  sidebarRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  sidebarRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  sidebarRenderer.setSize(sidebarWidth, sidebarHeight, false);
  sidebarCanvasContainer.value.appendChild(sidebarRenderer.domElement);

  const sidebarUniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(sidebarWidth, sidebarHeight) }
  };

  sidebarMaterial = new THREE.ShaderMaterial({
      vertexShader: cloudVS,
      fragmentShader: matrixFS,
      uniforms: sidebarUniforms
  });

  const sidebarMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sidebarMaterial);
  sidebarScene.add(sidebarMesh);

  const clock = new THREE.Clock();

  function animate() {
      animationId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      material.uniforms.u_time.value = t;
      renderer.render(scene, camera);

      sidebarMaterial.uniforms.u_time.value = t;
      sidebarRenderer.render(sidebarScene, sidebarCamera);
  }
  animate();

  window.addEventListener('resize', handleResize);
  setTimeout(handleResize, 100); 
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  if (renderer) {
    renderer.dispose();
  }
  if (sidebarRenderer) {
    sidebarRenderer.dispose();
  }
  if (material) {
    material.dispose();
  }
  if (sidebarMaterial) {
    sidebarMaterial.dispose();
  }
});
</script>

<style scoped>
.blog-container {
  color: #fff;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  display: flex;
  background-color: #011936;
}

.canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  background-color: #011936;
  pointer-events: none;
  overflow: hidden;
}

.canvas-container :deep(canvas),
.sidebar-canvas-container :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}

/* ---- Sidebar ---- */
.blog-sidebar {
  position: relative;
  flex-shrink: 0;
  width: 260px;
  min-width: 260px;
  max-width: 260px;
  height: 100%;
  box-sizing: border-box;
  background: rgba(10, 14, 26, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid rgba(99, 132, 255, 0.15);
  padding: 24px 0;
  overflow-y: auto;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.sidebar-canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  opacity: 0.6;
  pointer-events: none;
  overflow: hidden;
}

.sidebar-header {
  padding: 0 20px 20px;
  border-bottom: 1px solid rgba(99, 132, 255, 0.15);
  margin-bottom: 12px;
  flex-shrink: 0;
}

.sidebar-logo {
  font-size: 14px;
  font-weight: 600;
  color: #818cf8;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  background: rgba(10, 14, 26, 0.65);
  padding: 6px 10px;
  border-radius: 6px;
  white-space: nowrap;
}

.sidebar-title {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 6px;
  font-weight: 400;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  padding-left: 10px;
  white-space: nowrap;
}

.nav-list {
  list-style: none;
  padding: 0 12px;
  flex: 1;
}

.nav-item {
  margin-bottom: 6px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #d1d5db;
  background: rgba(10, 14, 26, 0.7);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.nav-link:hover {
  background: rgba(99, 102, 241, 0.4);
  color: #ffffff;
}

.nav-link.active {
  background: rgba(99, 102, 241, 0.5);
  color: #ffffff;
  font-weight: 600;
}

.nav-number {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  min-width: 22px;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(99, 132, 255, 0.15);
  margin-top: auto;
  flex-shrink: 0;
}

.sidebar-footer a {
  font-size: 12px;
  color: #6b7280;
  text-decoration: none;
}

.sidebar-footer a:hover {
  color: #818cf8;
}

/* ---- Mobile Toggle ---- */
.mobile-toggle {
  display: none;
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 200;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(99, 132, 255, 0.15);
  border-radius: 8px;
  background: rgba(10, 14, 26, 0.88);
  backdrop-filter: blur(10px);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
}

/* ---- Main Content ---- */
.main-content {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 40px 40px 30px;
  z-index: 1;
  position: relative;
}

.hero {
  text-align: center;
  margin-bottom: 40px;
  background: rgba(17, 24, 39, 0.75);
  border: 1px solid rgba(99, 132, 255, 0.15);
  border-radius: 16px;
  padding: 36px 32px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 900px;
  width: 100%;
}

.hero h1 {
  font-size: 36px;
  font-weight: 700;
  background: linear-gradient(135deg, #e0e7ff, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
  text-shadow: none;
}

.hero .desc {
  font-size: 15px;
  color: #c9d1d9;
  line-height: 1.8;
  max-width: 560px;
  margin: 0 auto;
}

/* ---- Chapter Cards Grid ---- */
.chapters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
  max-width: 900px;
  width: 100%;
  margin-bottom: 40px;
}

.chapter-card {
  background: rgba(17, 24, 39, 0.75);
  border: 1px solid rgba(99, 132, 255, 0.15);
  border-radius: 12px;
  padding: 24px;
  text-decoration: none;
  color: #e5e7eb;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chapter-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--card-color, #6366f1), transparent);
  opacity: 0.6;
}

.chapter-card:hover {
  border-color: rgba(99, 132, 255, 0.35);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.12);
  transform: translateY(-2px);
}

.chapter-card .card-num {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.chapter-card h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.chapter-card .card-desc {
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.6;
}

.chapter-card .card-arrow {
  position: absolute;
  bottom: 20px;
  right: 20px;
  font-size: 18px;
  color: #6b7280;
  transition: color 0.3s, transform 0.3s;
}

.chapter-card:hover .card-arrow {
  color: #818cf8;
  transform: translateX(4px);
}

/* ---- Footer ---- */
.footer {
  padding: 20px 0 10px;
  text-align: center;
  z-index: 10;
  width: 100%;
  margin-top: auto;
  flex-shrink: 0;
}

.footer a {
  display: inline-block;
  color: #9ca3af;
  text-decoration: none;
  font-size: 13px;
  background: rgba(17, 24, 39, 0.75);
  border: 1px solid rgba(99, 132, 255, 0.15);
  padding: 8px 16px;
  border-radius: 20px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.footer a:hover {
  color: #ffffff;
  background: rgba(99, 102, 241, 0.4);
  border-color: rgba(99, 132, 255, 0.35);
}

/* ---- Responsive ---- */
@media (max-width: 768px) {
  .mobile-toggle {
    display: flex;
  }

  .blog-sidebar {
    position: fixed;
    transform: translateX(-100%);
  }

  .blog-sidebar.open {
    transform: translateX(0);
  }

  .main-content {
    margin-left: 0;
    width: 100%;
    padding: 72px 20px 30px;
  }

  .hero h1 {
    font-size: 26px;
  }

  .chapters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
