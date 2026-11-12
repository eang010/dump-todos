import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu, Tray, nativeImage, screen } from 'electron'
import { handleApi } from '../lib/api-handler.js'

const PANEL_WIDTH = 400
const PANEL_HEIGHT = 680
const DEV_URL = 'http://127.0.0.1:5173/'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

app.setName('To Do')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

/** @type {BrowserWindow | null} */
let win = null
/** @type {Tray | null} */
let tray = null
/** @type {import('node:child_process').ChildProcess | null} */
let devProcess = null
let openedAt = 0
let blurredShut = false

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

function applyEnvFile(file) {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (key !== 'NOTION_TOKEN' && key !== 'NOTION_DATABASE_ID') continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) process.env[key] = value
  }
}

function envFile() {
  if (app.isPackaged) return path.join(app.getPath('userData'), '.env')
  return path.join(root, '.env')
}

function iconDir() {
  if (app.isPackaged) return process.resourcesPath
  return here
}

function loadTrayIcon() {
  const dir = iconDir()
  const base = nativeImage.createFromPath(path.join(dir, 'iconTemplate.png'))
  const retina = nativeImage.createFromPath(path.join(dir, 'iconTemplate@2x.png'))
  if (base.isEmpty()) throw new Error(`Missing menu bar icon in ${dir}`)
  const icon = nativeImage.createEmpty()
  const { width, height } = base.getSize()
  icon.addRepresentation({ scaleFactor: 1, width, height, buffer: base.toPNG() })
  if (!retina.isEmpty()) {
    icon.addRepresentation({
      scaleFactor: 2,
      width,
      height,
      buffer: retina.toPNG(),
    })
  }
  icon.setTemplateImage(true)
  return icon
}

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(400) })
    return res.status < 500
  } catch {
    return false
  }
}

async function ensureDevServer() {
  if (await isUp(DEV_URL)) return
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  devProcess = spawn(
    'node',
    [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    { cwd: root, stdio: 'inherit' },
  )
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (devProcess.exitCode != null) {
      throw new Error(`Vite exited with ${devProcess.exitCode}`)
    }
    if (await isUp(DEV_URL)) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Vite did not start')
}

function startStaticServer() {
  const dist = path.join(root, 'dist')
  const base = path.resolve(dist)
  const server = createServer(async (req, res) => {
    try {
      if (await handleApi(req, res)) return
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
      const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
      const file = path.resolve(base, rel)
      const fromBase = path.relative(base, file)
      if (fromBase.startsWith('..') || path.isAbsolute(fromBase)) {
        res.statusCode = 403
        res.end()
        return
      }
      const data = await readFile(file)
      const type = MIME[path.extname(file)] || 'application/octet-stream'
      res.setHeader('Content-Type', type)
      res.end(data)
    } catch (err) {
      if (err?.code === 'ENOENT') {
        res.statusCode = 404
        res.end()
        return
      }
      if (!res.writableEnded) {
        res.statusCode = 500
        res.end()
      }
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve(`http://127.0.0.1:${port}/`)
    })
  })
}

function placePanel() {
  const bounds = tray.getBounds()
  const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea
  const width = PANEL_WIDTH
  const height = Math.min(PANEL_HEIGHT, area.height - 8)
  let x = Math.round(bounds.x + bounds.width / 2 - width / 2)
  let y = Math.round(bounds.y + bounds.height + 4)
  x = Math.min(Math.max(x, area.x), area.x + area.width - width)
  y = Math.min(Math.max(y, area.y), area.y + area.height - height)
  win.setBounds({ x, y, width, height }, false)
}

function showPanel() {
  placePanel()
  openedAt = Date.now()
  win.show()
  win.focus()
}

function toggleFromTray() {
  if (blurredShut) return
  if (win.isVisible()) win.hide()
  else showPanel()
}

function showTrayMenu() {
  tray.popUpContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open at Login',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked })
        },
      },
      { type: 'separator' },
      { role: 'quit' },
    ]),
  )
}

function createWindow() {
  win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hiddenInMissionControl: true,
    backgroundColor: '#f3eee6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('blur', () => {
    if (Date.now() - openedAt < 200) return
    blurredShut = true
    win.hide()
    setTimeout(() => {
      blurredShut = false
    }, 150)
  })
  win.on('close', (event) => {
    if (app.isQuitting) return
    event.preventDefault()
    win.hide()
  })
}

app.on('before-quit', () => {
  app.isQuitting = true
  devProcess?.kill('SIGTERM')
})

app.on('second-instance', () => {
  if (win) showPanel()
})

if (gotLock) {
  app.whenReady().then(async () => {
    app.setActivationPolicy('accessory')
    applyEnvFile(envFile())
    const url = app.isPackaged ? await startStaticServer() : DEV_URL
    if (!app.isPackaged) await ensureDevServer()
    createWindow()
    await win.loadURL(url)
    tray = new Tray(loadTrayIcon())
    tray.setToolTip('To Do')
    tray.setIgnoreDoubleClickEvents(true)
    tray.on('click', toggleFromTray)
    tray.on('right-click', showTrayMenu)
  }).catch((err) => {
    console.error(err)
    app.quit()
  })
}
