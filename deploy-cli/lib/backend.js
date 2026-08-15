/**
 * 后端启动：spawn Python 进程 + 等待健康检查就绪
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { BACKEND_DIR } from './bootstrap.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DB_PATH_STABLE, preserveData } from './download.js'

let backendProc = null

/**
 * 检测端口是否可用（未被监听）
 */
export function isPortFree(port) {
  return new Promise((resolvePromise) => {
    const tester = net.createServer()
    tester.once('error', () => resolvePromise(false)) // 被占用
    tester.once('listening', () => {
      tester.close(() => resolvePromise(true))
    })
    tester.listen(port, '0.0.0.0')
  })
}

/**
 * 找到可用端口：从首选开始递增探测（最多 MAX_TRIES 次）
 */
export async function findFreePort(preferred, maxTries = 10) {
  for (let i = 0; i < maxTries; i++) {
    const candidate = preferred + i
    if (await isPortFree(candidate)) return candidate
  }
  return null
}

/**
 * 启动 Python 后端（后台进程），自动处理端口冲突
 * @param {string} venvPython venv 内 python 路径
 * @param {number} preferredPort 首选端口
 * @returns {Promise<number>} 实际使用的端口
 */
export async function startBackend(venvPython, preferredPort = 8888) {
  const entry = existsSync(join(BACKEND_DIR, 'app_creation.py')) ? 'app_creation.py' : 'main.py'
  if (!existsSync(join(BACKEND_DIR, entry))) {
    throw new Error(`后端源码缺失: ${BACKEND_DIR}`)
  }

  // 端口冲突检测：被占用则自动递增找可用端口
  let port = preferredPort
  if (!(await isPortFree(port))) {
    console.log(`  ⚠️  端口 ${port} 已被占用，正在寻找可用端口...`)
    const free = await findFreePort(port)
    if (free === null) {
      throw new Error(`端口 ${port}~${port + 9} 全部被占用，请用 --backend-port 指定其他端口`)
    }
    port = free
    console.log(`  ✅ 已改用端口 ${port}（可用）`)
  }

  // 用户数据（中转站 Key 等）使用独立于源码缓存的稳定数据库路径，升级不丢
  preserveData()
  console.log('  ⚙️  正在启动后端...')
  backendProc = spawn(venvPython, [entry], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(port), DB_PATH: DB_PATH_STABLE },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProc.stdout.on('data', (d) => {
    const line = d.toString().trim()
    if (line && !line.includes('INFO:') && !line.includes('WARNING')) {
      console.log(`     [backend] ${line.slice(0, 200)}`)
    }
  })
  backendProc.stderr.on('data', (d) => {
    const line = d.toString().trim()
    if (!line) return
    // 过滤正常访问日志（observability 中间件把每次请求都打到 stderr）：
    // 状态 < 400 的请求日志是正常信息，不显示，避免 [backend:err] 刷屏
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object' && obj.request_id && typeof obj.status === 'number') {
        if (obj.status < 400) return
      }
    } catch {
      /* 非 JSON 日志（Traceback/警告等）正常显示 */
    }
    console.log(`     [backend:err] ${line.slice(0, 200)}`)
  })

  backendProc.on('exit', (code, signal) => {
    if (signal) {
      // 被信号终止（Ctrl+C / 终端中断等），非崩溃
      console.log(`  ⏹  后端进程退出（收到信号 ${signal}）——如非手动 Ctrl+C，请检查是否有旧实例/终端关闭`)
    } else {
      console.log(`  ⏹  后端进程退出（code=${code}）`)
    }
  })

  process.on('SIGINT', () => {
    if (backendProc) backendProc.kill('SIGTERM')
  })

  return port
}

/**
 * 等待后端健康检查就绪
 * @param {number} port 后端端口
 * @param {number} timeoutSec 超时秒数
 */
export async function waitForBackend(port, timeoutSec = 120) {
  const deadline = Date.now() + timeoutSec * 1000
  while (Date.now() < deadline) {
    if (await isHealthy(port)) return true
    await sleep(1500)
  }
  throw new Error(`后端在 ${timeoutSec}s 内未就绪，请检查日志`)
}

function isHealthy(port) {
  return new Promise((resolvePromise) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 3000 }, (res) => {
      res.resume()
      resolvePromise(res.statusCode === 200)
    })
    req.on('error', () => resolvePromise(false))
    req.on('timeout', () => {
      req.destroy()
      resolvePromise(false)
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
