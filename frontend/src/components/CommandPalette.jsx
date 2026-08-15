import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Bot,
  Layers,
  Image,
  Film,
  Music,
  Wrench,
  FileText,
  CheckCircle2,
  Bell,
  Zap,
  ArrowRight,
  Home,
  Shield,
  PenTool,
  Languages,
  BarChart3,
  Presentation,
  Table2,
  Share2,
  TrendingUp,
  Code2,
  Puzzle,
  Rocket,
  Send,
  Smartphone,
  Gamepad2,
  Smile,
  Mic2,
  Sticker,
  UserCircle,
  GalleryVerticalEnd,
  Store,
  Globe,
  Volume2,
  Monitor,
  Landmark,
  Target,
  FileSearch,
  Activity,
  BookOpen,
  Database,
  MessageSquare,
  Heart,
  HelpCircle,
  Crown,
  Radar,
  User,
  History,
} from 'lucide-react'
import api from '../lib/api'

const COMMANDS = [
  // 导航
  {
    id: 'nav-home',
    label: '首页',
    description: '返回工作台首页',
    icon: Home,
    path: '/home',
    category: '导航',
  },



  // 内容创作
  {
    id: 'nav-image',
    label: '图片工厂',
    description: 'AI 图片生成',
    icon: Image,
    path: '/image-factory',
    category: '内容创作',
  },
  {
    id: 'nav-video',
    label: '视频工厂',
    description: 'AI 视频生成',
    icon: Film,
    path: '/video-factory',
    category: '内容创作',
  },
  {
    id: 'nav-music',
    label: '音乐工厂',
    description: 'AI 音乐生成',
    icon: Music,
    path: '/music-factory',
    category: '内容创作',
  },
  {
    id: 'nav-copywriting',
    label: '文案工厂',
    description: 'AI 文案生成',
    icon: PenTool,
    path: '/copywriting',
    category: '内容创作',
  },
  {
    id: 'nav-translation',
    label: '翻译中心',
    description: 'AI 多语言翻译',
    icon: Languages,
    path: '/translation',
    category: '内容创作',
  },
  {
    id: 'nav-ppt',
    label: 'PPT 生成',
    description: 'AI PPT 大纲生成',
    icon: Presentation,
    path: '/ppt-factory',
    category: '内容创作',
  },
  {
    id: 'nav-meme',
    label: '表情包工坊',
    description: '文字一键生成表情包',
    icon: Sticker,
    path: '/meme',
    category: '内容创作',
  },

  // AI 工坊
  {
    id: 'nav-digital-human',
    label: 'AI数字人',
    description: '文案→配音→口播视频，虚拟形象',
    icon: UserCircle,
    path: '/digital-human',
    category: 'AI工坊',
  },
  {
    id: 'nav-voice-chat',
    label: '语音对话',
    description: '浏览器语音识别 + AI智能回复',
    icon: Mic2,
    path: '/voice-chat',
    category: 'AI工坊',
  },
  {
    id: 'nav-video-analyzer',
    label: '视频理解',
    description: '上传视频，AI分析内容、字幕、场景',
    icon: Monitor,
    path: '/video-analyzer',
    category: 'AI工坊',
  },
  {
    id: 'nav-mindmap',
    label: '思维导图',
    description: '输入主题 → AI生成结构化导图',
    icon: Share2,
    path: '/mindmap',
    category: 'AI工坊',
  },
  {
    id: 'nav-forecast',
    label: '数据预测',
    description: '上传CSV → AI趋势分析 + 预测',
    icon: TrendingUp,
    path: '/forecast',
    category: 'AI工坊',
  },
  {
    id: 'nav-doc-qa',
    label: '文档问答',
    description: '上传文档，AI理解后自由提问',
    icon: Search,
    path: '/doc-qa',
    category: 'AI工坊',
  },
  {
    id: 'nav-web-search',
    label: '联网搜索',
    description: 'AI联网搜索 + 智能摘要 + 来源引用',
    icon: Globe,
    path: '/web-search',
    category: 'AI工坊',
  },

  // 应用与社区
  {
    id: 'nav-games',
    label: '小游戏工坊',
    description: 'AI 生成双版本小游戏',
    icon: Gamepad2,
    path: '/games',
    category: '应用与社区',
  },
  {
    id: 'nav-miniapp',
    label: '小程序工坊',
    description: 'AI 生成微信小程序',
    icon: Smartphone,
    path: '/miniapp',
    category: '应用与社区',
  },
  {
    id: 'nav-voice-dubbing',
    label: '配音工坊',
    description: '文字转语音，场景预设',
    icon: Volume2,
    path: '/voice-dubbing',
    category: '应用与社区',
  },
  {
    id: 'nav-publish',
    label: '发布中心',
    description: '一键发布公众号、抖音、快手 + 排期',
    icon: Send,
    path: '/publish',
    category: '应用与社区',
  },
  {
    id: 'nav-growth',
    label: '增长工坊',
    description: '用户增长与数据分析',
    icon: Target,
    path: '/growth',
    category: '应用与社区',
  },
  {
    id: 'nav-gallery',
    label: '作品广场',
    description: '全平台作品聚合浏览、点赞、评论',
    icon: GalleryVerticalEnd,
    path: '/gallery',
    category: '应用与社区',
  },

  // 办公效率
  {
    id: 'nav-tool-hub',
    label: '效率工具箱',
    description: 'AI 效率工具集合',
    icon: Wrench,
    path: '/tool-hub',
    category: '办公',
  },
  {
    id: 'nav-excel',
    label: 'Excel 助手',
    description: 'AI 数据分析',
    icon: Table2,
    path: '/excel',
    category: '办公',
  },
  {
    id: 'nav-stock',
    label: '股票分析',
    description: 'AI 行情研判',
    icon: Landmark,
    path: '/stock',
    category: '办公',
  },
  {
    id: 'nav-pdf-tools',
    label: 'PDF工具集',
    description: 'PDF合并拆分 + 合同审查 + 简历优化',
    icon: FileSearch,
    path: '/pdf-tools',
    category: '办公',
  },
  {
    id: 'nav-data-analyzer',
    label: '数据分析',
    description: '上传数据智能分析洞察',
    icon: BarChart3,
    path: '/data-analyzer',
    category: '办公',
  },

  // 运营分析
  {
    id: 'nav-dashboard',
    label: '数据仪表盘',
    description: '平台数据概览',
    icon: BarChart3,
    path: '/dashboard',
    category: '运营',
  },
  {
    id: 'nav-strategy',
    label: '内容策略',
    description: 'AI 内容营销策略规划',
    icon: Target,
    path: '/strategy',
    category: '运营',
  },
  {
    id: 'nav-monitor',
    label: '竞品监控',
    description: '竞品动态持续追踪',
    icon: Radar,
    path: '/monitor',
    category: '运营',
  },
  {
    id: 'nav-records',
    label: '用量记录',
    description: '历史用量与账单记录',
    icon: History,
    path: '/records',
    category: '运营',
  },

  {
    id: 'nav-help',
    label: '帮助中心',
    description: '使用指南与常见问题',
    icon: HelpCircle,
    path: '/help',
    category: '系统',
  },
  {
    id: 'nav-profile',
    label: '个人中心',
    description: '账号信息与偏好设置',
    icon: User,
    path: '/profile',
    category: '系统',
  },
  {
    id: 'nav-favorites',
    label: '收藏中心',
    description: '收藏的模板与内容',
    icon: Heart,
    path: '/favorites',
    category: '系统',
  },

  {
    id: 'nav-tasks',
    label: '任务中心',
    description: '管理所有任务',
    icon: CheckCircle2,
    path: '/tasks',
    category: '其他',
  },
  {
    id: 'nav-notifications',
    label: '通知中心',
    description: '查看所有通知',
    icon: Bell,
    path: '/notifications',
    category: '其他',
  },
]

