import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

// 首帧主题同步：渲染前恢复深色模式，避免闪烁
;(function initTheme() {
  try {
    const saved = localStorage.getItem('theme')
    const dark =
      saved === 'dark' || (!saved && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  } catch {
    /* ignore */
  }
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// 本地版不使用 Service Worker（避免升级后缓存旧版资源导致页面 MIME 报错）。
// 若浏览器里残留旧版注册的 SW，这里主动注销并清缓存。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) reg.unregister()
    })
    if (window.caches?.keys) {
      window.caches.keys().then((keys) => keys.forEach((k) => window.caches.delete(k)))
    }
  })
}
