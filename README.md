# FUNGIS 地图平台 - Vue3 版本

基于 Vue3 + Vue Router 的地理信息可视化平台

## 项目结构

```
html/
├── src/                    # Vue3 源代码
│   ├── views/             # 页面组件
│   │   ├── Home.vue       # 首页
│   │   ├── CesiumMap.vue  # Cesium 三维地图
│   │   └── RiverMap.vue   # River 流域地图
│   ├── App.vue            # 根组件
│   └── main.js            # 入口文件
├── cesium/                # Cesium 静态资源
├── river_sc/              # River 地图静态资源
├── index.html             # HTML 模板
├── package.json           # 依赖配置
├── vite.config.js         # Vite 配置
└── .gitignore             # Git 忽略配置

```

## 开发环境设置

### 1. 安装依赖

```bash
cd html
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问: http://localhost:3000

### 3. 构建生产版本

```bash
npm run build
```

构建完成后，生成的文件在 `dist/` 目录

## 部署到云服务器

### 1. 本地构建

```bash
cd html
npm run build
```

### 2. 上传文件到服务器

使用 SFTP 上传以下文件：
- `dist/` 目录 → `/etc/nginx/html/dist/`
- `cesium/` 目录（已存在，无需重复上传）
- `river_sc/` 目录（已存在，无需重复上传）
- 更新后的 `nginx.conf` → `/etc/nginx/nginx.conf`

### 3. 重启 Nginx

```bash
sudo nginx -t          # 测试配置
sudo systemctl reload nginx   # 重新加载配置
```

## 路由说明

- `/` - 首页，展示项目入口
- `/cesium` - Cesium 三维地图
- `/river` - River 流域地图
- `/baidu/topic-map` - 百度地图专题图（叠加 GeoServer WMS）

## 功能特性

### Cesium 地图
- ✅ GPS 照片定位
- ✅ 三维地球可视化
- ✅ 天地图/TooMap 图层切换
- ✅ 当前位置定位（支持GPS和IP定位）
- ✅ 照片标记与预览

### River 地图
- ✅ 天地图集成
- ✅ WMTS 图层展示
- ✅ 图层透明度控制
- ✅ 流域边界展示

### Baidu 专题图
- ✅ 百度地图底图加载
- ✅ GeoServer WMS 专题图叠加
- ✅ 按瓦片动态计算 BBOX 请求

## 注意事项

### Git 提交
项目已配置 `.gitignore`，以下文件不会被提交：
- `node_modules/` - NPM 依赖包
- `dist/` - 构建输出
- `package-lock.json` - 锁文件
- 其他临时文件

### 推荐工作流程
1. 本地开发：`npm run dev`
2. 测试功能
3. 构建：`npm run build`
4. 使用 SFTP 工具上传 `dist/` 目录到服务器
5. 重新加载 Nginx 配置

### SFTP 上传建议
推荐使用以下工具：
- **FileZilla** - 免费的 FTP/SFTP 客户端
- **WinSCP** - Windows 专用 SFTP 客户端
- **VS Code Remote SSH** - 在 VS Code 中直接编辑远程文件

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **Vue Router 4** - 官方路由管理器
- **Vite** - 下一代前端构建工具
- **Cesium** - 三维地球可视化引擎
- **天地图 API** - 国家地理信息公共服务平台

## 浏览器支持

- Chrome (推荐)
- Firefox
- Edge
- Safari

建议使用最新版本的现代浏览器以获得最佳体验。
