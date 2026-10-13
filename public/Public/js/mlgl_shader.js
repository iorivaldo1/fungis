// ==================== Shader 1 (保留备用) ====================
const vs1 = `#version 300 es
    in vec2 a_pos;
    in float a_progress;
    in float a_side;

    uniform mat4 u_matrix;
    out vec2 v_uv;

    void main() {
        v_uv = vec2(a_progress * 18.0, a_side);
        gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
    }
`;

const fs1 = `#version 300 es
    precision highp float;

    in vec2 v_uv;
    uniform float u_time;
    out vec4 fragColor;

    #define S(a, b, t) smoothstep(a, b, t)
    #define NUM_LAYERS 2.0

    float N21(vec2 p) {
        vec3 a = fract(vec3(p.xyx) * vec3(213.897, 653.453, 253.098));
        a += dot(a, a.yzx + 79.76);
        return fract((a.x + a.y) * a.z);
    }

    vec2 GetPos(vec2 id, vec2 offs, float t) {
        float n = N21(id + offs);
        float n1 = fract(n * 10.0);
        float n2 = fract(n * 100.0);
        float a = t + n;
        return offs + vec2(sin(a * n1), cos(a * n2)) * 0.4;
    }

    float df_line(in vec2 a, in vec2 b, in vec2 p) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
    }

    float line(vec2 a, vec2 b, vec2 uv) {
        float r1 = 0.04;
        float r2 = 0.01;
        float d = df_line(a, b, uv);
        float d2 = length(a - b);
        float fade = S(1.5, 0.5, d2);
        fade += S(0.05, 0.02, abs(d2 - 0.75));
        return S(r1, r2, d) * fade;
    }

    float NetLayer(vec2 st, float n, float t) {
        vec2 id = floor(st) + n;
        st = fract(st) - 0.5;

        vec2 p[9];
        int i = 0;
        for (float y = -1.0; y <= 1.0; y++) {
            for (float x = -1.0; x <= 1.0; x++) {
                p[i++] = GetPos(id, vec2(x, y), t);
            }
        }

        float m = 0.0;
        float sparkle = 0.0;

        for (int j = 0; j < 9; j++) {
            m += line(p[4], p[j], st);

            float d = length(st - p[j]);
            float s = (0.006 / (d * d + 0.001));
            s *= S(1.0, 0.7, d);

            float pulse = sin((fract(p[j].x) + fract(p[j].y) + t) * 5.0) * 0.4 + 0.6;
            pulse = pow(pulse, 16.0);
            s *= pulse;
            sparkle += s;
        }

        m += line(p[1], p[3], st);
        m += line(p[1], p[5], st);
        m += line(p[7], p[5], st);
        m += line(p[7], p[3], st);

        float sPhase = (sin(t + n) + sin(t * 0.1)) * 0.25 + 0.5;
        m += sparkle * sPhase;

        return m;
    }

    void main() {
        vec2 uv = v_uv;
        float t = u_time * 0.001;
        uv.x -= t * 1.6;

        float m = 0.0;

        for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYERS) {
            float z = fract(t * 0.2 + i);
            float size = mix(3.2, 1.2, z);
            float fade = S(0.0, 0.3, z) * S(1.0, 0.7, z);
            m += fade * NetLayer(uv * size, i, u_time);
        }

        vec3 baseCol = vec3(sin(t * 0.5), cos(t * 0.4), -sin(t * 0.24)) * 0.4 + 0.6;
        vec3 col = baseCol * m;
        col += vec3(0.85, 0.95, 1.0) * pow(m * 0.5, 2.0);

        float edgeFade = 1.0 - smoothstep(0.45, 1.0, abs(v_uv.y));
        float prog = v_uv.x / 18.0;
        float endFade = smoothstep(0.0, 0.05, prog) * smoothstep(1.0, 0.95, prog);

        float totalFade = edgeFade * endFade;
        float alpha = clamp(m * totalFade * 1.8, 0.0, 1.0);

        fragColor = vec4(col * totalFade, alpha);
    }
`;

// ==================== Shader 2 (四边形面片分形等离子光效) ====================
// 顶点着色器：映射墨卡托坐标并输出面片归一化坐标 [-1.0, 1.0]
const vs2 = `#version 300 es
    in vec2 a_pos;  // 墨卡托平面坐标 (x, y)
    in vec2 a_uv;   // 矩形面局部纹理坐标 [0.0, 1.0]

    uniform mat4 u_matrix;
    out vec2 v_local_uv;

    void main() {
        // 映射为以中心为原点的 [-1.0, 1.0] 坐标系
        v_local_uv = a_uv * 2.0 - 1.0;
        gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
    }
`;

