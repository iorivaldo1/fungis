<template>
  <div ref="containerRef" class="background-spheres"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'

const containerRef = ref(null)
let scene, camera, renderer, material, mesh, animationId

const cloudVS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

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
`

const onWindowResize = () => {
  if (!camera || !renderer) return
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  material?.uniforms.u_resolution.value.set(width, height)
}

onMounted(() => {
  if (!containerRef.value) return
  const width = window.innerWidth
  const height = window.innerHeight

  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  camera.position.z = 1

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  containerRef.value.appendChild(renderer.domElement)

  const uniforms = {
    u_time: { value: 0 },
    u_resolution: { value: new THREE.Vector2(width, height) },
    u_mouse: { value: new THREE.Vector2(0, 0) }
  }

  material = new THREE.ShaderMaterial({
    vertexShader: cloudVS,
    fragmentShader: cloudFS1,
    uniforms
  })

  mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  scene.add(mesh)

  const clock = new THREE.Clock()
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    material.uniforms.u_time.value = clock.getElapsedTime()
    renderer.render(scene, camera)
  }
  animate()

  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  cancelAnimationFrame(animationId)

  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss()
  }

  if (mesh) {
    mesh.geometry.dispose()
  }
  if (material) {
    material.dispose()
  }
})
</script>

<style scoped>
.background-spheres {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  background-color: #011936;
  pointer-events: none;
  overflow: hidden;
}
</style>