// 全局平台搜索结果的图标/配色（与后端 /api/search/global 的 type 对应）
const GLOBAL_ICONS = {
  agents: Bot,
  skills: BookOpen,
  workflows: Layers,
  tools: Wrench,
  docs: Database,
  history: MessageSquare,
  requirement: FileText,
  // v22.1：创作工厂作品
  image: Image,
  video: Film,
  audio: Music,
  lyrics: FileText,
  meme: Smile,
  game: Gamepad2,
  miniapp: Smartphone,
}
const GLOBAL_CLS = {
  agents: 'bg-violet-100 text-violet-600',
  skills: 'bg-emerald-100 text-emerald-600',
  workflows: 'bg-blue-100 text-blue-600',
  tools: 'bg-amber-100 text-amber-600',
  docs: 'bg-cyan-100 text-cyan-600',
  history: 'bg-gray-100 text-gray-600',
  requirement: 'bg-brand-100 text-brand-600',
  // v22.1：创作工厂作品
  image: 'bg-pink-100 text-pink-600',
  video: 'bg-rose-100 text-rose-600',
  audio: 'bg-violet-100 text-violet-600',
  lyrics: 'bg-fuchsia-100 text-fuchsia-600',
  meme: 'bg-orange-100 text-orange-600',
  game: 'bg-indigo-100 text-indigo-600',
  miniapp: 'bg-teal-100 text-teal-600',
}

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [globalResults, setGlobalResults] = useState([])
  const inputRef = useRef(null)

  // 查询词（须在 useEffect 依赖数组引用之前声明，避免 TDZ）
  const q = query.trim().toLowerCase()

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setGlobalResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // 全局平台搜索（防抖 300ms；需求/流水线已在本地匹配，这里只查扩展类型）
  useEffect(() => {
    if (!isOpen || q.length < 2) {
      setGlobalResults([])
      return
    }
    const timer = setTimeout(() => {
      api
        .post('/api/search/global', {
          query: q,
          types: ['tools', 'docs', 'works'],
          limit: 5,
        })
        .then((r) => setGlobalResults((r.data?.results || []).slice(0, 5)))
        .catch(() => setGlobalResults([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [q, isOpen])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) {
          onClose()
        } else {
          window.dispatchEvent(new CustomEvent('open-command-palette'))
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // 过滤静态命令
  const filteredCommands = COMMANDS.filter((cmd) => {
    if (!q) return true
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    )
  })

  // 扁平化可执行项（动态优先），保证键盘导航索引一致
  const dynamicItems = [
    // 全局平台搜索结果（工具/文档/作品）
    ...globalResults.map((r) => ({
      id: `g-${r.type}-${r.id}`,
      kind: 'global',
      label: r.title || r.id,
      description: `${r.module || r.category || r.type} · ${(r.description || '').slice(0, 50)}`,
      icon: GLOBAL_ICONS[r.type] || Search,
      iconCls: GLOBAL_CLS[r.type] || 'bg-gray-100 text-gray-600',
      path: r.path,
    })),
  ]

  const flatItems = [...dynamicItems, ...filteredCommands]
  const flatIndexMap = {}
  flatItems.forEach((item, i) => {
    flatIndexMap[item.id] = i
  })

  // 按类别分组静态命令
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = []
    acc[cmd.category].push(cmd)
    return acc
  }, {})

  // 键盘导航
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems[selectedIndex]
      if (item) executeItem(item)
    }
  }

  const executeItem = (item) => {
    navigate(item.path)
    onClose()
  }

  if (!isOpen) return null

  const renderItem = (item, flatIndex) => {
    const isSelected = flatIndex === selectedIndex
    const Icon = item.icon
    return (
      <button
        key={item.id}
        onClick={() => executeItem(item)}
        onMouseEnter={() => setSelectedIndex(flatIndex)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
          item.highlight ? 'bg-gradient-to-r from-brand-500/5 to-indigo-500/5' : ''
        } ${isSelected ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'}`}
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            item.highlight
              ? 'bg-gradient-to-br from-brand-500 to-indigo-600 shadow-sm'
              : isSelected
                ? 'bg-brand-100'
                : item.iconCls || 'bg-gray-100'
          }`}
        >
          <Icon className={`w-4 h-4 ${item.highlight ? 'text-white' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium truncate ${item.highlight ? 'text-brand-700' : ''}`}
            >
              {item.label}
            </span>
            {item.highlight && (
              <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-bold flex-shrink-0">
                新
              </span>
            )}
            {item.dotCls && (
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dotCls}`} />
            )}
          </div>
          <div className="text-xs text-gray-500 truncate">{item.description}</div>
        </div>
        {isSelected && <ArrowRight className="w-4 h-4 text-brand-500 flex-shrink-0" />}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 命令面板 */}
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* 搜索框 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索需求、流水线、命令…（输入即可跳转）"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          <kbd className="px-2 py-0.5 text-xs text-gray-400 bg-gray-100 rounded">ESC</kbd>
        </div>

        {/* 结果列表 */}
        <div className="max-h-96 overflow-y-auto py-2">
          {flatItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">没有找到匹配项</p>
              <p className="text-xs mt-1">试试搜索「需求」「部署」「图片」等关键词</p>
            </div>
          ) : (
            <>
              {/* 动态搜索结果 */}
              {dynamicItems.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase">
                    {q ? '搜索结果' : '最近使用'}
                  </div>
                  {dynamicItems.map((item, i) => renderItem(item, i))}
                  {filteredCommands.length > 0 && (
                    <div className="mx-4 my-2 border-t border-gray-100" />
                  )}
                </div>
              )}
              {/* 静态命令 */}
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category}>
                  <div className="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase">
                    {category}
                  </div>
                  {cmds.map((cmd) => renderItem(cmd, flatIndexMap[cmd.id]))}
                </div>
              ))}
            </>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↑↓</kbd>
              导航
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↵</kbd>
              执行
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">⌘K</kbd>
              唤起
            </span>
          </div>
          <span>{flatItems.length} 个结果</span>
        </div>
      </div>
    </div>
  )
}