// 片元着色器：在面片范围内计算等离子发光与边缘羽化
const fs2 = `#version 300 es
precision highp float;

in vec2 v_local_uv;
uniform float u_time;
uniform float u_aspect;
out vec4 fragColor;

void main() {
    // 1. 严格对齐原版坐标系映射
    // 原版：k = u = .2 * (2.0 * coord - res) / res.y
    vec2 u = 0.2 * vec2(v_local_uv.x * u_aspect, v_local_uv.y);
    vec2 k = u;
    vec2 w = vec2(0.0);
    vec2 v = vec2(0.0); // 循环第一轮会被赋值覆盖

    // 原版初始化
    vec4 o = vec4(1.0, 2.0, 3.0, 0.0);
    float a = 0.5;
    float t = u_time * 0.5;

    // 2. 1:1 完整保留原版 18 次迭代循环与精确数学公式
    for (float i = 0.0; ++i < 19.0; ) {
        // 原版核心累加 (未阉割分母，保持原作者高频光效)
        o += (1.0 + cos(vec4(0.0, 1.0, 3.0, 0.0) + t)) 
           / (length((1.0 + i * dot(v, v)) * sin(w * 3.0 - 9.0 * u.yx + t)) + 0.0001);

        v = cos(++t - 7.0 * u * pow(a += 0.03, i)) - 5.0 * u;

        // 原版旋转矩阵
        u *= mat2(cos(i + t * 0.02 - vec4(0.0, 11.0, 33.0, 0.0)));

        // 原版非线性扰动
        u += 0.005 * tanh(40.0 * dot(u, u) * cos(1e2 * u.yx + t))
           + 0.2 * a * u
           + 0.003 * cos(t + 4.0 * exp(-0.01 * dot(o, o)));

        // 原版 w 映射
        w = u / (1.0 - 2.0 * dot(u, u) + 0.0001);
    }

    // 3. 原版色调映射与对比度
    o = pow(1.0 - sqrt(exp(-o * o * o / 2e2)), vec4(0.3)) - dot(k -= u, k) / 250.0;

    vec3 col = clamp(o.rgb, 0.0, 1.0);

    // 4. 面片四周边框羽化淡出 (防止矩形出现硬切边界)
    float edge = smoothstep(1.0, 0.85, abs(v_local_uv.x)) * smoothstep(1.0, 0.85, abs(v_local_uv.y));

    // 5. 黑色背景剔除 (把 Shader 里的纯黑背景变为透明，亮光部分完全显色)
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    float alpha = smoothstep(0.05, 0.35, luma) * edge;

    // 修正输出：正常透明度混合
    fragColor = vec4(col, alpha);
}
`;

// ==================== 沿 Polyline 运动的闪耀光球 Shader ====================

// 顶点着色器：计算折线局部带状网格与 UV 坐标
const vs_orb = `#version 300 es
    in vec2 a_pos;        // 墨卡托平面坐标 (x, y)
    in float a_progress;  // 沿折线的归一化进度 [0.0, 1.0]
    in float a_side;      // 侧向相对位置 [-1.0, 1.0]

    uniform mat4 u_matrix;
    out vec2 v_uv;

    void main() {
        // x: 折线绝对进度 (0.0 到 1.0)
        // y: 垂直于行进方向的横向偏移 [-1.0, 1.0]
        v_uv = vec2(a_progress, a_side);
        gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
    }
`;

// 片元着色器：计算光球运动、冲击包络脉冲与彗星光晕
const fs_orb = `#version 300 es
    precision highp float;

    in vec2 v_uv;
    uniform float u_time;
    uniform float u_line_length; // 折线纵横长宽比（用于修正圆形光斑不被拉伸）
    out vec4 fragColor;

    // ACES 色调映射曲线（防过曝，保持高亮区域自然过渡）
    vec3 aces(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
        // 1. 光球沿折线循环推进 (3.5 秒跑完全程)
        float speed = 0.28;
        float orbPos = fract(u_time * speed);

        // 2. 引入冲击包络（Punch Envelope: 22ms 急速冲程 + 指数衰减脉冲）
        // 每 0.6 秒爆发一次能量放电
        float pulseCycle = mod(u_time, 0.6);
        float attack = smoothstep(0.0, 0.022, pulseCycle);
        float envelope = attack * exp(-max(pulseCycle - 0.022, 0.0) / 0.13);

        // 3. 计算当前片元与光球中心的真实相对距离 (修正折线长宽比)
        float dx = (v_uv.x - orbPos) * u_line_length;
        float dy = v_uv.y; // 侧向 [-1.0, 1.0]
        float dist = length(vec2(dx, dy));

        // 4. 闪耀光球核心计算 (Core & Scale Pop)
        float orbRadius = 0.22 + envelope * 0.15; // 爆发瞬间尺寸弹跳
        float core = smoothstep(orbRadius, 0.0, dist);
        core = pow(core, 2.0);

        // 5. 彗星拖尾效果 (Comet Tail)
        // 仅在光球后方 (dx < 0.0) 产生平滑长尾
        float tail = 0.0;
        if (dx < 0.0) {
            float tailLen = 3.5 + envelope * 1.5; // 爆发时尾迹变长
            float tailFalloff = exp(dx / tailLen);
            float lateralFalloff = smoothstep(1.0, 0.0, abs(dy));
            tail = tailFalloff * pow(lateralFalloff, 3.0) * 0.9;
        }

        // 6. 宽域多层光学辉光 (Multi-scale Bloom)
        float glowInner = exp(-dist / (0.35 + envelope * 0.25));
        float glowOuter = exp(-dist / (1.2 + envelope * 0.5)) * 0.45;

        // 7. 色彩调配与高动态范围 (HDR) 能量叠加
        // 核心青白光，边缘淡蓝，爆发时泛金白色电光
        vec3 colCore = vec3(1.0, 1.0, 1.0);
        vec3 colCyan = vec3(0.15, 0.75, 1.0);
        vec3 colGlow = vec3(0.05, 0.45, 0.95);
        vec3 colPulse = vec3(1.0, 0.85, 0.45); // 能量爆发点缀色

        vec3 hdr = vec3(0.0);
        hdr += colCore * core * (3.0 + envelope * 6.0);         // 极亮实心白芯
        hdr += colCyan * (glowInner + tail) * (2.0 + envelope * 3.0); // 中层能量弧与流线尾
        hdr += colGlow * glowOuter * 1.5;                       // 外围漫反射光晕
        hdr += colPulse * envelope * core * 4.0;                // 瞬态放电高光

        // 8. 折线侧边缘平滑羽化消隐 (避免矩形面片切角生硬)
        float edgeFade = smoothstep(1.0, 0.4, abs(v_uv.y));
        hdr *= edgeFade;

        // 9. 压缩动态范围与透明度输出
        vec3 finalCol = aces(hdr);
        float alpha = clamp(length(finalCol) * 1.2 * edgeFade, 0.0, 1.0);

        // 预乘 Alpha 输出（搭配加法/滤色混合）
        fragColor = vec4(finalCol * alpha, alpha);
    }
`;

