# 部署指南

## 快速开始

### 第一步：安装依赖

在 `html` 目录下执行：

```bash
npm install
```

这将安装以下依赖：
- Vue 3
- Vue Router 4
- Vite 及相关插件

**注意**：`node_modules` 文件夹会被 `.gitignore` 忽略，不会上传到云服务器。

### 第二步：本地开发测试

```bash
npm run dev
```

浏览器访问：http://localhost:3000

你应该能看到：
- 首页：两个卡片（Cesium 地图和 River 地图）
- 点击卡片可以跳转到对应的地图页面

### 第三步：构建生产版本

```bash
npm run build
```

构建完成后，会在 `html` 目录下生成 `dist` 文件夹，包含：
- `index.html` - 入口 HTML
- `assets/` - 打包后的 JS 和 CSS 文件

## 上传到云服务器

### 方法一：使用 SFTP 工具（推荐）

#### FileZilla 配置
1. 主机：你的服务器 IP
2. 用户名：你的 SSH 用户名
3. 密码：你的 SSH 密码
4. 端口：22

#### 上传步骤
1. 连接到服务器
2. 导航到 `/etc/nginx/html/`
3. 上传本地 `dist` 文件夹到服务器的 `/etc/nginx/html/dist/`
4. 上传更新后的 `nginx.conf` 到 `/etc/nginx/`

### 方法二：使用 SCP 命令

```bash
# 上传 dist 文件夹
scp -r dist/ user@server:/etc/nginx/html/

# 上传 nginx 配置
scp ../nginx.conf user@server:/etc/nginx/
```

### 方法三：使用 VS Code Remote SSH

1. 安装 VS Code 的 "Remote - SSH" 插件
2. 连接到服务器
3. 直接在 VS Code 中打开远程文件夹
4. 复制本地 `dist` 文件夹到服务器

## 服务器配置

### 1. 测试 Nginx 配置

```bash
sudo nginx -t
```

如果显示 `syntax is ok` 和 `test is successful`，说明配置正确。

### 2. 重新加载 Nginx

```bash
sudo systemctl reload nginx
```

或者

```bash
sudo nginx -s reload
```

### 3. 查看 Nginx 状态

```bash
sudo systemctl status nginx
```

### 4. 如果遇到问题，查看日志

```bash
# 错误日志
sudo tail -f /var/log/nginx/error.log

# 访问日志
sudo tail -f /var/log/nginx/access.log
```

## 目录结构对应关系

### 本地目录 → 服务器目录

```
html/dist/               → /etc/nginx/html/dist/
html/cesium/            → /etc/nginx/html/cesium/
html/river_sc/          → /etc/nginx/html/river_sc/
nginx.conf              → /etc/nginx/nginx.conf
```

### Nginx 路由配置

| 访问路径 | 对应目录 | 说明 |
|---------|---------|------|
| `/` | `/etc/nginx/html/dist/` | Vue3 应用主入口 |
| `/assets/*` | `/etc/nginx/html/dist/assets/` | Vue3 打包资源 |
| `/cesium/*` | `/etc/nginx/html/cesium/` | Cesium 库和资源 |
| `/river_sc/*` | `/etc/nginx/html/river_sc/` | River 地图资源 |

## 访问地址

部署成功后，通过以下地址访问（将 `<服务器IP>` 替换为您的实际 IP）：

- 首页：http://<服务器IP>/
- Cesium 地图：http://<服务器IP>/cesium
- River 地图：http://<服务器IP>/river

**注意**：Vue Router 使用 HTML5 History 模式，所以可以直接通过 URL 访问，Nginx 配置了 `try_files` 支持路由跳转。

## 常见问题

### Q1: 页面刷新后出现 404

**原因**：Nginx 没有正确配置 Vue Router 的 History 模式。

**解决**：确保 nginx.conf 中有以下配置：

```nginx
location / {
    alias /etc/nginx/html/dist/;
    try_files $uri $uri/ /index.html;
    index index.html;
}
```

### Q2: Cesium 或 River 资源加载失败

**原因**：静态资源路径不正确。

**解决**：
1. 确认 `/etc/nginx/html/cesium/` 和 `/etc/nginx/html/river_sc/` 目录存在
2. 检查文件权限：`sudo chmod -R 755 /etc/nginx/html/`

### Q3: 修改代码后没有生效

**原因**：没有重新构建或上传。

**解决**：
1. 本地执行 `npm run build`
2. 重新上传 `dist` 文件夹
3. 清除浏览器缓存

### Q4: Git 提交时包含了 node_modules

**原因**：`.gitignore` 没有生效。

**解决**：
```bash
# 如果 node_modules 已经被追踪，先移除
git rm -r --cached node_modules/
git rm -r --cached dist/

# 然后提交
git add .gitignore
git commit -m "Update .gitignore"
```

## 开发工作流程

### 日常开发

1. 修改代码
2. 本地测试：`npm run dev`
3. 构建：`npm run build`
4. 上传 `dist/` 到服务器
5. 重新加载 Nginx

### Git 提交

由于 `.gitignore` 已配置，以下文件不会被提交：
- ✅ `node_modules/` - 排除
- ✅ `dist/` - 排除
- ✅ `package-lock.json` - 排除

提交时只需：
```bash
git add .
git commit -m "your message"
git push
```

### 在另一台机器上开发

1. 克隆代码
2. 进入 `html` 目录
3. 运行 `npm install`
4. 开始开发

## 性能优化建议

### 1. 启用 Gzip 压缩

在 nginx.conf 的 `http` 块中添加：

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
```

### 2. 调整缓存策略

- HTML 文件：不缓存（已配置）
- JS/CSS 资源：长期缓存（已配置 30 天）
- Cesium/River 资源：中期缓存（已配置 7 天）

### 3. CDN 加速（可选）

可以考虑将静态资源（Cesium、River）上传到 CDN，加快全国访问速度。

## 备份建议

建议定期备份以下内容：
1. `/etc/nginx/html/` - 所有网站文件
2. `/etc/nginx/nginx.conf` - Nginx 配置

备份命令示例：
```bash
tar -czf fungis-backup-$(date +%Y%m%d).tar.gz /etc/nginx/html/ /etc/nginx/nginx.conf
```

## 联系支持

如遇到问题，请检查：
1. Nginx 错误日志
2. 浏览器控制台错误
3. 网络请求是否成功

祝部署顺利！🚀
