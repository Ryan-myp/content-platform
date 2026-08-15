import React, { useState, useEffect } from 'react'
import {
  Clapperboard,
  Sparkles,
  Play,
  Download,
  Loader2,
  Film,
  UserCircle,
  Bot,
  Clock,
  Subtitles,
  ChevronDown,
  Sliders,
  ChevronUp,
  MonitorPlay,
  RefreshCw,
  PenLine,
  Plus,
  Trash2,
  CheckCircle2,
  Wand2,
  Users,
  Palette,
  FileSpreadsheet,
  ListChecks,
} from 'lucide-react'
import { Card, Button, Badge, Empty, PageHeader, Modal, Pagination,
} from '../components/ui'
import ShareButton from '../components/ShareButton'
import FavoriteButton from '../components/FavoriteButton'
import { useToast } from '../lib/toast'
import api from '../lib/api'
import useAsyncTask from '../hooks/useAsyncTask'
import useToolHistory from '../hooks/useToolHistory'
import HistoryPanel from '../components/HistoryPanel'
import usePersistentToolState from '../hooks/usePersistentToolState'

const DURATIONS = [30, 45, 60, 120, 300, 600]

const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'gentle', 'serious']
const EMOTION_LABEL = {
  neutral: '自然',
  happy: '欢快',
  sad: '悲伤',
  angry: '激昂',
  gentle: '温柔',
  serious: '严肃',
}

const SCENES_EXAMPLE = `[
  {"id": 1, "shot": "城市夜景，主角出场", "narrator": "深夜的城市，故事开始了", "dialogue": "我终于找到了这里", "sec": 5},
  {"id": 2, "shot": "雨中奔跑", "narrator": "一场大雨突然降临", "dialogue": "别跑！", "sec": 5}
]`