// ==================== Shader 5 (滚动的发光虚线着色器) ====================
const vs5 = `#version 300 es
    in vec2 a_pos;        // 墨卡托平面基准坐标 (x, y)
    in vec2 a_normal;     // 顶点法线单位向量 (nx, ny)
    in float a_side;      // 侧向偏移方向 [-1.0, 1.0]
    in float a_dist;      // 沿折线累积墨卡托距离
    in vec4 a_color;      // 线段颜色 RGBA

    uniform mat4 u_matrix;
    uniform float u_pixel_size; // 1 像素对应的墨卡托单位: 1.0 / (512.0 * 2^zoom)
    uniform float u_line_width; // 虚线宽度 (像素)

    out vec2 v_uv;        // x: 累积距离, y: 侧向 [-1.0, 1.0]
    out vec4 v_color;

    void main() {
        // 根据地图缩放级别的物理像素大小，沿垂直法线挤出半线宽
        vec2 offset = a_normal * (a_side * u_line_width * 0.5 * u_pixel_size);
        vec2 pos = a_pos + offset;
        gl_Position = u_matrix * vec4(pos, 0.0, 1.0);

        v_uv = vec2(a_dist, a_side);
        v_color = a_color;
    }
`;

const fs5 = `#version 300 es
    precision highp float;

    in vec2 v_uv;
    in vec4 v_color;

    uniform float u_time;        // 运行时间 (秒)
    uniform float u_zoom_scale;  // 墨卡托到屏幕像素的换算因子: 512.0 * 2^zoom
    uniform float u_dash_length; // 虚线单元像素周期 (如 22.0)
    uniform float u_dash_ratio;  // 实线段占比 (如 0.6)
    uniform float u_speed;       // 滚动行进速度 (像素/秒, 如 38.0)

    out vec4 fragColor;

    void main() {
        // 1. 将累加墨卡托距离换算为绝对屏幕像素距离
        float pixelDist = v_uv.x * u_zoom_scale;

        // 2. 随时间流动的虚线位移（从起点向终点流动）
        float flow = pixelDist - u_time * u_speed;

        // 3. 计算虚线周期中的归一化位置 [0.0, 1.0)
        float pattern = fract(flow / u_dash_length);

        // 4. 虚线头尾平滑抗锯齿过渡 (消除硬切边缘)
        float feather = 0.08;
        float dash = smoothstep(0.0, feather, pattern) * (1.0 - smoothstep(u_dash_ratio, u_dash_ratio + feather, pattern));

        // 5. 侧向平滑抗锯齿
        float sideFade = 1.0 - smoothstep(0.65, 1.0, abs(v_uv.y));

        // 6. 核心高光能量光芯 (暗黑科技发光质感)
        float core = 1.0 - smoothstep(0.0, 0.45, abs(v_uv.y));
        vec3 glowColor = mix(v_color.rgb, vec3(1.0), core * 0.45);

        // 7. 预乘透明度合成输出
        float alpha = v_color.a * dash * sideFade;
        if (alpha < 0.01) {
            discard;
        }

        fragColor = vec4(glowColor * alpha, alpha);
    }
`;

/**
 * 接收 vs 和 fs 的滚动虚线 CustomLayer 类
 */
class RollingDashLineLayer {
    constructor(options = {}) {
        this.id = options.id || 'rolling-dash-layer';
        this.type = 'custom';
        this.renderingMode = '2d';
        this.vs = options.vs || vs5;
        this.fs = options.fs || fs5;
        this.width = options.width || 4.5;
        this.dashLength = options.dashLength || 22.0;
        this.dashRatio = options.dashRatio || 0.6;
        this.speed = options.speed !== undefined ? options.speed : 38.0;

        // 存储线段: [{ coords: [[lng, lat], ...], color: [r, g, b, a] | '#10b981' }]
        this.lines = options.lines || [];

        this.map = null;
        this.gl = null;
        this.program = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;
        this.needsUpdate = true;
        this.startTime = performance.now();
    }

