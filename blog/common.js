/**
 * Book of Shaders 学习博客 — 通用渲染引擎
 * 封装 Three.js shader demo 的创建、渲染和生命周期管理
 */

(function () {
    'use strict';

    const VERTEX_SHADER = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    // 存储所有 demo 实例，用于统一管理
    const demos = [];

    /**
     * 创建一个 shader demo 实例
     * @param {string} containerId - 容器 DOM 元素的 id
     * @param {string} fragmentShader - fragment shader 源码
     * @param {object} [options] - 配置选项
     * @param {boolean} [options.animated=false] - 是否启用时间动画
     * @param {object} [options.extraUniforms] - 额外的 uniform 变量
     */
    function createShaderDemo(containerId, fragmentShader, options) {
        const opts = Object.assign({ animated: false, extraUniforms: {} }, options || {});
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[ShaderBlog] Container not found:', containerId);
            return null;
        }

        const demo = {
            id: containerId,
            container: container,
            renderer: null,
            scene: null,
            camera: null,
            material: null,
            mesh: null,
            clock: null,
            animationId: null,
            running: false,
            initialized: false,
            opts: opts,
            fragmentShader: fragmentShader
        };

        demos.push(demo);

        // 使用 IntersectionObserver 实现懒加载
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting && !demo.initialized) {
                    initDemo(demo);
                    demo.initialized = true;
                }
                if (entry.isIntersecting && !demo.running) {
                    startDemo(demo);
                } else if (!entry.isIntersecting && demo.running) {
                    stopDemo(demo);
                }
            });
        }, { threshold: 0.05 });

        observer.observe(container);

        return demo;
    }

    function initDemo(demo) {
        var container = demo.container;
        var width = container.clientWidth || 400;
        var height = container.clientHeight || 300;

        demo.scene = new THREE.Scene();
        var aspect = width / height;
        if (aspect >= 1) {
            demo.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0, 1);
        } else {
            demo.camera = new THREE.OrthographicCamera(-1, 1, 1 / aspect, -1 / aspect, 0, 1);
        }
        demo.camera.position.z = 1;

        demo.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        demo.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        demo.renderer.setSize(width, height);
        container.appendChild(demo.renderer.domElement);

        var uniforms = {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(width, height) },
            u_mouse: { value: new THREE.Vector2(0, 0) }
        };

        // 合并额外 uniform
        var extra = demo.opts.extraUniforms;
        for (var key in extra) {
            if (extra.hasOwnProperty(key)) {
                uniforms[key] = extra[key];
            }
        }

        demo.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: demo.fragmentShader,
            uniforms: uniforms
        });

        demo.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), demo.material);
        demo.scene.add(demo.mesh);

        demo.clock = new THREE.Clock(false); // 不自动启动

        // 监听容器尺寸变化
        if (window.ResizeObserver) {
            demo._resizeObserver = new ResizeObserver(function () {
                resizeDemo(demo);
            });
            demo._resizeObserver.observe(container);
        }
    }

    function resizeDemo(demo) {
        if (!demo.renderer || !demo.container) return;
        var width = demo.container.clientWidth;
        var height = demo.container.clientHeight;
        if (width === 0 || height === 0) return;
        demo.renderer.setSize(width, height);
        demo.material.uniforms.u_resolution.value.set(width, height);
        
        if (demo.camera && demo.camera.isOrthographicCamera) {
            var aspect = width / height;
            if (aspect >= 1) {
                demo.camera.left = -aspect;
                demo.camera.right = aspect;
                demo.camera.top = 1;
                demo.camera.bottom = -1;
            } else {
                demo.camera.left = -1;
                demo.camera.right = 1;
                demo.camera.top = 1 / aspect;
                demo.camera.bottom = -1 / aspect;
            }
            demo.camera.updateProjectionMatrix();
        }
    }

    function startDemo(demo) {
        if (!demo.renderer || demo.running) return;
        demo.running = true;
        demo.clock.start();

        function animate() {
            if (!demo.running) return;
            demo.animationId = requestAnimationFrame(animate);
            if (demo.opts.animated) {
                demo.material.uniforms.u_time.value = demo.clock.getElapsedTime();
            }
            demo.renderer.render(demo.scene, demo.camera);
        }
        animate();
    }

    function stopDemo(demo) {
        demo.running = false;
        demo.clock.stop();
        if (demo.animationId) {
            cancelAnimationFrame(demo.animationId);
            demo.animationId = null;
        }
    }

    /**
     * 简单的 GLSL 语法高亮
     * @param {string} code - GLSL 源代码
     * @returns {string} 带 <span> 标记的 HTML
     */
    function highlightGLSL(code) {
        // 先转义 HTML
        var html = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 注释 (// ... 和 /* ... */)
        html = html.replace(/(\/\/[^\n]*)/g, '<span class="cm">$1</span>');
        html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cm">$1</span>');

        // 预处理器 (#define, #ifdef, etc.)
        html = html.replace(/(#\w+)/g, '<span class="pp">$1</span>');

        // 类型关键字
        var types = ['void', 'float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4',
            'sampler2D', 'samplerCube', 'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4'];
        types.forEach(function (t) {
            html = html.replace(new RegExp('\\b(' + t + ')\\b', 'g'), '<span class="ty">$1</span>');
        });

        // 关键字
        var keywords = ['varying', 'uniform', 'const', 'in', 'out', 'inout',
            'if', 'else', 'for', 'while', 'do', 'return', 'discard',
            'precision', 'highp', 'mediump', 'lowp', 'struct'];
        keywords.forEach(function (k) {
            html = html.replace(new RegExp('\\b(' + k + ')\\b', 'g'), '<span class="kw">$1</span>');
        });

        // 内置函数
        var funcs = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'exp', 'log', 'sqrt',
            'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp',
            'mix', 'step', 'smoothstep', 'length', 'distance', 'dot', 'cross', 'normalize',
            'texture2D', 'gl_FragColor', 'gl_Position', 'main'];
        funcs.forEach(function (f) {
            html = html.replace(new RegExp('\\b(' + f + ')\\b', 'g'), '<span class="fn">$1</span>');
        });

        // 数字 (整数和浮点数)
        html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');

        return html;
    }

    /**
     * 自动为页面中所有 .code-block 应用语法高亮
     */
    function highlightAllCode() {
        var blocks = document.querySelectorAll('.code-block[data-raw]');
        blocks.forEach(function (block) {
            block.innerHTML = highlightGLSL(block.getAttribute('data-raw'));
        });
    }

    /**
     * 初始化侧边栏切换（移动端）
     */
    function initSidebar() {
        var toggle = document.querySelector('.mobile-toggle');
        var sidebar = document.querySelector('.sidebar');
        if (toggle && sidebar) {
            toggle.addEventListener('click', function () {
                sidebar.classList.toggle('open');
            });
            // 点击内容区关闭侧边栏
            document.querySelector('.main-content').addEventListener('click', function () {
                sidebar.classList.remove('open');
            });
        }
    }

    // 生成侧边栏 HTML
    function generateSidebar(currentPage) {
        var chapters = [
            { id: '01', name: '造型函数', file: '01-shaping.html' },
            { id: '02', name: '颜色', file: '02-colors.html' },
            { id: '03', name: '形状', file: '03-shapes.html' },
            { id: '04', name: '二维矩阵', file: '04-matrices.html' },
            { id: '05', name: '图案', file: '05-patterns.html' },
            { id: '06', name: '随机', file: '06-random.html' },
            { id: '07', name: '噪声', file: '07-noise.html' },
            { id: '08', name: '网格噪声', file: '08-cellular.html' }
        ];

        var html = '';
        html += '<div class="sidebar-header">';
        html += '  <div class="sidebar-logo"><span class="icon">📖</span> GLSL 学习笔记</div>';
        html += '  <div class="sidebar-title">The Book of Shaders</div>';
        html += '</div>';
        html += '<ul class="nav-list">';
        html += '  <li class="nav-item"><a class="nav-link" href="../index_beian.html"><span class="nav-number">⌂</span> 首页</a></li>';

        chapters.forEach(function (ch) {
            var active = currentPage === ch.file ? ' active' : '';
            html += '<li class="nav-item">';
            html += '  <a class="nav-link' + active + '" href="' + ch.file + '">';
            html += '    <span class="nav-number">' + ch.id + '</span> ' + ch.name;
            html += '  </a>';
            html += '</li>';
        });

        html += '</ul>';
        html += '<div class="sidebar-footer">';
        html += '  <a href="https://thebookofshaders.com/?lan=ch" target="_blank">📚 原始教程</a>';
        html += '</div>';

        return html;
    }

    // 页面加载完成后自动初始化
    document.addEventListener('DOMContentLoaded', function () {
        // 自动填充侧边栏
        var sidebar = document.querySelector('.sidebar');
        if (sidebar && !sidebar.innerHTML.trim()) {
            var pageName = window.location.pathname.split('/').pop();
            sidebar.innerHTML = generateSidebar(pageName);
        }

        // 初始化侧边栏交互
        initSidebar();

        // 语法高亮
        highlightAllCode();
    });

    // 暴露全局 API
    window.ShaderBlog = {
        createDemo: createShaderDemo,
        highlightGLSL: highlightGLSL,
        generateSidebar: generateSidebar,
        VERTEX_SHADER: VERTEX_SHADER
    };

})();
