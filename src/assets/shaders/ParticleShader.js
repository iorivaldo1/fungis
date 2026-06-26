import * as THREE from 'three';

// 将 shader 定义改为工厂函数
export function createVelShader(heightTexture, terrainAspect, texelSize) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tPos: { value: null },
            tVel: { value: null },
            tHeight: { value: heightTexture },
            uTime: { value: 0 },
            uDelta: { value: 0.016 },
            uSpawn: { value: false },
            uAspect: { value: terrainAspect },
            uGravity: { value: 4.8 },      // 重力加速度
            uFriction: { value: 0.02 },    // 摩擦系数
            uTexelSize: { value: texelSize }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
        fragmentShader: `
            uniform sampler2D tPos;
            uniform sampler2D tVel;
            uniform sampler2D tHeight;
            uniform float uDelta;
            uniform bool uSpawn;
            uniform float uTime;
            uniform float uAspect;
            uniform float uGravity;   // 重力加速度 g
            uniform float uFriction;  // 摩擦系数
            uniform vec2 uTexelSize;
            varying vec2 vUv;

            float rand(vec2 co){
                return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
            }

            void main() {
                vec3 pos = texture2D(tPos, vUv).xyz;
                vec3 vel = texture2D(tVel, vUv).xyz;
                
                // 检查当前粒子是否有效（未隐藏）
                if (pos.x > 50.0) {
                    gl_FragColor = vec4(vel, 1.0);
                    return;
                }
                
                if (uSpawn) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                // ========== 牛顿地表重力模型 ==========
                // 1. 计算地形法线 (通过高度差计算梯度)
                // 使用与参考一致的UV计算方式
                vec2 hUv = clamp(vec2(pos.x / 10.0 + 0.5, pos.z / (10.0 * uAspect) + 0.5), 0.01, 0.99);
                
                // 使用基于纹理分辨率的步长采样
                float hC = texture2D(tHeight, hUv).r * 2.0;                    // 中心高度
                float hR = texture2D(tHeight, clamp(hUv + vec2(uTexelSize.x, 0.0), 0.01, 0.99)).r * 2.0;     // 右侧高度  
                float hL = texture2D(tHeight, clamp(hUv - vec2(uTexelSize.x, 0.0), 0.01, 0.99)).r * 2.0;     // 左侧高度
                float hT = texture2D(tHeight, clamp(hUv + vec2(0.0, uTexelSize.y), 0.01, 0.99)).r * 2.0;     // 上方高度
                float hB = texture2D(tHeight, clamp(hUv - vec2(0.0, uTexelSize.y), 0.01, 0.99)).r * 2.0;     // 下方高度
                
                // 2. 计算地形梯度 (dh/dx, dh/dz)
                float gradX = (hR - hL) / (2.0 * uTexelSize.x * 10.0);  // X方向斜率
                float gradZ = (hT - hB) / (2.0 * uTexelSize.y * 10.0);  // Z方向斜率
                
                // 3. 构建表面法线 N = (-dh/dx, 1, -dh/dz) 并归一化
                vec3 normal = normalize(vec3(-gradX, 1.0, -gradZ));
                
                // 4. 重力向量 (垂直向下)
                vec3 gravity = vec3(0.0, -uGravity, 0.0);
                
                // 5. 将重力分解：沿法线方向的分量被地面支撑，沿斜面方向的分量使粒子滑动
                // F_滑动 = F_重力 - (F_重力·N)·N
                float gravityNormal = dot(gravity, normal);
                vec3 gravitySlope = gravity - gravityNormal * normal;
                
                // 6. 更新速度 (只在 XZ 平面运动，Y 由地形决定)
                vel.x += gravitySlope.x * uDelta;
                vel.z += gravitySlope.z * uDelta;
                vel.y = 0.0;  // Y 速度由地形高度直接决定，不参与积分
                
                // 7. 应用摩擦力
                vel *= (1.0 - uFriction);

                gl_FragColor = vec4(vel, 1.0);
            }
        `
    });
}

// 模拟着色器 - 位置 (只更新XZ平面，Y由渲染时地形决定)
export function createPosShader(terrainAspect) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tPos: { value: null },
            tVel: { value: null },
            uDelta: { value: 0.016 },
            uMousePos: { value: new THREE.Vector3(999, 0, 0) },
            uSpawn: { value: false },
            uTime: { value: 0 },
            uAspect: { value: terrainAspect },
            uRange: { value: 1.45 }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
        fragmentShader: `
            uniform sampler2D tPos;
            uniform sampler2D tVel;
            uniform float uDelta;
            uniform vec3 uMousePos;
            uniform bool uSpawn;
            uniform float uTime;
            uniform float uAspect;
            uniform float uRange;
            varying vec2 vUv;

            float rand(vec2 co){
                return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
            }

            void main() {
                vec3 pos = texture2D(tPos, vUv).xyz;
                vec3 vel = texture2D(tVel, vUv).xyz;
                
                // range uniform used directly

                if (uSpawn) {
                    // 粒子在鼠标位置附近的XZ平面内随机生成
                    float r1 = rand(vUv + uTime) * 2.0 - 1.0;
                    float r2 = rand(vUv.yx + uTime) * 2.0 - 1.0;
                    pos = uMousePos + vec3(r1 * uRange, 0.0, r2 * uRange);
                } else if (pos.x < 50.0) {
                    // 基于上一帧的速度在XZ平面移动
                    pos.x += vel.x * uDelta;
                    pos.z += vel.z * uDelta;
                }

                // 边界检测
                if (abs(pos.x) > 5.0 || abs(pos.z) > (5.0 * uAspect)) {
                    pos.x = 999.0;
                }

                gl_FragColor = vec4(pos, 1.0);
            }
        `
    });
}