    parseColor(input) {
        if (Array.isArray(input)) {
            if (input.length === 3) return [input[0], input[1], input[2], 1.0];
            if (input.length >= 4) return [input[0], input[1], input[2], input[3]];
        }
        if (typeof input === 'string') {
            const str = input.trim();
            if (str.startsWith('#')) {
                let hex = str.slice(1);
                if (hex.length === 3) hex = hex.split('').map(c => c + c).join('') + 'ff';
                if (hex.length === 6) hex = hex + 'ff';
                if (hex.length === 8) {
                    const r = parseInt(hex.slice(0, 2), 16) / 255.0;
                    const g = parseInt(hex.slice(2, 4), 16) / 255.0;
                    const b = parseInt(hex.slice(4, 6), 16) / 255.0;
                    const a = parseInt(hex.slice(6, 8), 16) / 255.0;
                    return [r, g, b, a];
                }
            } else if (str.startsWith('rgb')) {
                const match = str.match(/\(([^)]+)\)/);
                if (match) {
                    const parts = match[1].split(',').map(s => parseFloat(s.trim()));
                    const r = (parts[0] || 0) / 255.0;
                    const g = (parts[1] || 0) / 255.0;
                    const b = (parts[2] || 0) / 255.0;
                    const a = parts.length > 3 ? parts[3] : 1.0;
                    return [r, g, b, a];
                }
            }
        }
        return [0.22, 0.74, 0.97, 1.0]; // 默认青蓝色
    }

    setLines(lines) {
        this.lines = Array.isArray(lines) ? lines : [];
        this.needsUpdate = true;
        if (this.map) {
            this.map.triggerRepaint();
        }
    }

    clear() {
        this.setLines([]);
    }

    buildBuffers(gl) {
        if (!gl) return;
        const vertexData = [];
        const indexData = [];
        let vertexOffset = 0;

        for (const line of this.lines) {
            const coords = line.coords;
            if (!coords || coords.length < 2) continue;
            const color = this.parseColor(line.color);

            // 转为墨卡托坐标
            const mercators = coords.map(c => maplibregl.MercatorCoordinate.fromLngLat(c));

            let accumDist = 0;
            for (let i = 0; i < mercators.length - 1; i++) {
                const p0 = mercators[i];
                const p1 = mercators[i + 1];

                const dx = p1.x - p0.x;
                const dy = p1.y - p0.y;
                const segLen = Math.hypot(dx, dy);
                if (segLen === 0) continue;

                // 单位法向量 (垂直于行进方向)
                const nx = -dy / segLen;
                const ny = dx / segLen;

                const d0 = accumDist;
                const d1 = accumDist + segLen;
                accumDist = d1;

                // 4 个顶点: [pos.x, pos.y, nx, ny, side, dist, r, g, b, a]
                // 0: P0 左侧
                vertexData.push(p0.x, p0.y, nx, ny, -1.0, d0, color[0], color[1], color[2], color[3]);
                // 1: P0 右侧
                vertexData.push(p0.x, p0.y, nx, ny, 1.0, d0, color[0], color[1], color[2], color[3]);
                // 2: P1 左侧
                vertexData.push(p1.x, p1.y, nx, ny, -1.0, d1, color[0], color[1], color[2], color[3]);
                // 3: P1 右侧
                vertexData.push(p1.x, p1.y, nx, ny, 1.0, d1, color[0], color[1], color[2], color[3]);

                // 两个三角形构成一个线段面片
                indexData.push(
                    vertexOffset, vertexOffset + 1, vertexOffset + 2,
                    vertexOffset + 2, vertexOffset + 1, vertexOffset + 3
                );
                vertexOffset += 4;
            }
        }

        this.indexCount = indexData.length;

        if (!this.vertexBuffer) this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.DYNAMIC_DRAW);

        if (!this.indexBuffer) this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexData), gl.DYNAMIC_DRAW);
    }

    onAdd(map, gl) {
        this.map = map;
        this.gl = gl;

        // 编译 VS
        const vsShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsShader, this.vs);
        gl.compileShader(vsShader);
        if (!gl.getShaderParameter(vsShader, gl.COMPILE_STATUS)) {
            console.error('RollingDashLineLayer VS Error:', gl.getShaderInfoLog(vsShader));
        }

        // 编译 FS
        const fsShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsShader, this.fs);
        gl.compileShader(fsShader);
        if (!gl.getShaderParameter(fsShader, gl.COMPILE_STATUS)) {
            console.error('RollingDashLineLayer FS Error:', gl.getShaderInfoLog(fsShader));
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vsShader);
        gl.attachShader(this.program, fsShader);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('RollingDashLineLayer Link Error:', gl.getProgramInfoLog(this.program));
        }

        this.aPos = gl.getAttribLocation(this.program, 'a_pos');
        this.aNormal = gl.getAttribLocation(this.program, 'a_normal');
        this.aSide = gl.getAttribLocation(this.program, 'a_side');
        this.aDist = gl.getAttribLocation(this.program, 'a_dist');
        this.aColor = gl.getAttribLocation(this.program, 'a_color');

        this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
        this.uPixelSize = gl.getUniformLocation(this.program, 'u_pixel_size');
        this.uZoomScale = gl.getUniformLocation(this.program, 'u_zoom_scale');
        this.uLineWidth = gl.getUniformLocation(this.program, 'u_line_width');
        this.uDashLength = gl.getUniformLocation(this.program, 'u_dash_length');
        this.uDashRatio = gl.getUniformLocation(this.program, 'u_dash_ratio');
        this.uSpeed = gl.getUniformLocation(this.program, 'u_speed');
        this.uTime = gl.getUniformLocation(this.program, 'u_time');

        this.buildBuffers(gl);
    }

    render(gl, matrix) {
        if (!this.program) return;
        if (this.map && this.map.getLayoutProperty && this.map.getLayoutProperty(this.id, 'visibility') === 'none') {
            return;
        }

        if (this.needsUpdate) {
            this.buildBuffers(gl);
            this.needsUpdate = false;
        }

        if (this.indexCount === 0) return;

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uMatrix, false, matrix);

        const zoom = this.map.getZoom();
        const zoomPow = Math.pow(2.0, zoom);
        const pixelSize = 1.0 / (512.0 * zoomPow);
        const zoomScale = 512.0 * zoomPow;

        gl.uniform1f(this.uPixelSize, pixelSize);
        gl.uniform1f(this.uZoomScale, zoomScale);
        gl.uniform1f(this.uLineWidth, this.width);
        gl.uniform1f(this.uDashLength, this.dashLength);
        gl.uniform1f(this.uDashRatio, this.dashRatio);
        gl.uniform1f(this.uSpeed, this.speed);

        const elapsed = (performance.now() - this.startTime) / 1000.0;
        gl.uniform1f(this.uTime, elapsed);

        // 启用加法/高光透明混合
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        const stride = 10 * Float32Array.BYTES_PER_ELEMENT;

        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 2, gl.FLOAT, false, stride, 2 * 4);

        gl.enableVertexAttribArray(this.aSide);
        gl.vertexAttribPointer(this.aSide, 1, gl.FLOAT, false, stride, 4 * 4);

        gl.enableVertexAttribArray(this.aDist);
        gl.vertexAttribPointer(this.aDist, 1, gl.FLOAT, false, stride, 5 * 4);

        gl.enableVertexAttribArray(this.aColor);
        gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 6 * 4);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

        // 持续触发重绘以平滑流动
        this.map.triggerRepaint();
    }

    onRemove(map, gl) {
        if (this.program) gl.deleteProgram(this.program);
        if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
        if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
        this.program = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
    }
}

