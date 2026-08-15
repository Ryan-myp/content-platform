/**
 * 后端源码获取（三级策略）
 *  1. 本地项目已存在（在 Code-Platform 仓库内运行）→ 直接复用
 *  2. 本地缓存已存在（~/.cache/code-platform/backend）→ 复用
 *  3. 从 GitHub Release 下载后端源码 tarball → 解压到缓存
 *
 * 这样 npm 包保持轻量（仅前端 7MB），后端源码独立分发。
 */
import { existsSync, mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))

// GitHub 仓库配置（发布后改为实际仓库）
export const REPO_OWNER = 'Ryan-myp'
export const REPO_NAME = 'content-platform'
export const REPO_BRANCH = 'main'
export const GITHUB_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.tar.gz`

// 本地缓存目录
export const CACHE_DIR = join(os.homedir(), '.cache', 'code-platform')
export const BACKEND_CACHE = join(CACHE_DIR, 'backend')
// 后端缓存对应的 npm 包版本标记（升级时自动失效并重新下载）
const BACKEND_VERSION_MARKER = join(CACHE_DIR, '.backend_version')

/**
 * 定位后端目录（backend/）
 * 返回 null 表示需要下载
 */
export function findLocalBackend() {
  // 1. 项目仓库内运行：<pkg>/../.. = 仓库根（完整版 main.py 或独立创作版 app_creation.py）
  const repoBackend = join(__dirname, '..', '..', 'backend')
  if (existsSync(join(repoBackend, 'main.py')) || existsSync(join(repoBackend, 'app_creation.py'))) {
    return { path: repoBackend, source: 'repo' }
  }
  // 2. 本地缓存（带 npm 版本校验：包升级后自动重下，避免旧后端无新接口）
  if (existsSync(join(BACKEND_CACHE, 'main.py')) || existsSync(join(BACKEND_CACHE, 'app_creation.py'))) {
    const markerOk = (() => {
      try {
        const pkgVersion = JSON.parse(
          readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
        ).version
        const cached = existsSync(BACKEND_VERSION_MARKER)
          ? readFileSync(BACKEND_VERSION_MARKER, 'utf-8').trim()
          : ''
        return cached === pkgVersion
      } catch {
        return true // 版本读取异常时保守复用缓存（不强制重下）
      }
    })()
    if (markerOk) {
      return { path: BACKEND_CACHE, source: 'cache' }
    }
    console.log(`  🔄 npm 包已升级：后端缓存将刷新（删除旧缓存）`)
    try { execFileSync('rm', ['-rf', BACKEND_CACHE]) } catch {}
  }
  return null
}

/**
 * 确保后端源码可用，返回后端目录路径
 */
export async function ensureBackend() {
  const local = findLocalBackend()
  if (local) {
    console.log(`  📂 后端源码: ${local.source === 'repo' ? '项目仓库内' : '本地缓存'}`)
    return local.path
  }

  console.log(`  📥 首次运行：正在从 GitHub 下载后端源码...`)
  console.log('     ' + GITHUB_URL)
  mkdirSync(CACHE_DIR, { recursive: true })

  const tarball = join(CACHE_DIR, 'backend.tar.gz')
  try {
    await downloadFile(GITHUB_URL, tarball)
  } catch (e) {
    // 清理残留
    try { execFileSync('rm', ['-f', tarball]) } catch {}
    console.error(`  ❌ 后端源码下载失败：${e.message}`)
    console.error('')
    console.error('  两种解决方式：')
    console.error('  1. 将本项目克隆到本地后，在仓库根目录运行（deploy-cli 已包含）：')
    console.error('     git clone <repo-url> && cd code-platform && npx @xiaotuan/code-platform web')
    console.error(  `  2. 确认发布仓库 ${REPO_OWNER}/${REPO_NAME} 存在且包含 backend/ 目录`)
    console.error('')
    process.exit(1)
  }

  // 解压：tarball 首层是 <repo>-<branch>/（如 content-platform-main/），
  // strip 掉首层后得到 backend/、deploy-cli/ 等 → 解压到 CACHE_DIR 而非 BACKEND_CACHE，
  // 否则会多一层（backend/backend/）导致找不到 main.py 与 requirements.txt。
  console.log('  📦 解压中...')
  if (existsSync(BACKEND_CACHE)) {
    execFileSync('rm', ['-rf', BACKEND_CACHE])
  }
  mkdirSync(CACHE_DIR, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', CACHE_DIR, '--strip-components=1'])
  execFileSync('rm', [tarball])

  if (!existsSync(BACKEND_CACHE)) {
    throw new Error(`下载解压后未找到 backend/ 目录：${CACHE_DIR}`)
  }
  console.log('  ✅ 后端源码就绪（缓存至 ' + BACKEND_CACHE + '）')
  // 记录后端缓存对应的 npm 包版本（下次启动据此判断是否需要刷新）
  try {
    const pkgVersion = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
    ).version
    writeFileSync(BACKEND_VERSION_MARKER, pkgVersion)
  } catch {}
  return BACKEND_CACHE
}

/**
 * 下载文件（HTTPS，带重定向与进度）
 */
function downloadFile(url, dest) {
  return new Promise((resolvePromise, reject) => {
    const file = createWriteStream(dest)
    const req = https.get(url, { headers: { 'User-Agent': 'code-platform-cli' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 重定向
        file.close()
        execFileSync('rm', [dest])
        return downloadFile(res.headers.location, dest).then(resolvePromise).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        execFileSync('rm', [dest])
        return reject(new Error(`下载失败：HTTP ${res.statusCode}`))
      }
      pipeline(res, file)
        .then(() => resolvePromise())
        .catch(reject)
    })
    req.on('error', (e) => {
      file.close()
      reject(e)
    })
  })
}
