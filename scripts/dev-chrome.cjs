const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const DEV_URL = 'http://localhost:3000'

function openChrome(url) {
  const candidates = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean)

  const chromeExe = candidates.find((p) => fs.existsSync(p))

  if (chromeExe) {
    const chrome = spawn(chromeExe, [url], {
      detached: true,
      stdio: 'ignore'
    })
    chrome.unref()
    return
  }

  const fallback = spawn('cmd.exe', ['/c', 'start', '', 'chrome', url], {
    detached: true,
    stdio: 'ignore'
  })
  fallback.unref()
}

if (!fs.existsSync(VITE_BIN)) {
  console.error('未找到 Vite，可先执行 npm install')
  process.exit(1)
}

const vite = spawn(process.execPath, [VITE_BIN], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit'
})

setTimeout(() => {
  openChrome(DEV_URL)
}, 1500)

vite.on('exit', (code) => {
  process.exit(code ?? 0)
})

vite.on('error', (error) => {
  console.error('启动开发服务器失败:', error)
  process.exit(1)
})