// ==================== 导航当前段发光动画路径着色器 (Nav Line Shader) ====================
const vs_nav_line = `#version 300 es
    in vec2 a_pos;        // 墨卡托平面基准坐标 (x, y)
    in vec2 a_normal;     // 顶点法线单位向量 (nx, ny)
    in float a_side;      // 侧向偏移方向 [-1.0, 1.0]
    in float a_dist;      // 沿折线累积墨卡托距离
    in float a_progress;  // 沿整段路径进度 [0.0, 1.0]

    uniform mat4 u_matrix;
    uniform float u_pixel_size; // 1 像素对应的墨卡托单位: 1.0 / (512.0 * 2^zoom)
    uniform float u_line_width; // 像素线宽

    out vec2 v_uv;        // x: 累积距离, y: 侧向 [-1.0, 1.0]
    out float v_progress;

    void main() {
        // 沿法线挤出半线宽
        vec2 offset = a_normal * (a_side * u_line_width * 0.5 * u_pixel_size);
        vec2 pos = a_pos + offset;
        gl_Position = u_matrix * vec4(pos, 0.0, 1.0);

        v_uv = vec2(a_dist, a_side);
        v_progress = a_progress;
    }
`;

const fs_nav_line = `#version 300 es
    precision highp float;

    in vec2 v_uv;
    in float v_progress;

    uniform float u_time;
    uniform float u_zoom_scale;  // 512.0 * 2^zoom
    uniform float u_speed;       // 像素/秒 (如 52.0)
    uniform vec4 u_base_color;   // 基础色 RGBA (如琥珀金橙 [0.96, 0.62, 0.04, 0.95])
    uniform vec4 u_pulse_color;  // 高光脉冲色 RGBA (如亮金白 [1.0, 0.98, 0.75, 1.0])

    out vec4 fragColor;

    void main() {
        // 1. 将累加墨卡托距离换算为绝对屏幕像素距离
        float pixelDist = v_uv.x * u_zoom_scale;

        // 2. 侧向平滑羽化消隐 (高品质抗锯齿边缘)
        float absSide = abs(v_uv.y);
        float edgeFade = 1.0 - smoothstep(0.65, 1.0, absSide);
        if (edgeFade < 0.01) discard;

        // 3. 核心亮线 (高亮内芯通道)
        float core = 1.0 - smoothstep(0.0, 0.38, absSide);

        // 4. 沿折线连续流动的能量箭头/脉冲波束 (Flowing Chevron Waves)
        float patternPeriod = 36.0;
        float flow = pixelDist - u_time * u_speed;
        float phase = fract(flow / patternPeriod);
        float flowWave = smoothstep(0.0, 0.45, phase) * (1.0 - smoothstep(0.45, 0.85, phase));

        // 5. 沿整段路径持续疾驰的彗星光球 (Comet Pulse along segment progress)
        float cometCycle = fract(u_time * 0.42);
        float cometDist = abs(v_progress - cometCycle);
        cometDist = min(cometDist, 1.0 - cometDist);
        float cometHead = exp(-cometDist * 32.0);

        float tailOffset = v_progress - cometCycle;
        if (tailOffset > 0.0) tailOffset -= 1.0;
        float cometTail = (tailOffset < 0.0 && tailOffset > -0.3) ? exp(tailOffset * 8.0) * 0.7 : 0.0;
        float comet = cometHead + cometTail;

        // 6. 综合能量叠加 (HDR 科技发光质感)
        vec3 col = u_base_color.rgb;
        col = mix(col, u_pulse_color.rgb, flowWave * 0.7);
        col = mix(col, vec3(1.0, 1.0, 1.0), comet * 0.85);
        col += vec3(0.95, 0.98, 1.0) * core * 0.5;

        // 7. 透明度综合计算 (预乘 Alpha 输出)
        float alpha = u_base_color.a * edgeFade;
        alpha = clamp(alpha + flowWave * 0.25 + comet * 0.4, 0.0, 1.0);

        fragColor = vec4(col * alpha, alpha);
    }
`;

/**
 * NavSegmentLineLayer - 导航指引当前段专属发光动画路径着色器图层 (WebGL CustomLayer)
 */
class NavSegmentLineLayer {
    constructor(options = {}) {
        this.id = options.id || 'nav-segment-line-shader-layer';
        this.type = 'custom';
        this.renderingMode = '2d';
        this.vs = options.vs || vs_nav_line;
        this.fs = options.fs || fs_nav_line;
        this.lineWidth = options.lineWidth || 14.0;
        this.speed = options.speed !== undefined ? options.speed : 52.0;
        this.baseColor = options.baseColor || [0.96, 0.62, 0.04, 0.95]; // 琥珀金橙
        this.pulseColor = options.pulseColor || [1.0, 0.98, 0.75, 1.0]; // 金白高光

        this.coords = options.coords || [];
        this.map = null;
        this.gl = null;
        this.program = null;
        this.vertexBuffer = null;
        this.vertexCount = 0;
        this.needsUpdate = true;
        this.startTime = performance.now();
        this.visible = true;
    }

    setCoords(coords) {
        this.coords = (Array.isArray(coords) && coords.length >= 2) ? coords : [];
        this.needsUpdate = true;
        if (this.map) {
            this.map.triggerRepaint();
        }
    }

    clear() {
        this.setCoords([]);
    }

