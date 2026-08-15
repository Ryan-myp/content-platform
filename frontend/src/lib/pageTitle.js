/**
 * v17-F 路由级页面标题：浏览器标签页标题跟随路由变化。
 * TOOL_META 之外补充通用页/动态页映射，单份数据源供 App.jsx 使用。
 */
import { TOOL_META } from '../hooks/useRecentTools'

// 未收录在 TOOL_META 的通用页标题
const EXTRA_TITLES = {
  '/home': '首页',
  '/login': '登录',
  '/tools': '工具中心',
  '/tool-hub': '工具中心',
  '/not-found': '页面不存在',
}

// 动态路径（/tool/:id 等）：按前缀回退到基础页面标题
const PREFIX_TITLES = {
  '/tool/': 'AI 工具',
}

export const SITE_NAME = 'AI 星火'

export function pageTitleFor(pathname) {
  if (!pathname) return SITE_NAME
  const direct = TOOL_META[pathname]?.label || EXTRA_TITLES[pathname]
  if (direct) return `${direct} - ${SITE_NAME}`
  for (const [prefix, label] of Object.entries(PREFIX_TITLES)) {
    if (pathname.startsWith(prefix)) return `${label} - ${SITE_NAME}`
  }
  return SITE_NAME
}

export default pageTitleFor
