@echo off
chcp 65001 >nul
echo ==========================================
echo   FUNGIS 地图平台 - 开发环境启动
echo ==========================================
echo.

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [1/2] 首次运行，正在安装依赖...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ❌ 依赖安装失败！
        echo 请检查：
        echo 1. 是否已安装 Node.js
        echo 2. 网络连接是否正常
        pause
        exit /b 1
    )
    echo.
    echo ✅ 依赖安装完成！
    echo.
) else (
    echo ✅ 依赖已存在
    echo.
)

echo [2/2] 启动开发服务器...
echo.
echo 启动后请访问：http://localhost:3000
echo 按 Ctrl+C 可以停止服务器
echo.
echo ==========================================
echo.

call npm run dev