export default function ShortDramaPage() {
  // 输入态持久化（刷新/误关不丢创作草稿）
  const [persistForm, setPersistForm] = usePersistentToolState('drama_inputs', {
    theme: '',
    title: '',
    duration: 45,
    customDur: '',
  })
  const [theme, setTheme] = useState(persistForm.theme || '')
  const [title, setTitle] = useState(persistForm.title || '')
  const [duration, setDuration] = useState(persistForm.duration || 45)
  const [customDur, setCustomDur] = useState(persistForm.customDur || '') // v13.28 自定义时长（分钟，支持小数）
  useEffect(() => {
    if (persistForm.theme) setTheme(persistForm.theme)
    if (persistForm.title) setTitle(persistForm.title)
    if (persistForm.customDur) setCustomDur(persistForm.customDur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      setPersistForm({ theme, title, duration, customDur })
    }, 800)
    return () => clearTimeout(t)
  }, [theme, title, duration, customDur, setPersistForm])
  // 剧本 Markdown 单一来源：分享/复制复用（避免内容漂移）
  const buildScriptMd = () => {
    const sd = scriptData
    if (!sd) return ''
    const lines = [`# ${sd.title || title || '短剧剧本'}`, '', `主题：${theme || '—'}`]
    if ((sd.characters || []).length) {
      lines.push('', '## 角色表', ...sd.characters.map((c, i) => `${i + 1}. ${c.name}（${c.desc || ''}）`))
    }
    lines.push('', `## 分镜（${sd.scenes.length} 镜）`)
    sd.scenes.forEach((s, i) => {
      lines.push('', `### 第 ${i + 1} 镜 · ${s.duration || ''}s · ${s.emotion || ''}`)
      if (s.camera) lines.push(`镜头：${s.camera}`)
      if (s.visual) lines.push(`画面：${s.visual}`)
      if (s.dialogue) lines.push(`台词：${s.dialogue}`)
      if (s.keywords) lines.push(`关键词：${s.keywords}`)
    })
    lines.push('', `> 由AI 星火 AI 短剧工厂生成 · ${new Date().toLocaleString()}`)
    return lines.join('\n')
  }
  const copyScript = async () => {
    const md = buildScriptMd()
    if (!md) return
    try {
      await navigator.clipboard.writeText(md)
      toast.success('剧本已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动选择复制')
    }
  }
  const [mode, setMode] = useState('illust') // material=素材 | illust=漫剧(默认,角色一致) | avatar=数字人
  const [avatarId, setAvatarId] = useState('business-female')
  const [dhEngine, setDhEngine] = useState('2d')
  const [scenesJson, setScenesJson] = useState('')
  // v16 自定义分镜表格化：免写 JSON，逐镜编排画面/台词/旁白/时长
  const [customScenes, setCustomScenes] = useState([])
  const [showCustom, setShowCustom] = useState(false)
  const [scriptData, setScriptData] = useState(null) // v13.29 AI 剧本工作台：{title, scenes[]}
  // 红果短剧升级：小说导入 + 系列连载 + 角色圣经
  const [artStyle, setArtStyle] = useState('guoman') // 漫剧画风：guoman/hanman/3d/realistic
  const [dynamicLevel, setDynamicLevel] = useState('auto') // 动态镜头：auto隔场/on全开/off关
  const [novelText, setNovelText] = useState('')
  const [novelBusy, setNovelBusy] = useState(false)
  const [series, setSeries] = useState([])
  const [seriesId, setSeriesId] = useState('')
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [seriesName, setSeriesName] = useState('')
  const [seriesGenre, setSeriesGenre] = useState('都市')
  const [episodeNo, setEpisodeNo] = useState(1)
  const [scripting, setScripting] = useState(false)
  // v22 剧本题材模板库：爆款题材（人设/结构/风格/钩子）注入 AI 编剧
  const [dramaTpls, setDramaTpls] = useState([])
  const [dramaTplId, setDramaTplId] = useState('')
  const [dramaTplInfo, setDramaTplInfo] = useState(null) // 题材详情弹窗
  const [generating, setGenerating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [genTask, setGenTask] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [avatars, setAvatars] = useState([])
  const [playing, setPlaying] = useState(null)
  const [srcCfg, setSrcCfg] = useState(null)
  // Pexels 内联配置（短剧素材模式）
  const [pexelsInput, setPexelsInput] = useState('')
  const [pexelsBusy, setPexelsBusy] = useState(false)
  // v15 分镜表导出 + 素材清单
  const [exportingShots, setExportingShots] = useState(false)
  const [showManifest, setShowManifest] = useState(false)
  const [manifestData, setManifestData] = useState(null)
  const [manifestLoading, setManifestLoading] = useState(false)
  const { submitTask } = useAsyncTask()
  const { history: genHistory, add: addGenHistory, remove: removeGenHistory, clear: clearGenHistory } =
    useToolHistory('short_drama_history_v1', 30)
  const toast = useToast()

  const loadList = () => {
    api
      .get('/api/drama/list')
      .then((res) => setItems(res.data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadList()
    api
      .get('/api/digital-human/avatars')
      .then((res) => {
        const list = res.data?.items || res.data || []
        setAvatars(list)
        if (list.length) {
          const found = list.some((a) => a.id === avatarId)
          if (!found) setAvatarId(list[0].id)
        }
      })
      .catch(() => {})
    // v13.25 素材源状态（Pexels key / 本地素材 / BGM）
    api
      .get('/api/drama/config')
      .then((res) => setSrcCfg(res.data))
      .catch(() => {})
    // v22 剧本题材模板库
    api
      .get('/api/drama-templates/list')
      .then((res) => setDramaTpls(res.data?.items || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generate = async () => {
    const hasCustom = customScenes.some((s) => (s.shot || '').trim() || (s.dialogue || '').trim())
    if (!theme.trim() && !scenesJson.trim() && !scriptData && !hasCustom) {
      toast.error('请输入短剧主题，或填写自定义分镜')
      return
    }
    setGenerating(true)
    setGenTask({ progress: 0, stage: '任务排队中…', status: 'pending' })
    const form = new FormData()
    form.append('theme', theme.trim())
    // v13.29 剧本工作台优先：确认生成时提交编辑后的 scenes（后端 scenes_override）
    const finalTitle = scriptData?.title?.trim() || title.trim()
    form.append('title', finalTitle)
    // v13.28 手动输入时长：自定义分钟 → 秒（后端另有 20-1800s 兜底）
    const customMin = parseFloat(customDur)
    const durSeconds =
      customDur.trim() && !Number.isNaN(customMin) ? Math.round(customMin * 60) : duration
    form.append('duration', durSeconds)
    if (dramaTplId) form.append('template_id', dramaTplId)
    if (scriptData) {
      form.append('scenes_json', JSON.stringify(scriptData.scenes))
      // v13.30 角色表：确认生成时一并提交（角色一致性锚定）
      if ((scriptData.characters || []).length) {
        form.append('characters_json', JSON.stringify(scriptData.characters))
      }
    } else if (hasCustom) {
      // v16 表格分镜优先于手写 JSON：过滤空镜，秒数收敛到 2-45
      const scenes = customScenes
        .filter((s) => (s.shot || '').trim() || (s.dialogue || '').trim())
        .map((s, i) => ({
          id: i + 1,
          shot: (s.shot || '').trim(),
          narrator: (s.narrator || '').trim(),
          dialogue: (s.dialogue || '').trim(),
          sec: Math.min(45, Math.max(2, parseInt(s.sec, 10) || 15)),
        }))
      form.append('scenes_json', JSON.stringify(scenes))
    } else if (scenesJson.trim()) {
      form.append('scenes_json', scenesJson.trim())
    }
    if (mode === 'illust') {
      // v13.30 AI 插画模式：每镜文生图/图生图，角色参考图锚定同人
      form.append('illust_mode', 'true')
      form.append('art_style', artStyle)
      form.append('dynamic_level', dynamicLevel)
    } else if (mode === 'avatar') {
      form.append('avatar_mode', 'true')
      form.append('avatar_id', avatarId)
      form.append('dh_engine', dhEngine)
    }
    await submitTask('/api/drama/generate', form, {
      onUpdate: (t) => setGenTask(t),
      onSuccess: (data) => {
        loadList()
        addGenHistory({
          type: '短剧',
          theme: theme.trim(),
          title: finalTitle,
          content: theme.trim().slice(0, 50),
          duration: durSeconds,
        })
        setGenerating(false)
        setScriptData(null) // v13.29 生成成功后关闭剧本工作台
        const qc = data.qc || {}
        const qcMsg = qc.ok === false && qc.findings?.length
          ? `（QC 提示：${qc.findings[0]}）`
          : '（QC 通过 ✓）'
        toast.success(`短剧已生成：${data.title}（${data.scenes} 镜 · ${Math.round(data.duration || 0)} 秒）${qcMsg}`)
      },
      onError: (e) => {
        setGenerating(false)
        toast.error(`生成失败：${e.message}`)
      },
    })
  }

  // ── 红果短剧升级：小说转剧本 / 系列连载 / 角色圣经 ──
  const loadSeries = async () => {
    try {
      const res = await api.get('/api/drama/series')
      setSeries(res.data?.series || [])
    } catch { /* 静默 */ }
  }

  useEffect(() => { loadSeries() }, [])

  const savePexelsInline = async () => {
    if (!pexelsInput.trim()) {
      toast.error('请先粘贴 Pexels API Key')
      return
    }
    setPexelsBusy(true)
    try {
      const res = await api.put('/api/relay/me/pexels', { api_key: pexelsInput.trim() })
      setPexelsInput('')
      // 刷新素材源状态
      const cfg = await api.get('/api/drama/config')
      setSrcCfg(cfg.data)
      toast.success(res.data.message || 'Pexels Key 已保存，素材模式已启用')
    } catch (e) {
      toast.error(e.message || 'Pexels Key 保存失败')
    } finally {
      setPexelsBusy(false)
    }
  }

  const novelToScript = async () => {
    if (!novelText.trim()) {
      toast.error('请先粘贴小说/故事原文')
      return
    }
    setNovelBusy(true)
    const customMin = parseFloat(customDur)
    const durSeconds =
      customDur.trim() && !Number.isNaN(customMin) ? Math.round(customMin * 60) : duration
    const form = new FormData()
    form.append('novel', novelText.trim())
    form.append('duration', durSeconds)
    form.append('episode', episodeNo || 1)
    if (seriesId) form.append('series_id', seriesId)
    if (title.trim()) form.append('title', title.trim())
    try {
      const res = await api.post('/api/drama/novel-to-script', form)
      const data = res.data || {}
      if (!data.scenes?.length) throw new Error('剧本为空，请重试')
      setScriptData({
        title: data.title || title.trim() || '未命名短剧',
        scenes: data.scenes,
        characters: data.characters || [],
      })
      toast.success(`小说已转为剧本：${data.title}（${data.scenes.length} 镜，第 ${data.episode} 集）`)
      // 提示可保存角色圣经
      if (seriesId && data.characters?.length) {
        toast.info('可点击「保存角色到系列」锁定跨集一致性', 4000)
      }
    } catch (e) {
      toast.error(`小说转剧本失败：${e.message || '请重试'}`)
    } finally {
      setNovelBusy(false)
    }
  }

  const createSeries = async () => {
    if (!seriesName.trim()) {
      toast.error('请输入系列名')
      return
    }
    try {
      const res = await api.post('/api/drama/series', {
        name: seriesName.trim(),
        genre: seriesGenre,
      })
      setSeriesOpen(false)
      setSeriesName('')
      await loadSeries()
      setSeriesId(res.data?.id || '')
      toast.success(res.data?.message || '系列已创建')
    } catch (e) {
      toast.error(e.message || '创建失败')
    }
  }

  const saveCharactersToSeries = async () => {
    if (!seriesId) {
      toast.error('请先选择或创建系列')
      return
    }
    if (!scriptData?.characters?.length) {
      toast.error('当前剧本没有角色表，无法保存')
      return
    }
    try {
      const res = await api.put(`/api/drama/series/${seriesId}/characters`, {
        characters: scriptData.characters.map((c) => ({
          id: c.id, name: c.name, gender: c.gender, age: c.age,
          appearance: c.appearance, outfit: c.outfit, search: c.search,
        })),
      })
      toast.success(res.data?.message || '角色圣经已保存')
    } catch (e) {
      toast.error(e.message || '保存失败')
    }
  }

  // v13.29 AI 写剧本：主题 + 目标时长 → 剧本（含分镜/台词/画面描述），可编辑后确认生成
  const writeScript = async () => {
    if (!theme.trim()) {
      toast.error('请先输入短剧主题，再让 AI 写剧本')
      return
    }
    setScripting(true)
    const customMin = parseFloat(customDur)
    const durSeconds =
      customDur.trim() && !Number.isNaN(customMin) ? Math.round(customMin * 60) : duration
    const form = new FormData()
    form.append('theme', theme.trim())
    form.append('duration', durSeconds)
    if (dramaTplId) form.append('template_id', dramaTplId)
    try {
      const res = await api.post('/api/drama/script', form)
      const data = res.data || {}
      if (!data.scenes?.length) throw new Error('剧本为空，请重试')
      // v13.30 角色表随剧本返回（角色一致性：A 出场即锁定）
      setScriptData({
        title: data.title || title.trim() || '未命名短剧',
        scenes: data.scenes,
        characters: data.characters || [],
      })
      toast.success(`AI 已写好剧本：${data.title}（${data.scenes.length} 镜），可编辑后确认生成`)
    } catch (e) {
      toast.error(`剧本生成失败：${e.message || '请重试'}`)
    } finally {
      setScripting(false)
    }
  }

  const updateScene = (i, key, val) => {
    setScriptData((prev) => {
      const scenes = prev.scenes.map((s, idx) => (idx === i ? { ...s, [key]: val } : s))
      return { ...prev, scenes }
    })
  }

  const addScene = () => {
    setScriptData((prev) => ({
      ...prev,
      scenes: [...prev.scenes, { id: prev.scenes.length + 1, chars: [], shot: '', search: '', narrator: '', dialogue: '', emotion: 'neutral', sec: 15 }],
    }))
  }

  const removeScene = (i) => {
    setScriptData((prev) => ({
      ...prev,
      scenes: prev.scenes.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, id: idx + 1 })),
    }))
  }

  // v16 自定义分镜表格：增删改单镜（画面/台词/旁白/秒数）
  const updateCustomScene = (i, key, val) => {
    setCustomScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)))
  }

  const addCustomScene = () => {
    setCustomScenes((prev) => [...prev, { shot: '', narrator: '', dialogue: '', sec: 15 }])
  }

  const removeCustomScene = (i) => {
    setCustomScenes((prev) => prev.filter((_, idx) => idx !== i))
  }

  // v13.30 角色表编辑（角色一致性：每个角色形象全剧锁定）
  const updateCharacter = (i, key, val) => {
    setScriptData((prev) => {
      const characters = (prev.characters || []).map((c, idx) => (idx === i ? { ...c, [key]: val } : c))
      return { ...prev, characters }
    })
  }

  const addCharacter = () => {
    setScriptData((prev) => ({
      ...prev,
      characters: [
        ...(prev.characters || []),
        { id: `char${Date.now()}`, name: '', gender: '', age: '', appearance: '', outfit: '', search: '' },
      ],
    }))
  }

  const removeCharacter = (i) => {
    setScriptData((prev) => {
      const characters = (prev.characters || []).filter((_, idx) => idx !== i)
      const ids = new Set(characters.map((c) => c.id))
      // 同步清理各镜对该角色的引用
      const scenes = prev.scenes.map((s) => ({ ...s, chars: (s.chars || []).filter((cid) => ids.has(cid)) }))
      return { ...prev, characters, scenes }
    })
  }

  const toggleSceneChar = (i, cid) => {
    setScriptData((prev) => {
      const scenes = prev.scenes.map((s, idx) => {
        if (idx !== i) return s
        const chars = s.chars || []
        if (!cid) return { ...s, chars: [] }
        return { ...s, chars: chars.includes(cid) ? chars.filter((x) => x !== cid) : [...chars, cid] }
      })
      return { ...prev, scenes }
    })
  }

  const fmtDur = (s) => {
    if (!s) return '--'
    const m = Math.floor(s / 60)
    const sec = Math.round(s % 60)
    return m > 0 ? `${m}分${sec}秒` : `${sec}秒`
  }

  // v15 分镜表导出 Excel：剧本工作台当前分镜 → xlsx 下载
  const exportShots = async () => {
    if (!scriptData?.scenes?.length) return
    setExportingShots(true)
    try {
      const form = new FormData()
      form.append('title', scriptData.title || '')
      form.append('scenes_json', JSON.stringify(scriptData.scenes))
      if ((scriptData.characters || []).length) {
        form.append('characters_json', JSON.stringify(scriptData.characters))
      }
      const res = await api.post('/api/drama/export-shots', form, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${scriptData.title || '短剧'}-分镜表.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('分镜表已导出 Excel（每镜一行：时长/情绪/角色/画面/关键词/台词）')
    } catch (e) {
      toast.error(`导出失败：${e.message}`)
    } finally {
      setExportingShots(false)
    }
  }

  // v15 批量生成素材清单：每镜素材需求（关键词/时长/情绪）+ 汇总
  const loadManifest = async () => {
    if (!scriptData?.scenes?.length) return
    setManifestLoading(true)
    try {
      const form = new FormData()
      form.append('scenes_json', JSON.stringify(scriptData.scenes))
      const res = await api.post('/api/drama/material-manifest', form)
      setManifestData(res.data)
      setShowManifest(true)
    } catch (e) {
      toast.error(`素材清单生成失败：${e.message}`)
    } finally {
      setManifestLoading(false)
    }
  }

  const downloadManifestMd = () => {
    if (!manifestData?.manifest_md) return
    const blob = new Blob([manifestData.manifest_md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${scriptData?.title || '短剧'}-素材清单.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <PageHeader
        icon={Clapperboard}
        title="短剧工厂"
        description="AI 编剧 + 素材匹配 + 配音字幕 + 背景音乐，一键产出竖屏短剧（支持数字人播报模式）"
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── 生成表单 ── */}
        <Card className="lg:col-span-3 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              短剧主题 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="例如：一个外卖小哥穿越到古代成为御膳房学徒，用现代美食征服皇帝"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* 核心操作：开始创作（紧跟主题输入，主路径最短） */}
          <div className="rounded-xl bg-gradient-to-r from-violet-50 to-fuchsia-50 border border-violet-100 p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-violet-900">
                  {theme.trim() ? '主题已就绪，开始创作' : '输入主题后即可开始创作'}
                </div>
                <div className="text-[11px] text-violet-600/70 mt-0.5">
                  画面模式/时长/题材模板等高级参数可展开调整 · 支持素材/AI插画/数字人三种模式
                </div>
              </div>
              <Button onClick={generate} disabled={generating} className="!px-6 whitespace-nowrap">
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    生成中（后台执行）…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    开始创作短剧
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 高级参数（默认收起） */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <Sliders className="w-3.5 h-3.5 text-gray-400" />
                高级参数
                <span className="text-gray-400 font-normal">（题材模板/时长/画面模式等）</span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>
            {showAdvanced && (
              <div className="space-y-5">
          {/* v22 剧本题材模板库：爆款题材注入 AI 编剧（人设/结构/风格/钩子） */}
          {dramaTpls.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                剧本题材模板
                <span className="text-xs text-gray-400 font-normal">
                  选一个爆款题材，AI 按专业编剧套路创作（人设 / 结构 / 风格 / 钩子）
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDramaTplId('')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    !dramaTplId
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                  }`}
                >
                  自由创作
                </button>
                {dramaTpls.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDramaTplId(dramaTplId === t.id ? '' : t.id)}
                    title={t.desc}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors flex items-center gap-1 ${
                      dramaTplId === t.id
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.name}
                    {t.pricing?.mode !== 'free' && (
                      <span className={`text-[10px] px-1 rounded ${dramaTplId === t.id ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
                        {t.pricing_label}
                      </span>
                    )}
                  </button>
                ))}
                {dramaTpls.some((t) => t.id === dramaTplId) && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.get(`/api/drama-templates/${dramaTplId}`)
                        setDramaTplInfo(res.data)
                      } catch {
                        toast.error('题材详情加载失败')
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors"
                  >
                    📖 查看设定
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">剧名（可选）</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="留空由 AI 自动起名"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">目标时长</label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDuration(d)
                      setCustomDur('')
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      duration === d && !customDur.trim()
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                    }`}
                  >
                    {d >= 300 ? `${d / 60}分钟` : `${d}s`}
                  </button>
                ))}
              </div>
              {/* v13.28 自定义时长（分钟，支持小数），留空则使用档位值 */}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0.5"
                  max="30"
                  step="0.5"
                  value={customDur}
                  onChange={(e) => setCustomDur(e.target.value)}
                  placeholder="自定义"
                  className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <span className="text-xs text-gray-400">分钟（0.5-30，留空用档位）</span>
              </div>
            </div>
          </div>

          {/* ── 画面模式（v13.25：素材模式为默认；v13.30：新增 AI 插画模式，角色一致性） ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">画面模式</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setMode('material')}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  mode === 'material' ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-violet-600" />
                  <span className="font-medium text-gray-800">素材模式</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">快速</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">按关键词匹配真实视频素材（Pexels/本地），速度快适合长剧。画面与剧情关联弱、角色不固定，追求专业画质请用漫剧模式</p>
              </button>
              <button
                onClick={() => setMode('illust')}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  mode === 'illust' ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-violet-600" />
                  <span className="font-medium text-gray-800">漫剧模式（推荐）</span>
                  <span className="text-[10px] text-violet-500 bg-violet-100 rounded-full px-1.5 py-0.5">专业画质</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">对标红果漫剧：先为每个角色生成定妆立绘（全剧同脸同装），每镜按台词画面描述绘制电影感分镜插画 + 镜头运镜，画面与剧情强匹配，适合系列连载</p>
              </button>
              <button
                onClick={() => setMode('avatar')}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  mode === 'avatar' ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-violet-600" />
                  <span className="font-medium text-gray-800">数字人播报</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">真人形象口播每镜画面，耗时较长，失败自动回退素材模式</p>
              </button>
            </div>
            {mode === 'illust' && (
              <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                <label className="block text-xs font-medium text-violet-700 mb-2">画风（全剧统一）</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['guoman', '国漫', '精致线条·高饱和'],
                    ['hanman', '韩漫', '时尚精美·柔和光影'],
                    ['3d', '3D 动画', '皮克斯渲染·立体'],
                    ['realistic', '写实电影', '真人质感·真实光影'],
                  ].map(([id, label, desc]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setArtStyle(id)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                        artStyle === id
                          ? 'border-violet-500 bg-white text-violet-700 font-medium shadow-soft'
                          : 'border-violet-200 bg-white/60 text-violet-500 hover:border-violet-400'
                      }`}
                    >
                      {label}
                      <span className="block text-[10px] font-normal text-violet-400">{desc}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-violet-700 mb-1.5">
                    动态镜头（人物真动·i2v）
                  </label>
                  <div className="flex gap-1.5">
                    {[
                      ['auto', '智能', '隔场动态·速度与效果平衡'],
                      ['on', '全开', '每场动态·效果最好但慢'],
                      ['off', '关闭', '仅静态运镜·最快'],
                    ].map(([id, label, desc]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDynamicLevel(id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                          dynamicLevel === id
                            ? 'border-rose-500 bg-white text-rose-700 font-medium shadow-soft'
                            : 'border-rose-200 bg-white/60 text-rose-500 hover:border-rose-400'
                        }`}
                      >
                        {label}
                        <span className="block text-[10px] font-normal text-rose-400">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {srcCfg && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {srcCfg.pexels_configured ? (
                  <Badge color="green">Pexels 素材库已启用</Badge>
                ) : (
                  <Badge color="amber">未配置 Pexels Key · 回退本地素材/卡片</Badge>
                )}
                {srcCfg.local_materials > 0 && <Badge color="gray">本地素材 {srcCfg.local_materials} 个</Badge>}
                {srcCfg.music_tracks > 0 && <Badge color="gray">BGM {srcCfg.music_tracks} 首</Badge>}
              </div>
            )}
            {srcCfg && !srcCfg.pexels_configured && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  当前未配置 Pexels Key，短剧将回退本地素材/渐变卡片。配置后可启用真实竖屏视频素材（每镜自动匹配画面）。
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={pexelsInput}
                    onChange={(e) => setPexelsInput(e.target.value)}
                    placeholder="粘贴 Pexels API Key（pexels.com/api 免费注册）"
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                    autoComplete="off"
                  />
                  <button
                    onClick={savePexelsInline}
                    disabled={pexelsBusy || !pexelsInput.trim()}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
                  >
                    {pexelsBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    保存并启用
                  </button>
                </div>
                <p className="text-[10px] text-amber-500">
                  也可在「个人中心 → Pexels 素材 Key」配置；或把素材（*关键词*.mp4/jpg）放入本地素材目录
                </p>
              </div>
            )}
          </div>

          {mode === 'avatar' && (
            <div className="space-y-4 rounded-xl bg-gray-50 border border-gray-100 p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">数字人形象</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {avatars.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAvatarId(a.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                        avatarId === a.id
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                      }`}
                      title={a.description || a.name}
                    >
                      <span>{a.emoji || '👤'}</span>
                      {a.name}
                      {dhEngine === 'live_portrait' && !a.has_portrait && (
                        <span className="text-[10px] opacity-70">无照片</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">引擎</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDhEngine('2d')}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      dhEngine === '2d'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                    }`}
                  >
                    2d 基础渲染（快）
                  </button>
                  <button
                    onClick={() => setDhEngine('live_portrait')}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      dhEngine === 'live_portrait'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                    }`}
                  >
                    live_portrait 照片驱动（需照片形象）
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── AI 剧本工作台（v13.29：先写剧本 → 编辑 → 确认生成） ── */}
          {scriptData && (
            <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-violet-700">
                  <PenLine className="w-4 h-4" />
                  AI 剧本（{scriptData.scenes.length} 镜）· 可编辑
                </span>
                <div className="flex items-center gap-2">
                  <ShareButton
                    content={buildScriptMd()}
                    title={`短剧剧本：${scriptData.title || title || '未命名'}`}
                    contentType="drama"
                    className="!px-2.5 !py-1 !text-xs"
                  />
                  <button
                    onClick={saveCharactersToSeries}
                    disabled={!scriptData?.characters?.length}
                    title="把当前角色表保存到系列角色圣经（跨集一致）"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                  >
                    🎭 保存角色到系列{seriesId ? '' : '（先选系列）'}
                  </button>
                  <button
                    onClick={copyScript}
                    title="复制剧本 Markdown"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-violet-600 hover:bg-violet-100"
                  >
                    📋 复制
                  </button>
                  <button
                    onClick={exportShots}
                    disabled={exportingShots}
                    title="导出分镜表 Excel（每镜一行）"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                  >
                    <FileSpreadsheet className={`w-3 h-3 ${exportingShots ? 'animate-pulse' : ''}`} />
                    {exportingShots ? '导出中…' : '分镜表 Excel'}
                  </button>
                  <button
                    onClick={loadManifest}
                    disabled={manifestLoading}
                    title="批量生成素材清单（关键词/时长/情绪）"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                  >
                    <ListChecks className={`w-3 h-3 ${manifestLoading ? 'animate-pulse' : ''}`} />
                    {manifestLoading ? '生成中…' : '素材清单'}
                  </button>
                  <button
                    onClick={writeScript}
                    disabled={scripting}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${scripting ? 'animate-spin' : ''}`} />
                    {scripting ? '创作中…' : '重新生成'}
                  </button>
                  <button
                    onClick={() => setScriptData(null)}
                    className="px-2.5 py-1 rounded-lg text-xs text-gray-400 hover:bg-gray-100"
                  >
                    取消
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">剧名</label>
                <input
                  value={scriptData.title || ''}
                  onChange={(e) => setScriptData({ ...scriptData, title: e.target.value })}
                  placeholder="剧名"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              {/* v13.30 角色表：每个角色形象全剧锁定（A 出场即定妆，再出场不变） */}
              {(scriptData.characters || []).length > 0 && (
                <div className="rounded-lg bg-white border border-amber-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <Users className="w-3.5 h-3.5" />
                      角色（出场即锁定，之后每处出场保持同一形象）
                    </span>
                    <button
                      onClick={addCharacter}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-600 hover:border-amber-300"
                    >
                      <Plus className="w-3 h-3" />
                      加角色
                    </button>
                  </div>
                  {scriptData.characters.map((c, ci) => (
                    <div key={ci} className="rounded-lg border border-gray-100 bg-gray-50/50 p-2 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          value={c.name || ''}
                          onChange={(e) => updateCharacter(ci, 'name', e.target.value)}
                          placeholder="角色名（如：林小满）"
                          className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <input
                          value={c.gender || ''}
                          onChange={(e) => updateCharacter(ci, 'gender', e.target.value)}
                          placeholder="性别"
                          className="w-14 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <input
                          value={c.age || ''}
                          onChange={(e) => updateCharacter(ci, 'age', e.target.value)}
                          placeholder="年龄"
                          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <button
                          onClick={() => removeCharacter(ci)}
                          title="删除此角色（各镜引用同步清理）"
                          className="text-gray-300 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        value={c.appearance || ''}
                        onChange={(e) => updateCharacter(ci, 'appearance', e.target.value)}
                        placeholder="外貌（发型/发色/脸型…，全程不变）"
                        className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <input
                        value={c.outfit || ''}
                        onChange={(e) => updateCharacter(ci, 'outfit', e.target.value)}
                        placeholder="服装（全程固定，如：白色连衣裙配红色围巾）"
                        className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <input
                        value={c.search || ''}
                        onChange={(e) => updateCharacter(ci, 'search', e.target.value)}
                        placeholder="英文特征词（素材搜索锚定，如 young chinese woman black hair）"
                        className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {scriptData.scenes.map((s, i) => (
                  <div key={i} className="rounded-lg bg-white border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">第 {i + 1} 镜</span>
                      <button
                        onClick={() => removeScene(i)}
                        title="删除此镜"
                        className="text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">画面描述 shot（决定画面与字幕的呼应）</label>
                      <input
                        value={s.shot || ''}
                        onChange={(e) => updateScene(i, 'shot', e.target.value)}
                        placeholder="如：雨夜小巷，主角撑伞快步走过"
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-0.5">素材关键词 search（英文，可留空）</label>
                        <input
                          value={s.search || ''}
                          onChange={(e) => updateScene(i, 'search', e.target.value)}
                          placeholder="night city rain"
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-0.5">时长 sec（2-45 秒）</label>
                        <input
                          type="number"
                          min={2}
                          max={45}
                          value={s.sec ?? 15}
                          onChange={(e) => updateScene(i, 'sec', parseInt(e.target.value, 10) || 5)}
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">旁白 narrator</label>
                      <input
                        value={s.narrator || ''}
                        onChange={(e) => updateScene(i, 'narrator', e.target.value)}
                        placeholder="旁白文本"
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">台词 dialogue</label>
                      <input
                        value={s.dialogue || ''}
                        onChange={(e) => updateScene(i, 'dialogue', e.target.value)}
                        placeholder="角色台词"
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">出场角色（可多选，出场即锁定形象）</label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => toggleSceneChar(i, null)}
                          className={`px-2.5 py-1 rounded-full border text-[11px] transition-colors ${
                            !(s.chars || []).length
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
                          }`}
                        >
                          无
                        </button>
                        {(scriptData.characters || []).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => toggleSceneChar(i, c.id)}
                            className={`px-2.5 py-1 rounded-full border text-[11px] transition-colors ${
                              (s.chars || []).includes(c.id)
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
                            }`}
                          >
                            {c.name || c.id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">情绪 emotion</label>
                      <select
                        value={s.emotion || 'neutral'}
                        onChange={(e) => updateScene(i, 'emotion', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        {EMOTIONS.map((em) => (
                          <option key={em} value={em}>
                            {EMOTION_LABEL[em]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={addScene}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-violet-300"
                >
                  <Plus className="w-3.5 h-3.5" />
                  加一镜
                </button>
                <Button
                  onClick={generate}
                  disabled={generating}
                  variant="primary"
                  className="px-4 py-2 text-xs"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  确认并生成短剧
                </Button>
              </div>
            </div>
          )}

          {/* ── 自定义分镜（v16 表格化：逐镜编排画面/台词，免写 JSON） ── */}
          <div className="rounded-xl border border-gray-200">
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 rounded-xl"
            >
              <span className="flex items-center gap-2">
                <Subtitles className="w-4 h-4 text-gray-400" />
                自定义分镜（可选，手动编排每镜画面/台词，留空由 AI 编剧）
              </span>
              {showCustom ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showCustom && (
              <div className="px-4 pb-4 space-y-2">
                {customScenes.length === 0 && (
                  <p className="text-[11px] text-gray-400">逐镜填写画面描述与台词，点「开始创作」后按此剧本生成</p>
                )}
                {customScenes.map((s, i) => (
                  <div key={i} className="rounded-lg border border-gray-100 bg-gray-50/40 p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-400">第 {i + 1} 镜</span>
                      <button onClick={() => removeCustomScene(i)} title="删除此镜" className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      value={s.shot || ''}
                      onChange={(e) => updateCustomScene(i, 'shot', e.target.value)}
                      placeholder="画面描述（如：雨夜小巷，主角撑伞快步走过）"
                      className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={s.dialogue || ''}
                        onChange={(e) => updateCustomScene(i, 'dialogue', e.target.value)}
                        placeholder="台词（如：我终于找到了这里）"
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <input
                        value={s.narrator || ''}
                        onChange={(e) => updateCustomScene(i, 'narrator', e.target.value)}
                        placeholder="旁白（可留空）"
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">时长</span>
                      <input
                        type="number"
                        min={2}
                        max={45}
                        value={s.sec ?? 15}
                        onChange={(e) => updateCustomScene(i, 'sec', parseInt(e.target.value, 10) || 15)}
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <span className="text-[11px] text-gray-400">秒（2-45）</span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addCustomScene}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-violet-300"
                >
                  <Plus className="w-3.5 h-3.5" />
                  加一镜
                </button>
                <details className="rounded-lg border border-dashed border-gray-200">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] text-gray-400 hover:text-gray-600">高级：粘贴分镜 JSON</summary>
                  <div className="px-3 pb-3 space-y-1">
                    <textarea
                      value={scenesJson}
                      onChange={(e) => setScenesJson(e.target.value)}
                      rows={5}
                      placeholder={SCENES_EXAMPLE}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <p className="text-[11px] text-gray-400">字段：shot（画面）/ narrator（旁白）/ dialogue（台词）/ sec（秒数，2-45）</p>
                  </div>
                </details>
              </div>
            )}
          </div>

              <div className="pt-2 flex items-center gap-3 flex-wrap">
                <Button
                  onClick={writeScript}
                  disabled={generating}
                  loading={scripting}
                  variant="secondary"
                  className="px-4"
                >
                  <Wand2 className="w-4 h-4 mr-1.5" />
                  AI 写剧本（先出剧本可编辑）
                </Button>
                <details className="rounded-xl border border-rose-200 bg-rose-50/60">
                  <summary className="cursor-pointer flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100/50 rounded-xl">
                    📖 从小说导入（红果短剧风）— 粘贴原文一键转剧本分镜
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
                    <textarea
                      value={novelText}
                      onChange={(e) => setNovelText(e.target.value)}
                      rows={5}
                      placeholder={'粘贴小说/故事原文（至少 30 字）…\n例：苏晚晚是苏家最不受宠的女儿，二十岁那年被父亲当作联姻筹码，嫁给城东商业巨鳄顾言深…'}
                      className="w-full rounded-lg border border-rose-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={seriesId}
                        onChange={(e) => setSeriesId(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded-lg border border-rose-200 bg-white outline-none"
                      >
                        <option value="">不关联系列（单集）</option>
                        {series.map((s) => (
                          <option key={s.id} value={s.id}>
                            系列：{s.name}（{s.character_count || 0} 角色）
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setSeriesOpen(true)}
                        className="text-[11px] text-rose-600 hover:text-rose-700"
                      >
                        + 新建系列
                      </button>
                      <span className="text-[11px] text-rose-400">第</span>
                      <input
                        type="number"
                        min={1}
                        value={episodeNo}
                        onChange={(e) => setEpisodeNo(parseInt(e.target.value, 10) || 1)}
                        className="w-14 text-xs px-2 py-1.5 rounded-lg border border-rose-200 outline-none"
                      />
                      <span className="text-[11px] text-rose-400">集</span>
                      <Button variant="secondary" size="sm" loading={novelBusy} onClick={novelToScript} className="ml-auto">
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                        {novelBusy ? '转换中…' : '小说转剧本'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-rose-400/80">
                      选择系列后，自动沿用该系列已保存的角色圣经（跨集角色一致）；生成后可一键保存角色到系列
                    </p>
                  </div>
                </details>
                {mode === 'avatar' && <Badge color="purple">数字人播报</Badge>}
                {mode === 'material' && <Badge color="green">素材模式</Badge>}
                {mode === 'illust' && <Badge color="purple">AI 插画模式</Badge>}
              </div>
            </div>
          )}
          </div>

          {genHistory.length > 0 && (
            <div className="mt-3">
              <HistoryPanel
                history={genHistory}
                onReuse={(item) => {
                  if (item.theme) setTheme(item.theme)
                  if (item.title) setTitle(item.title)
                  toast.info('已恢复短剧主题，可重新生成')
                }}
                onRemove={removeGenHistory}
                onClear={clearGenHistory}
                title="创作历史"
                renderSummary={(item) => (
                  <span className="text-gray-700">{item.theme} · {item.duration}s</span>
                )}
              />
            </div>
          )}
          {generating && genTask && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-violet-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span className="flex-1 truncate">{genTask.stage || '任务执行中…'}</span>
                <span className="font-medium">{Math.round(genTask.progress || 0)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-violet-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-600 rounded-full transition-all"
                  style={{ width: `${genTask.progress || 0}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                任务已提交后台执行，可关闭页面稍后在「任务中心」查看结果
              </p>
            </div>
          )}
        </Card>

        {/* ── 作品列表 ── */}
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">我的短剧作品</h2>
            <button
              onClick={loadList}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty
              icon={Clapperboard}
              title="还没有短剧作品"
              description="输入主题，开始你的第一部 AI 短剧吧"
            />
          ) : (
            <Pagination
              items={items}
              pageSize={6}
              gridClass="grid grid-cols-1 gap-3"
              label={`共 ${items.length} 部短剧`}
              renderItem={(it) => (
              <div
                key={it.id}
                className="flex gap-3 rounded-xl border border-gray-100 hover:border-violet-200 hover:shadow-sm transition-all p-2.5 cursor-pointer"
                onClick={() => setPlaying(it)}
              >
                <div className="relative w-20 h-28 rounded-lg overflow-hidden bg-gray-900 flex-shrink-0 group">
                  {/* v13.28 真 JPG 封面 + hover 播放首镜 6s 预览 */}
                  <img
                    src={it.cover_url}
                    alt={it.title || '短剧封面'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {it.preview_url && (
                    <video
                      src={it.preview_url}
                      muted
                      loop
                      playsInline
                      preload="none"
                      className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"
                      onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors">
                    <Play className="w-6 h-6 text-white drop-shadow" />
                  </div>
                  <span className="absolute bottom-1 right-1 flex items-center gap-0.5 text-[10px] text-white bg-black/60 rounded px-1">
                    <Clock className="w-2.5 h-2.5" />
                    {fmtDur(it.duration)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 py-1">
                  <div className="font-medium text-sm text-gray-800 truncate">
                    {it.title || it.id.replace('drama_', '').slice(0, 12)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                    <Film className="w-3 h-3" />
                    竖屏 720x1280
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">{it.created_at}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <a
                      href={it.srt_url}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[11px] text-violet-600 hover:underline"
                    >
                      <Subtitles className="w-3 h-3" />
                      字幕
                    </a>
                    <a
                      href={it.url}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-violet-600"
                    >
                      <Download className="w-3 h-3" />
                      MP4
                    </a>
                    <span onClick={(e) => e.stopPropagation()}>
                      <FavoriteButton
                        favType="record"
                        targetId={it.id}
                        label={it.title}
                        className="!p-0.5 !text-gray-400"
                      />
                    </span>
                  </div>
                </div>
              </div>
              )}
            />
          )}
          </Card>
      </div>

      {/* ── 素材清单 Modal（v15）── */}
      <Modal
        open={showManifest}
        onClose={() => setShowManifest(false)}
        title={`素材清单：${scriptData?.title || '短剧'}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" icon={Download} onClick={downloadManifestMd}>
              下载素材清单.md
            </Button>
            <Button variant="primary" onClick={() => setShowManifest(false)}>
              知道了
            </Button>
          </>
        }
      >
        {manifestData && (
          <div className="space-y-4">
            {/* 汇总统计 */}
            <div className="flex flex-wrap gap-2">
              <Badge color="purple">共 {manifestData.summary.total_scenes} 镜</Badge>
              <Badge color="purple">总时长约 {manifestData.summary.total_sec} 秒</Badge>
              <Badge color="purple">台词/旁白 {manifestData.summary.total_text_chars} 字</Badge>
              <Badge color="purple">关键词 {manifestData.summary.keywords.length} 个</Badge>
            </div>

            {/* 每镜素材需求 */}
            <div className="space-y-1.5 max-h-[32vh] overflow-y-auto pr-1">
              {manifestData.items.map((it) => (
                <div
                  key={it.no}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50/50 text-xs"
                >
                  <span className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 font-bold flex items-center justify-center flex-shrink-0">
                    {it.no}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 truncate">{it.keyword}</span>
                      <span className="text-gray-400 flex-shrink-0">{it.sec}s · {it.emotion}</span>
                    </div>
                    {it.text && <p className="text-gray-400 truncate mt-0.5">{it.text}</p>}
                  </div>
                  <span className="text-gray-400 flex-shrink-0">{it.text_len} 字</span>
                </div>
              ))}
            </div>

            {/* 关键词汇总 chips */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                关键词汇总（可作本地素材文件名，如 night.mp4）
              </p>
              <div className="flex flex-wrap gap-1.5">
                {manifestData.summary.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-[11px] text-violet-700"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              素材模式：将关键词命名的素材（*关键词*.mp4/jpg）放入 backend/drama_factory/materials/ 目录，生成时自动匹配；
              Pexels Key 已配置时优先实时搜索。建议素材时长 ≥ 对应镜长（8-40 秒为佳）。
            </p>
          </div>
        )}
      </Modal>

      {/* ── 播放 Modal ── */}
      <Modal open={!!playing} onClose={() => setPlaying(null)} title={playing?.title || '短剧播放'}>
        {playing && (
          <div className="space-y-4">
            <video src={playing.url} className="w-full rounded-lg bg-black" controls autoPlay />
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                时长 {fmtDur(playing.duration)}
              </span>
              <a
                href={playing.srt_url}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 text-xs"
              >
                <Subtitles className="w-3.5 h-3.5" />
                下载字幕
              </a>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <MonitorPlay className="w-3.5 h-3.5" />
              创建于 {playing.created_at} · 右键视频可保存 MP4
            </p>
          </div>
        )}
      </Modal>

      {/* ── v22 剧本题材详情弹窗 ── */}
      <Modal open={!!dramaTplInfo} onClose={() => setDramaTplInfo(null)} title="题材设定">
        {dramaTplInfo && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{dramaTplInfo.icon}</span>
              <h3 className="text-lg font-semibold text-gray-800">{dramaTplInfo.name}</h3>
              <Badge color="purple">{dramaTplInfo.category_label || dramaTplInfo.category}</Badge>
              {dramaTplInfo.pricing?.mode !== 'free' && (
                <Badge color="amber">{dramaTplInfo.pricing_label}</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">{dramaTplInfo.desc}</p>
            <div className="text-xs text-gray-400">
              热度 {dramaTplInfo.usage || 0} 次创作{dramaTplInfo.pricing?.mode === 'free' ? ' · 免费使用' : ''}
            </div>
            <div className="space-y-3">
              {[
                ['👤 人设与关系', dramaTplInfo.setup],
                ['📈 剧情结构', dramaTplInfo.structure],
                ['🎭 台词风格', dramaTplInfo.style],
                ['🪝 开篇钩子', dramaTplInfo.hook],
              ].map(([label, val]) => (
                <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 p-3.5">
                  <div className="text-xs font-semibold text-violet-600 mb-1.5">{label}</div>
                  <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">{val}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-gray-400">
                选择该题材后点击「让 AI 写剧本」，将按此设定注入专业编剧套路
              </p>
              <Button onClick={() => setDramaTplInfo(null)}>知道了</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 系列创建 Modal（红果短剧连载容器） */}
      <Modal open={seriesOpen} onClose={() => setSeriesOpen(false)} title="创建短剧系列（连载）" size="md">
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            系列是连载短剧的容器：每集可复用系列角色圣经，保证跨集角色形象一致（红果短剧规范）。
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">系列名 *</label>
            <input
              value={seriesName}
              onChange={(e) => setSeriesName(e.target.value)}
              placeholder="例：替嫁新娘"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">题材</label>
            <input
              value={seriesGenre}
              onChange={(e) => setSeriesGenre(e.target.value)}
              placeholder="例：都市甜宠复仇"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setSeriesOpen(false)}>取消</Button>
            <Button onClick={createSeries}>创建系列</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