    buildBuffers(gl) {
        if (!gl) return;
        if (!this.coords || this.coords.length < 2) {
            this.vertexCount = 0;
            return;
        }

        // 1. 过滤连续重复点
        const validCoords = [];
        for (let i = 0; i < this.coords.length; i++) {
            const c = this.coords[i];
            if (!c || c.length < 2) continue;
            if (validCoords.length > 0) {
                const prev = validCoords[validCoords.length - 1];
                if (Math.abs(c[0] - prev[0]) < 1e-7 && Math.abs(c[1] - prev[1]) < 1e-7) {
                    continue;
                }
            }
            validCoords.push(c);
        }
        if (validCoords.length < 2) {
            this.vertexCount = 0;
            return;
        }

        // 2. 转为墨卡托平面坐标
        const pts = validCoords.map(c => maplibregl.MercatorCoordinate.fromLngLat(c));
        const N = pts.length;

        // 3. 计算各分段长度与累积距离
        const cumDist = new Float32Array(N);
        let totalDist = 0;
        for (let i = 1; i < N; i++) {
            const dx = pts[i].x - pts[i - 1].x;
            const dy = pts[i].y - pts[i - 1].y;
            totalDist += Math.hypot(dx, dy);
            cumDist[i] = totalDist;
        }

        // 4. 计算各顶点的 Miter 单位法向量 (消除折角生硬缝隙)
        const normals = [];
        for (let i = 0; i < N; i++) {
            if (i === 0) {
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                const len = Math.hypot(dx, dy) || 1.0;
                normals.push({ x: -dy / len, y: dx / len });
            } else if (i === N - 1) {
                const dx = pts[N - 1].x - pts[N - 2].x;
                const dy = pts[N - 1].y - pts[N - 2].y;
                const len = Math.hypot(dx, dy) || 1.0;
                normals.push({ x: -dy / len, y: dx / len });
            } else {
                const dx1 = pts[i].x - pts[i - 1].x;
                const dy1 = pts[i].y - pts[i - 1].y;
                const len1 = Math.hypot(dx1, dy1) || 1.0;
                const n1x = -dy1 / len1, n1y = dx1 / len1;

                const dx2 = pts[i + 1].x - pts[i].x;
                const dy2 = pts[i + 1].y - pts[i].y;
                const len2 = Math.hypot(dx2, dy2) || 1.0;
                const n2x = -dy2 / len2, n2y = dx2 / len2;

                const sumX = n1x + n2x;
                const sumY = n1y + n2y;
                const sumLen = Math.hypot(sumX, sumY);

                if (sumLen < 0.001) {
                    normals.push({ x: n1x, y: n1y });
                } else {
                    const nx = sumX / sumLen;
                    const ny = sumY / sumLen;
                    const cosA = nx * n1x + ny * n1y;
                    const miter = (cosA > 0.3) ? Math.min(1.0 / cosA, 2.0) : 1.5;
                    normals.push({ x: nx * miter, y: ny * miter });
                }
            }
        }

        // 5. 构建 Triangle Strip 顶点缓冲: [pos.x, pos.y, nx, ny, side, dist, progress]
        const vertexData = [];
        for (let i = 0; i < N; i++) {
            const p = pts[i];
            const n = normals[i];
            const d = cumDist[i];
            const prog = totalDist > 0 ? (d / totalDist) : (i / (N - 1));

            // 左侧顶点 (side = -1.0)
            vertexData.push(p.x, p.y, n.x, n.y, -1.0, d, prog);
            // 右侧顶点 (side = 1.0)
            vertexData.push(p.x, p.y, n.x, n.y, 1.0, d, prog);
        }

        this.vertexCount = vertexData.length / 7;

        if (!this.vertexBuffer) this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.DYNAMIC_DRAW);
    }

    onAdd(map, gl) {
        this.map = map;
        this.gl = gl;

        // 编译 VS
        const vsShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsShader, this.vs);
        gl.compileShader(vsShader);
        if (!gl.getShaderParameter(vsShader, gl.COMPILE_STATUS)) {
            console.error('NavSegmentLineLayer VS Error:', gl.getShaderInfoLog(vsShader));
        }

        // 编译 FS
        const fsShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsShader, this.fs);
        gl.compileShader(fsShader);
        if (!gl.getShaderParameter(fsShader, gl.COMPILE_STATUS)) {
            console.error('NavSegmentLineLayer FS Error:', gl.getShaderInfoLog(fsShader));
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vsShader);
        gl.attachShader(this.program, fsShader);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('NavSegmentLineLayer Link Error:', gl.getProgramInfoLog(this.program));
        }

        this.aPos = gl.getAttribLocation(this.program, 'a_pos');
        this.aNormal = gl.getAttribLocation(this.program, 'a_normal');
        this.aSide = gl.getAttribLocation(this.program, 'a_side');
        this.aDist = gl.getAttribLocation(this.program, 'a_dist');
        this.aProgress = gl.getAttribLocation(this.program, 'a_progress');

        this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
        this.uPixelSize = gl.getUniformLocation(this.program, 'u_pixel_size');
        this.uZoomScale = gl.getUniformLocation(this.program, 'u_zoom_scale');
        this.uLineWidth = gl.getUniformLocation(this.program, 'u_line_width');
        this.uSpeed = gl.getUniformLocation(this.program, 'u_speed');
        this.uTime = gl.getUniformLocation(this.program, 'u_time');
        this.uBaseColor = gl.getUniformLocation(this.program, 'u_base_color');
        this.uPulseColor = gl.getUniformLocation(this.program, 'u_pulse_color');

        this.buildBuffers(gl);
    }

    render(gl, matrix) {
        if (!this.program || !this.visible) return;
        if (this.map && this.map.getLayoutProperty && this.map.getLayoutProperty(this.id, 'visibility') === 'none') {
            return;
        }

        if (this.needsUpdate) {
            this.buildBuffers(gl);
            this.needsUpdate = false;
        }

        if (this.vertexCount === 0) return;

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uMatrix, false, matrix);

        const zoom = this.map.getZoom();
        const zoomPow = Math.pow(2.0, zoom);
        const pixelSize = 1.0 / (512.0 * zoomPow);
        const zoomScale = 512.0 * zoomPow;

        gl.uniform1f(this.uPixelSize, pixelSize);
        gl.uniform1f(this.uZoomScale, zoomScale);
        gl.uniform1f(this.uLineWidth, this.lineWidth);
        gl.uniform1f(this.uSpeed, this.speed);
        gl.uniform4fv(this.uBaseColor, this.baseColor);
        gl.uniform4fv(this.uPulseColor, this.pulseColor);

        const elapsed = (performance.now() - this.startTime) / 1000.0;
        gl.uniform1f(this.uTime, elapsed);

        // 启用加法/高光透明混合
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        const stride = 7 * Float32Array.BYTES_PER_ELEMENT;

        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 2, gl.FLOAT, false, stride, 2 * 4);

        gl.enableVertexAttribArray(this.aSide);
        gl.vertexAttribPointer(this.aSide, 1, gl.FLOAT, false, stride, 4 * 4);

        gl.enableVertexAttribArray(this.aDist);
        gl.vertexAttribPointer(this.aDist, 1, gl.FLOAT, false, stride, 5 * 4);

        gl.enableVertexAttribArray(this.aProgress);
        gl.vertexAttribPointer(this.aProgress, 1, gl.FLOAT, false, stride, 6 * 4);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.vertexCount);

        // 持续重绘驱动流动动画
        this.map.triggerRepaint();
    }

    onRemove(map, gl) {
        if (this.program) gl.deleteProgram(this.program);
        if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
        this.program = null;
        this.vertexBuffer = null;
    }
}