// --- 3. 渲染部分 ---
export function createRenderMat(heightTexture, terrainAspect) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tPos: { value: null },
            tHeight: { value: heightTexture },
            uAspect: { value: terrainAspect }
        },
        vertexShader: `
            uniform sampler2D tPos;
            uniform sampler2D tHeight;
            uniform float uAspect;
            varying float vH;
            void main() {
                vec3 pos = texture2D(tPos, uv).xyz;
                vec2 hUv = vec2(pos.x / 10.0 + 0.5, pos.z / (10.0 * uAspect) + 0.5);
                float h = texture2D(tHeight, hUv).r * 2.0;
                vH = h;
                
                vec4 mvPosition = modelViewMatrix * vec4(pos.x, h +0.01, pos.z, 1.0);
                gl_PointSize = 4.0;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vH;
            void main() {
                // if (gl_FragCoord.z > 0.99) discard;
                gl_FragColor = vec4(1.0, 1.0 - vH, 0.0, 1.0);
            }
        `,
        transparent: true
    });
}

// 1. 轨迹粒子材质：将粒子渲染为白色点到 RenderTarget
export function createTrailParticleMaterial(terrainAspect) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tPos: { value: null },
            uAspect: { value: terrainAspect }
        },
        vertexShader: `
            uniform sampler2D tPos;
            uniform float uAspect;
            void main() {
                vec3 pos = texture2D(tPos, uv).xyz;
                
                // 将世界坐标 (x: -5~5, z: -5*asp ~ 5*asp) 映射到 UV (0~1)
                // pos.x / 10.0 + 0.5  =>  (-5/10 + 0.5 = 0, 5/10 + 0.5 = 1)
                float u = pos.x / 10.0 + 0.5;
                float v = 1.0 - (pos.z / (10.0 * uAspect) + 0.5); // Flip V to match terrain UV
                
                gl_Position = vec4(u * 2.0 - 1.0, v * 2.0 - 1.0, 0.0, 1.0);
                gl_PointSize = 2.0; 
            }
        `,
        fragmentShader: `
            void main() {
                gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
    });
}

// 2. 衰减材质：读取上一帧轨迹并应用衰减
export function createFadeMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            tTrail: { value: null },
            uFade: { value: 0.96 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tTrail;
            uniform float uFade;
            varying vec2 vUv;
            void main() {
                vec4 color = texture2D(tTrail, vUv);
                gl_FragColor = color * uFade;
            }
        `,
        depthTest: false,
        depthWrite: false
    });
}

// 3. 地形网格材质：根据轨迹图混合颜色
export function createTerrainWireframeMaterial(heightTexture, terrainAspect, domTexture) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tHeight: { value: heightTexture },
            tTrail: { value: null }, // 轨迹图
            tDom: { value: domTexture }, // DOM纹理
            uAspect: { value: terrainAspect },
            uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.5) },
            uAmbient: { value: 0.4 },
            uDiffuse: { value: 0.6 },
            uShowTexture: { value: 1.0 }, // 1.0显示贴图，0.0显示wireframe
            uWireframeColor: { value: new THREE.Color(0x2cc9d5) }
        },
        vertexShader: `
            uniform sampler2D tHeight;
            uniform float uAspect;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying float vH;
            
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vH = position.z; 
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tTrail;
            uniform sampler2D tDom;
            uniform vec3 uLightDir;
            uniform float uAmbient;
            uniform float uDiffuse;
            uniform float uShowTexture;
            uniform vec3 uWireframeColor;
            
            varying vec2 vUv;
            varying vec3 vNormal;
            varying float vH;
            
            void main() {
                // 翻转UV的Y坐标以匹配纹理方向
                vec2 flippedUV = vec2(vUv.x, 1.0 - vUv.y);
                
                // 读取轨迹强度
                float trail = texture2D(tTrail, vUv).r;
                
                vec3 finalColor;
                
                if (uShowTexture > 0.5) {
                    // DOM贴图模式
                    // 读取DOM纹理
                    vec4 domColor = texture2D(tDom, flippedUV);
                    
                    // 基础颜色为DOM纹理
                    vec3 baseColor = domColor.rgb;
                    
                    // 如果有痕迹，显示为白色
                    finalColor = mix(baseColor, vec3(1.0, 1.0, 1.0), trail);
                    
                    // 简单光照计算
                    vec3 lightDir = normalize(uLightDir);
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 color = finalColor * (uAmbient + uDiffuse * diff);
                    
                    gl_FragColor = vec4(color, 1.0);
                } else {
                    // Wireframe模式 - 透明底色，痕迹显示为白色
                    finalColor = mix(uWireframeColor, vec3(1.0, 1.0, 1.0), trail);
                    float alpha = 0.3 + trail * 0.7;
                    gl_FragColor = vec4(finalColor, alpha);
                }
            }
        `,
        side: THREE.DoubleSide,
        transparent: true
    });
}
