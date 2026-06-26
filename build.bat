@echo off
chcp 65001 >nul
echo ==========================================
echo   FUNGIS 地图平台 - 生产构建
echo ==========================================
echo.

cd /d "%~dp0"

if not exist "node_modules\" (
    echo ❌ 请先安装依赖！
    echo 运行命令：npm install
    echo 或者运行：start-dev.bat
    pause
    exit /b 1
)

echo [1/2] 清理旧的构建文件...
if exist "dist\" (
    rmdir /s /q "dist"
    echo ✅ 已清理旧文件
) else (
    echo ℹ️ 没有旧文件需要清理
)
echo.

echo [2/2] 开始构建生产版本...
echo.
call npm run build

if errorlevel 1 (
    echo.
    echo ❌ 构建失败！
    echo 请检查代码是否有错误
    pause
    exit /b 1
)

echo.
echo ==========================================
echo ✅ 构建成功！
echo ==========================================
echo.
echo 构建文件位置：%~dp0dist\
echo.
echo 下一步：
echo 1. 使用 SFTP 工具（如 FileZilla）
echo 2. 将 dist 文件夹上传到服务器
echo    目标路径：/etc/nginx/html/dist/
echo 3. 在服务器上执行：sudo systemctl reload nginx
echo.
echo 详细部署步骤请查看：DEPLOY.md
echo ==========================================
pause