// ==================== 导航当前决策节点雷达光波着色器 (Nav Node Beacon Shader) ====================
const vs_nav_node = `#version 300 es
    in vec2 a_pos;          // 墨卡托中心基准坐标 (x, y)
    in vec2 a_quad_offset;  // 面片局部角点 [-1.0, 1.0]
    in float a_node_type;   // 1.0: 当前聚焦决策点, 0.0: 普通步骤节点

    uniform mat4 u_matrix;
    uniform float u_pixel_size; // 1 像素对应的墨卡托单位
    uniform float u_node_size;  // 节点外围像素尺寸

    out vec2 v_uv;
    out float v_node_type;

    void main() {
        float sz = (a_node_type > 0.5) ? u_node_size : (u_node_size * 0.4);
        vec2 offset = a_quad_offset * (sz * 0.5 * u_pixel_size);
        vec2 pos = a_pos + offset;
        gl_Position = u_matrix * vec4(pos, 0.0, 1.0);

        v_uv = a_quad_offset;
        v_node_type = a_node_type;
    }
`;

const fs_nav_node = `#version 300 es
    precision highp float;

    in vec2 v_uv;
    in float v_node_type;

    uniform float u_time;
    uniform vec4 u_color;      // 主题色 RGBA

    out vec4 fragColor;

    void main() {
        float r = length(v_uv);
        if (r > 1.0) discard;

        vec3 col = u_color.rgb;

        if (v_node_type > 0.5) {
            // ========== 当前聚焦决策节点 (双重雷达脉冲扩散波 + 目标环 + 呼吸光芯) ==========
            // 1. 双重扩散雷达波
            float wave1 = fract(u_time * 1.0);
            float ring1 = smoothstep(0.06, 0.0, abs(r - wave1)) * (1.0 - wave1);

            float wave2 = fract(u_time * 1.0 + 0.5);
            float ring2 = smoothstep(0.06, 0.0, abs(r - wave2)) * (1.0 - wave2);

            float ripples = ring1 + ring2;

            // 2. 静态定位外环 (瞄准圆环)
            float targetRing = smoothstep(0.045, 0.0, abs(r - 0.48));

            // 3. 动态脉冲呼吸光芯
            float pulse = 0.82 + 0.18 * sin(u_time * 5.5);
            float coreRadius = 0.22 * pulse;
            float core = smoothstep(coreRadius, 0.0, r);
            float centerWhite = smoothstep(coreRadius * 0.45, 0.0, r);

            // 4. 颜色与透明度合成
            vec3 finalCol = col;
            finalCol = mix(finalCol, vec3(1.0, 1.0, 1.0), centerWhite * 0.95);
            finalCol += vec3(0.3, 0.4, 0.5) * (targetRing + ripples * 0.8);

            float alpha = clamp(ripples * 0.75 + targetRing * 0.85 + core * 0.95, 0.0, 1.0);
            fragColor = vec4(finalCol * alpha, alpha);
        } else {
            // ========== 其它步骤参考节点 (高雅微光点) ==========
            float dotOuter = smoothstep(0.5, 0.35, r);
            float dotCore = smoothstep(0.2, 0.0, r);
            vec3 subCol = mix(col, vec3(1.0), dotCore * 0.85);
            float alpha = dotOuter * 0.85;
            fragColor = vec4(subCol * alpha, alpha);
        }
    }
`;

/**
 * NavNodeBeaconLayer - 导航指引决策节点与途径节点专属雷达脉冲着色器图层 (WebGL CustomLayer)
 */
class NavNodeBeaconLayer {
    constructor(options = {}) {
        this.id = options.id || 'nav-node-beacon-shader-layer';
        this.type = 'custom';
        this.renderingMode = '2d';
        this.vs = options.vs || vs_nav_node;
        this.fs = options.fs || fs_nav_node;
        this.nodeSize = options.size || 64.0;
        this.color = options.color || [0.98, 0.75, 0.14, 1.0]; // 亮黄/琥珀雷达

        this.nodes = []; // [{ lngLat: [lng, lat], type: 1.0 / 0.0 }]
        this.map = null;
        this.gl = null;
        this.program = null;
        this.vertexBuffer = null;
        this.vertexCount = 0;
        this.needsUpdate = true;
        this.startTime = performance.now();
        this.visible = true;
    }

    setNodes(allStepCoords, activeIndex = 0) {
        if (!Array.isArray(allStepCoords) || allStepCoords.length === 0) {
            this.nodes = [];
        } else {
            this.nodes = allStepCoords.map((coord, idx) => ({
                lngLat: coord,
                type: (idx === activeIndex) ? 1.0 : 0.0
            }));
        }
        this.needsUpdate = true;
        if (this.map) {
            this.map.triggerRepaint();
        }
    }

