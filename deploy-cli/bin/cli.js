#!/usr/bin/env node
/**
 * 小团智能平台（Code-Platform）一键部署 CLI
 *
 * 用法：
 *   npx @xiaotuan/code-platform web            # 完整启动（前端 + 后端）
 *   npx @xiaotuan/code-platform web --port 3000 --backend-port 8888
 *   npx @xiaotuan/code-platform backend        # 仅启动后端
 *   npx @xiaotuan/code-platform frontend       # 仅启动前端静态服务
 *
 * 原理（参考 DSH 的 npx 机制）：
 *   - 检测系统 Python 3.10+ → 引导/复用项目 .venv（pip install requirements.txt）
 *   - 前端 dist 内置于本包 frontend-dist/（Vite 构建产物，7MB）
 *   - 启动 Python 后端（main.py :8888）+ Node.js SPA 静态服务器（含 /api 反向代理）
 *   - 免服务器：用户本地一键 `npx` 即可运行完整平台
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

import { Command } from 'commander'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootstrapPython, findPython, getPythonVersion } from '../lib/bootstrap.js'
import { ensureBackend } from '../lib/download.js'
import { startFrontend } from '../lib/server.js'
import { startBackend, waitForBackend } from '../lib/backend.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = join(__dirname, '..')
const DIST_PATH = join(PKG_ROOT, 'frontend-dist')
const PKG_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8')).version
  } catch {
    return '0.0.0'
  }
})()

// 启动时异步检查 npm 最新版本（镜像滞后/旧缓存时提示升级命令）
async function checkLatestVersion() {
  try {
    const res = await fetch('https://registry.npmjs.org/@ryan-myp%2Fcode-platform/latest', {
      headers: { 'User-Agent': 'code-platform-cli' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return
    const data = await res.json()
    const latest = data.version
    if (latest && latest !== PKG_VERSION) {
      console.log('')
      console.log(`  ⚠️  检测到新版本 ${latest}（当前 ${PKG_VERSION}）`)
      console.log('     若镜像同步滞后导致 npx 拉到旧版，请用官方源安装：')
      console.log('     npx --registry=https://registry.npmjs.org @ryan-myp/code-platform web')
      console.log('     或清缓存重装：rm -rf ~/.npm/_npx ~/.cache/code-platform')
      console.log('')
    }
  } catch {
    // 网络不可用/超时：静默跳过
  }
}

const program = new Command()
program
  .name('code-platform')
  .description('小团智能平台 — 内容创作一键部署（本地免费、免登录）')
  .version(PKG_VERSION)

program
  .command('web')
  .description('启动完整平台（Python 后端 + React 前端）')
  .option('--port <number>', '前端端口', '3000')
  .option('--backend-port <number>', '后端端口', '8888')
  .option('--install-deps', '强制重新安装 Python 依赖', false)
  .option('--no-frontend', '仅启动后端')
  .option('--no-backend', '仅启动前端')
  .action(async (options) => {
    const { port, backendPort, installDeps } = options
    const wantFrontend = options.frontend !== false
    const wantBackend = options.backend !== false

    console.log('')
    console.log('  🚀 小团智能平台 · 一键部署')
    console.log('  ═══════════════════════════════════')

    // ── 1. 检测 Python ─────────────────────────────────────
    const pythonBin = findPython()
    if (!pythonBin) {
      console.error('  ❌ 未检测到 Python 3.10+，请先安装：https://www.python.org/downloads/')
      process.exit(1)
    }
    const pyVer = await getPythonVersion(pythonBin)
    console.log(`  ✅ Python: ${pyVer} (${pythonBin})`)

    // ── 1.5 确保后端源码可用（仓库内/缓存/GitHub 下载） ──
    if (wantBackend) {
      const backendPath = await ensureBackend()
      console.log(`  📂 后端源码: ${backendPath}`)
    }

    // ── 2. 引导 .venv（复用或重建） ───────────────────────
    let venvPython = null
    if (wantBackend) {
      venvPython = await bootstrapPython(installDeps)
      console.log('  ✅ Python 虚拟环境就绪')
    }

    // ── 3. 启动后端 ────────────────────────────────────────
    let backendUrl = null
    if (wantBackend) {
      const actualBackendPort = await startBackend(venvPython, Number(backendPort))
      backendUrl = `http://127.0.0.1:${actualBackendPort}`
      await waitForBackend(actualBackendPort, 120)
      console.log(`  ✅ 后端已就绪: ${backendUrl}`)
    }

    // ── 4. 启动前端静态服务 ────────────────────────────────
    if (wantFrontend) {
      if (!existsSync(join(DIST_PATH, 'index.html'))) {
        console.error(`  ❌ 前端构建产物缺失: ${DIST_PATH}`)
        process.exit(1)
      }
      // 前端端口冲突自动处理
      let frontendPort = Number(port)
      const { isPortFree: _isFree } = await import('../lib/backend.js')
      if (!(await _isFree(frontendPort))) {
        const { findFreePort: _findFree } = await import('../lib/backend.js')
        const free = await _findFree(frontendPort)
        if (free === null) {
          console.error(`  ❌ 端口 ${frontendPort}~${frontendPort + 9} 全部被占用，请用 --port 指定其他端口`)
          process.exit(1)
        }
        console.log(`  ⚠️  前端端口 ${frontendPort} 已被占用，改用 ${free}`)
        frontendPort = free
      }
      await startFrontend(DIST_PATH, frontendPort, backendUrl)
      console.log(`  ✅ 前端静态服务已启动: http://localhost:${frontendPort}`)
    }

    console.log('')
    console.log('  ═══════════════════════════════════')
    console.log('  ✨ 平台已就绪！')
    // 打印「实际」端口（端口冲突自动切换后，这里必须是 frontendPort 而非请求端口）
    if (wantFrontend) console.log(`     🌐 前端:  http://localhost:${frontendPort}`)
    if (wantBackend) console.log(`     ⚙️ 后端:  ${backendUrl}`)
    console.log('')
    console.log('  ⚠️  请以浏览器打开上方「前端」地址；若端口冲突自动改号，以实际端口为准')
    console.log('  💡 自定义端口：npx @ryan-myp/code-platform web --port 8080 --backend-port 9000')
    console.log('')
    // 后台检查最新版本（不阻塞启动）
    checkLatestVersion()
  })

program
  .command('backend')
  .description('仅启动后端（8888 端口）')
  .option('--port <number>', '后端端口', '8888')
  .action(async (options) => {
    await ensureBackend()
    const pythonBin = findPython()
    if (!pythonBin) {
      console.error('❌ 未检测到 Python 3.10+')
      process.exit(1)
    }
    const venvPython = await bootstrapPython(false)
    const actualPort = await startBackend(venvPython, Number(options.port))
    await waitForBackend(actualPort, 120)
    console.log(`✅ 后端已就绪: http://127.0.0.1:${actualPort}`)
  })

program
  .command('frontend')
  .description('仅启动前端静态服务')
  .option('--port <number>', '前端端口', '3000')
  .option('--api <url>', '后端 API 地址', 'http://127.0.0.1:8888')
  .action(async (options) => {
    if (!existsSync(join(DIST_PATH, 'index.html'))) {
      console.error(`❌ 前端构建产物缺失: ${DIST_PATH}`)
      process.exit(1)
    }
    await startFrontend(DIST_PATH, Number(options.port), options.api)
    console.log(`✅ 前端已就绪: http://localhost:${options.port}（API → ${options.api}）`)
  })

program
  .command('doctor')
  .description('检查环境是否满足运行条件')
  .action(async () => {
    console.log('🔍 环境检查...')
    const pythonBin = findPython()
    if (pythonBin) {
      console.log(`  ✅ Python: ${await getPythonVersion(pythonBin)}`)
    } else {
      console.log('  ❌ Python 3.10+ 未找到')
    }
    console.log(`  ✅ Node.js: ${process.version}`)
    console.log(`  ✅ 前端产物: ${existsSync(join(DIST_PATH, 'index.html')) ? '存在 (' + formatSize(DIST_PATH) + ')' : '缺失'}`)
    const venvOk = existsSync(join(process.cwd(), '.venv', 'bin', 'python'))
    console.log(`  ${venvOk ? '✅' : '⚠️'} 项目 .venv: ${venvOk ? '已存在（可复用）' : '首次运行将自动创建'}`)
  })

function formatSize(dir) {
  const { statSync, readdirSync } = require('node:fs')
  let total = 0
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else total += st.size
    }
  }
  walk(dir)
  return (total / 1024 / 1024).toFixed(1) + 'MB'
}

program.parse()
