@echo off
chcp 65001 >nul
echo 正在检查并启动 8088 Nginx 矢量切片服务...

cd /d D:\nginx-1.20.2
tasklist /fi "imagename eq nginx.exe" | findstr "nginx.exe" >nul
if %errorlevel% equ 0 (
    echo [提示] 检测到已存在运行中的 Nginx 进程
)

start nginx.exe
timeout /t 1 >nul
netstat -ano | findstr ":8088" >nul
if %errorlevel% equ 0 (
    echo [成功] Nginx 8088 矢量切片服务已正常监听！
) else (
    echo [警告] 8088 端口暂未检测到监听，请检查 D:\nginx-1.20.2\logs\error.log
)
pause