    setActiveNode(coord) {
        if (!coord) {
            this.nodes = [];
        } else {
            this.nodes = [{ lngLat: coord, type: 1.0 }];
        }
        this.needsUpdate = true;
        if (this.map) {
            this.map.triggerRepaint();
        }
    }

    clear() {
        this.nodes = [];
        this.needsUpdate = true;
        if (this.map) {
            this.map.triggerRepaint();
        }
    }

    buildBuffers(gl) {
        if (!gl) return;
        if (!this.nodes || this.nodes.length === 0) {
            this.vertexCount = 0;
            return;
        }

        const vertexData = [];
        for (const item of this.nodes) {
            const c = item.lngLat;
            if (!c || c.length < 2) continue;
            const merc = maplibregl.MercatorCoordinate.fromLngLat(c);
            const type = item.type;

            // 6 个顶点构成一个正方形面片: [merc.x, merc.y, quadX, quadY, type]
            // 三角形 1
            vertexData.push(merc.x, merc.y, -1.0, -1.0, type);
            vertexData.push(merc.x, merc.y,  1.0, -1.0, type);
            vertexData.push(merc.x, merc.y, -1.0,  1.0, type);
            // 三角形 2
            vertexData.push(merc.x, merc.y, -1.0,  1.0, type);
            vertexData.push(merc.x, merc.y,  1.0, -1.0, type);
            vertexData.push(merc.x, merc.y,  1.0,  1.0, type);
        }

        this.vertexCount = vertexData.length / 5;

        if (!this.vertexBuffer) this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.DYNAMIC_DRAW);
    }

    onAdd(map, gl) {
        this.map = map;
        this.gl = gl;

        const vsShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsShader, this.vs);
        gl.compileShader(vsShader);
        if (!gl.getShaderParameter(vsShader, gl.COMPILE_STATUS)) {
            console.error('NavNodeBeaconLayer VS Error:', gl.getShaderInfoLog(vsShader));
        }

        const fsShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsShader, this.fs);
        gl.compileShader(fsShader);
        if (!gl.getShaderParameter(fsShader, gl.COMPILE_STATUS)) {
            console.error('NavNodeBeaconLayer FS Error:', gl.getShaderInfoLog(fsShader));
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vsShader);
        gl.attachShader(this.program, fsShader);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('NavNodeBeaconLayer Link Error:', gl.getProgramInfoLog(this.program));
        }

        this.aPos = gl.getAttribLocation(this.program, 'a_pos');
        this.aQuadOffset = gl.getAttribLocation(this.program, 'a_quad_offset');
        this.aNodeType = gl.getAttribLocation(this.program, 'a_node_type');

        this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
        this.uPixelSize = gl.getUniformLocation(this.program, 'u_pixel_size');
        this.uNodeSize = gl.getUniformLocation(this.program, 'u_node_size');
        this.uTime = gl.getUniformLocation(this.program, 'u_time');
        this.uColor = gl.getUniformLocation(this.program, 'u_color');

        this.buildBuffers(gl);
    }

    render(gl, matrix) {
        if (!this.program || !this.visible) return;
        if (this.map && this.map.getLayoutProperty && this.map.getLayoutProperty(this.id, 'visibility') === 'none') {
            return;
        }

        if (this.needsUpdate) {
            this.buildBuffers(gl);
            this.needsUpdate = false;
        }

        if (this.vertexCount === 0) return;

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uMatrix, false, matrix);

        const zoom = this.map.getZoom();
        const zoomPow = Math.pow(2.0, zoom);
        const pixelSize = 1.0 / (512.0 * zoomPow);

        gl.uniform1f(this.uPixelSize, pixelSize);
        gl.uniform1f(this.uNodeSize, this.nodeSize);
        gl.uniform4fv(this.uColor, this.color);

        const elapsed = (performance.now() - this.startTime) / 1000.0;
        gl.uniform1f(this.uTime, elapsed);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        const stride = 5 * Float32Array.BYTES_PER_ELEMENT;

        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(this.aQuadOffset);
        gl.vertexAttribPointer(this.aQuadOffset, 2, gl.FLOAT, false, stride, 2 * 4);

        gl.enableVertexAttribArray(this.aNodeType);
        gl.vertexAttribPointer(this.aNodeType, 1, gl.FLOAT, false, stride, 4 * 4);

        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

        this.map.triggerRepaint();
    }

    onRemove(map, gl) {
        if (this.program) gl.deleteProgram(this.program);
        if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
        this.program = null;
        this.vertexBuffer = null;
    }
}

// 挂载到全局
if (typeof window !== 'undefined') {
    window.vs1 = typeof vs1 !== 'undefined' ? vs1 : null;
    window.fs1 = typeof fs1 !== 'undefined' ? fs1 : null;
    window.vs2 = typeof vs2 !== 'undefined' ? vs2 : null;
    window.fs2 = typeof fs2 !== 'undefined' ? fs2 : null;
    window.vs_orb = typeof vs_orb !== 'undefined' ? vs_orb : null;
    window.fs_orb = typeof fs_orb !== 'undefined' ? fs_orb : null;
    window.vs5 = vs5;
    window.fs5 = fs5;
    window.RollingDashLineLayer = RollingDashLineLayer;

    // 导航专属 Shader 与 WebGL CustomLayer
    window.vs_nav_line = vs_nav_line;
    window.fs_nav_line = fs_nav_line;
    window.NavSegmentLineLayer = NavSegmentLineLayer;
    window.vs_nav_node = vs_nav_node;
    window.fs_nav_node = fs_nav_node;
    window.NavNodeBeaconLayer = NavNodeBeaconLayer;
}