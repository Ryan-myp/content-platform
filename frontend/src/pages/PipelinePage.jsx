import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Rocket,
  CalendarClock,
  BarChart3,
  BookOpenCheck,
  Save,
  CopyPlus,
  Play,
  Download,
  Trash2,
  RefreshCw,
  Check,
  Send,
  Film,
  Wand2,
  UserCircle,
  Mic2,
  Monitor,
  LayoutTemplate,
  Layers,
  ChevronDown,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Video,
  Eye,
} from 'lucide-react'
import { Card, Button, Empty, PageHeader, Modal, Badge, SkeletonList } from '../components/ui'
import { useToast } from '../lib/toast'
import api, { API_BASE } from '../lib/api'
import { friendlyError } from '../lib/errors'

const PLATFORMS = [
  { id: 'douyin', label: '抖音', desc: '口播/带货，节奏快' },
  { id: 'kuaishou', label: '快手', desc: '老铁文化，接地气' },
  { id: 'xiaohongshu', label: '小红书', desc: '种草笔记风' },
  { id: 'shipinhao', label: '视频号', desc: '微信生态，中年受众' },
  { id: 'bilibili', label: 'B站', desc: '年轻化，干货向' },
]

const STATUS_META = {
  pending: { label: '排队中', color: 'bg-ink-100 text-ink-600', icon: Clock },
  running: { label: '生成中', color: 'bg-amber-50 text-amber-600', icon: Loader2 },
  success: { label: '已完成', color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
  failed: { label: '失败', color: 'bg-red-50 text-red-600', icon: XCircle },
}

const PROJ_STATUS_META = {
  running: { label: '生成中', color: 'bg-amber-50 text-amber-600' },
  done: { label: '全部完成', color: 'bg-emerald-50 text-emerald-600' },
  partial: { label: '部分完成', color: 'bg-blue-50 text-blue-600' },
  failed: { label: '失败', color: 'bg-red-50 text-red-600' },
}

export default function PipelinePage() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [projects, setProjects] = useState([])
  const [resources, setResources] = useState({ avatars: [], voices: [], backgrounds: [], scenes: [] })
  const [detail, setDetail] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [polling, setPolling] = useState(null)
  const pollRef = useRef(null)
  // Phase 2：批量矩阵
  const [schedBusy, setSchedBusy] = useState(false)
  const [schedInterval, setSchedInterval] = useState(30)
  const [metricsBusy, setMetricsBusy] = useState(false)
  const [metricsForm, setMetricsForm] = useState({ views: '', likes: '', comments: '', shares: '', followers_gained: '' })
  const [metricsOpen, setMetricsOpen] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [review, setReview] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Phase 3：模板资产化
  const [templates, setTemplates] = useState([])
  const [tplOpen, setTplOpen] = useState(false)
  const [tplSaving, setTplSaving] = useState(false)
  const [tplForm, setTplForm] = useState({ name: '', note: '', theme_pattern: '' })

  // 表单
  const [form, setForm] = useState({
    theme: '',
    platform: 'douyin',
    count: 3,
    avatar_id: 'business-female',
    voice_id: 'zh-CN-XiaoxiaoNeural',
    background_id: 'tech',
    scene_id: 'product',
    engine: '2d',
    resolution: '720p',
    speed: 1.0,
  })

  const loadResources = useCallback(async () => {
    try {
      const [av, vo, bg, sc] = await Promise.all([
        api.get('/api/digital-human/avatars'),
        api.get('/api/digital-human/voices'),
        api.get('/api/digital-human/backgrounds'),
        api.get('/api/digital-human/scenes'),
      ])
      setResources({
        avatars: av.data?.avatars || [],
        voices: vo.data?.voices || [],
        backgrounds: bg.data?.backgrounds || [],
        scenes: sc.data?.scenes || [],
      })
      if (av.data?.avatars?.length && !av.data.avatars.some((a) => a.id === form.avatar_id)) {
        setForm((f) => ({ ...f, avatar_id: av.data.avatars[0].id }))
      }
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.get('/api/pipeline/projects?page=1&page_size=50')
      setProjects(res.data?.items || [])
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }, [toast])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get('/api/pipeline/templates')
      setTemplates(res.data?.templates || [])
    } catch (e) {
      /* 静默 */
    }
  }, [])

  useEffect(() => {
    loadResources()
    loadProjects()
    loadTemplates()
  }, [loadResources, loadProjects, loadTemplates])

  useEffect(() => () => clearInterval(pollRef.current), [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const run = async () => {
    if (!form.theme.trim()) {
      toast.warning('请输入选题主题')
      return
    }
    setRunning(true)
    try {
      const res = await api.post('/api/pipeline/run', {
        ...form,
        theme: form.theme.trim(),
      })
      toast.success(`流水线已启动：正在为「${form.theme.trim()}」生成 ${res.data.variant_count} 条口播视频`)
      setForm((f) => ({ ...f, theme: '' }))
      await loadProjects()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setRunning(false)
    }
  }

  // 打开项目详情并轮询进度
  const openDetail = async (id, autoPoll = true) => {
    setDetailOpen(true)
    setDetail(null)
    clearInterval(pollRef.current)
    pollRef.current = null
    const fetchOne = async () => {
      try {
        const res = await api.get(`/api/pipeline/projects/${id}`)
        setDetail(res.data)
        return res.data
      } catch (e) {
        toast.error(friendlyError(e))
        return null
      }
    }
    const d = await fetchOne()
    if (autoPoll && d && d.status === 'running') {
      pollRef.current = setInterval(async () => {
        const dd = await fetchOne()
        if (dd && dd.status !== 'running') clearInterval(pollRef.current)
      }, 8000)
    }
  }

  const retryFailed = async (id) => {
    try {
      const res = await api.post(`/api/pipeline/projects/${id}/retry`, { indexes: [] })
      toast.success(res.data?.message || '已重新提交')
      openDetail(id)
      await loadProjects()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const del = async (id) => {
    if (!window.confirm('确定删除该项目吗？项目记录将删除（生成的视频文件保留）。')) return
    try {
      await api.delete(`/api/pipeline/projects/${id}`)
      toast.success('项目已删除')
      if (detail?.id === id) setDetailOpen(false)
      await loadProjects()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  // ── Phase 2：批量矩阵 ──
  const scheduleProject = async (id) => {
    setSchedBusy(true)
    try {
      const res = await api.post(`/api/pipeline/projects/${id}/schedule`, {
        interval_minutes: schedInterval,
        title_prefix: '',
      })
      toast.success(res.data?.message || '已创建排期')
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSchedBusy(false)
    }
  }

  const submitMetrics = async (id) => {
    const nums = (k) => Math.max(0, Number(metricsForm[k]) || 0)
    setMetricsBusy(true)
    try {
      const res = await api.post(`/api/pipeline/projects/${id}/metrics`, {
        views: nums('views'), likes: nums('likes'), comments: nums('comments'),
        shares: nums('shares'), followers_gained: nums('followers_gained'),
      })
      toast.success(res.data?.message || '效果数据已录入')
      setMetricsOpen(false)
      setMetricsForm({ views: '', likes: '', comments: '', shares: '', followers_gained: '' })
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setMetricsBusy(false)
    }
  }

  const runReview = async (id) => {
    setReviewBusy(true)
    setReview(null)
    setReviewOpen(true)
    try {
      const res = await api.get(`/api/pipeline/projects/${id}/review?days=30`)
      setReview(res.data)
    } catch (e) {
      toast.error(friendlyError(e))
      setReviewOpen(false)
    } finally {
      setReviewBusy(false)
    }
  }

  // ── Phase 3：模板资产化 ──
  const saveTemplate = async (project) => {
    setTplSaving(true)
    try {
      const payload = {
        name: tplForm.name.trim() || `${project.theme} 模板`,
        note: tplForm.note.trim(),
        theme_pattern: tplForm.theme_pattern.trim() || project.theme,
        platform: project.platform,
        avatar_id: project.avatar_id,
        voice_id: project.voice_id,
        background_id: project.background_id,
        scene_id: project.scene_id,
        template_id: project.template_id || '',
        engine: project.engine,
        resolution: project.resolution,
        speed: Number(project.speed || 1.0),
        count: Math.max(1, Number(project.variant_count || 3)),
      }
      const res = await api.post('/api/pipeline/templates', payload)
      toast.success(res.data?.message || '模板已保存')
      setTplOpen(false)
      setTplForm({ name: '', note: '', theme_pattern: '' })
      await loadTemplates()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setTplSaving(false)
    }
  }

  const applyTemplate = (t) => {
    setForm({
      theme: t.theme_pattern || '',
      platform: t.platform || 'douyin',
      count: Math.max(1, Number(t.count || 3)),
      avatar_id: t.avatar_id,
      voice_id: t.voice_id,
      background_id: t.background_id,
      scene_id: t.scene_id,
      engine: t.engine || '2d',
      resolution: t.resolution || '720p',
      speed: Number(t.speed || 1.0),
    })
    toast.success(`已套用模板「${t.name}」，填入主题即可生成`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const videoUrl = (u) => (u ? (u.startsWith('http') ? u : API_BASE + u) : '')

  const avatarName = (id) => resources.avatars.find((a) => a.id === id)?.name || id
  const voiceName = (id) => resources.voices.find((v) => v.id === id)?.name || id
  const bgName = (id) => resources.backgrounds.find((b) => b.id === id)?.name || id
  const sceneName = (id) => resources.scenes.find((s) => s.id === id)?.name || id

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="口播短视频工厂"
        subtitle="一个选题 → N 条数字人口播短视频，一键批量生产、逐条可重跑、直接进发布中心"
        icon={Film}
        iconColor="from-rose-500 to-orange-500"
      />

      {/* ── 一键生成表单 ── */}
      <Card className="p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-ink-700 mb-1.5">选题主题 *</label>
            <input
              value={form.theme}
              onChange={(e) => set('theme', e.target.value)}
              placeholder="例：智能咖啡机、减脂早餐一周不重样、新手如何做小红书…"
              className="w-full px-3.5 py-2.5 border border-ink-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">目标平台</label>
            <div className="grid grid-cols-5 gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set('platform', p.id)}
                  className={`px-2 py-2 rounded-lg border text-xs transition-all ${
                    form.platform === p.id
                      ? 'border-amber-500 bg-amber-50 text-amber-800 font-medium'
                      : 'border-ink-200 text-ink-600 hover:border-amber-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              生成数量（N 条变体）
            </label>
            <select
              value={form.count}
              onChange={(e) => set('count', Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-ink-200 rounded-xl focus:border-amber-500 outline-none"
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} 条
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">数字人形象</label>
            <select
              value={form.avatar_id}
              onChange={(e) => set('avatar_id', e.target.value)}
              className="w-full px-3 py-2.5 border border-ink-200 rounded-xl focus:border-amber-500 outline-none"
            >
              {resources.avatars.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}（{a.style}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">声音</label>
            <select
              value={form.voice_id}
              onChange={(e) => set('voice_id', e.target.value)}
              className="w-full px-3 py-2.5 border border-ink-200 rounded-xl focus:border-amber-500 outline-none"
            >
              {resources.voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.lang || '中文'}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">背景</label>
            <select
              value={form.background_id}
              onChange={(e) => set('background_id', e.target.value)}
              className="w-full px-3 py-2.5 border border-ink-200 rounded-xl focus:border-amber-500 outline-none"
            >
              {resources.backgrounds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">场景模板</label>
            <select
              value={form.scene_id}
              onChange={(e) => set('scene_id', e.target.value)}
              className="w-full px-3 py-2.5 border border-ink-200 rounded-xl focus:border-amber-500 outline-none"
            >
              {resources.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.desc}）
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <Button variant="primary" size="lg" loading={running} onClick={run} className="!px-8">
            <Rocket className="w-4.5 h-4.5 mr-1.5" />
            {running ? '启动中…' : '一键生成 N 条口播视频'}
          </Button>
          <span className="text-xs text-ink-400">
            文案变体（AI）→ 数字人口播 → 配音字幕 → 成片，AI 费用走你的中转站 Key
          </span>
        </div>
      </Card>

      {/* ── 口播模板库（Phase 3：资产化） ── */}
      {templates.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Save className="w-4 h-4 text-brand-500" /> 我的口播模板
              <Badge className="ml-1">{templates.length}</Badge>
            </h3>
            <button
              onClick={() => setTplOpen(true)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              + 新建模板
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {templates.map((t) => (
              <div
                key={t.id}
                className="shrink-0 w-52 p-3 rounded-xl border border-ink-100 bg-ink-50/50 hover:border-amber-300 transition-colors"
              >
                <div className="text-sm font-medium text-ink-900 truncate">{t.name}</div>
                <div className="text-[11px] text-ink-400 mt-0.5 line-clamp-1">{t.theme_pattern || t.note || '—'}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => applyTemplate(t)}>
                    <CopyPlus className="w-3.5 h-3.5 mr-1" /> 套用
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── 项目列表 ── */}
      <div>
        <h3 className="text-base font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Layers className="w-4.5 h-4.5 text-brand-500" /> 我的视频项目
          <Badge className="ml-1">{projects.length}</Badge>
        </h3>
        {loading ? (
          <SkeletonList rows={3} />
        ) : projects.length === 0 ? (
          <Empty description="还没有视频项目，输入一个选题一键生成第一批口播视频吧" />
        ) : (
          <div className="space-y-3">
            {projects.map((p) => {
              const pm = PROJ_STATUS_META[p.status] || PROJ_STATUS_META.running
              return (
                <Card key={p.id} className="p-4 hover:shadow-md-soft transition-shadow cursor-pointer" onClick={() => openDetail(p.id)}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-900 truncate">{p.theme}</span>
                        <Badge className={pm.color}>{pm.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-ink-400 mt-1 flex-wrap">
                        <span>
                          {p.platform === 'douyin' ? '抖音' : p.platform === 'kuaishou' ? '快手' : p.platform === 'xiaohongshu' ? '小红书' : p.platform === 'shipinhao' ? '视频号' : 'B站'}
                        </span>
                        <span>
                          {avatarName(p.avatar_id)} · {voiceName(p.voice_id)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-500" /> {p.success} 成功
                        </span>
                        {p.failed > 0 && (
                          <span className="flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5 text-red-500" /> {p.failed} 失败
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-ink-300">
                          <Clock className="w-3.5 h-3.5" />
                          {p.created_at ? p.created_at.slice(5, 16).replace('T', ' ') : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {p.status !== 'running' && p.failed > 0 && (
                        <Button variant="secondary" size="sm" onClick={() => retryFailed(p.id)}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1" /> 重跑失败
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => del(p.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 项目详情 ── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="项目详情" width="lg">
        {!detail ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink-900">{detail.theme}</span>
              <Badge className={(PROJ_STATUS_META[detail.status] || PROJ_STATUS_META.running).color}>
                {PROJ_STATUS_META[detail.status]?.label || '生成中'}
              </Badge>
              <span className="text-xs text-ink-400">
                {avatarName(detail.avatar_id)} · {voiceName(detail.voice_id)} · {sceneName(detail.scene_id)} ·{' '}
                {detail.resolution}
              </span>
            </div>
            {detail.status === 'running' && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                正在批量生成中…页面会自动刷新进度，可先去做别的事
              </div>
            )}
            <div className="space-y-3">
              {detail.items?.map((it) => {
                const sm = STATUS_META[it.status] || STATUS_META.pending
                const Icon = sm.icon
                return (
                  <div key={it.id} className="border border-ink-100 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-ink-50 flex items-center justify-center text-ink-400 shrink-0">
                        <Icon className={`w-4.5 h-4.5 ${it.status === 'running' ? 'animate-spin' : ''} ${it.status === 'success' ? 'text-emerald-500' : it.status === 'failed' ? 'text-red-500' : ''}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink-900 truncate">
                            {it.title || `口播文案 ${it.idx + 1}`}
                          </span>
                          <Badge className={sm.color}>{sm.label}</Badge>
                        </div>
                        <p className="text-xs text-ink-500 mt-1 line-clamp-2">{it.content}</p>
                        {it.status === 'failed' && it.error && (
                          <p className="text-xs text-red-500 mt-1">{it.error}</p>
                        )}
                      </div>
                    </div>
                    {it.status === 'success' && it.video_url && (
                      <div className="mt-3 flex items-center gap-3">
                        <video
                          src={videoUrl(it.video_url)}
                          controls
                          className="h-28 rounded-lg bg-black"
                          preload="metadata"
                        />
                        <div className="flex flex-col gap-1.5">
                          <Button variant="secondary" size="sm" as="a" href={videoUrl(it.video_url)} download>
                            <Download className="w-3.5 h-3.5 mr-1" /> 下载视频
                          </Button>
                          <Button variant="ghost" size="sm" as="a" href="/publish" target="_blank">
                            <Send className="w-3.5 h-3.5 mr-1" /> 去发布
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {detail.status !== 'running' && detail.failed > 0 && (
              <Button variant="secondary" onClick={() => retryFailed(detail.id)}>
                <RefreshCw className="w-4 h-4 mr-1.5" /> 重跑失败项（{detail.failed} 条）
              </Button>
            )}

            {/* Phase 2：批量矩阵操作 */}
            {detail.status !== 'running' && detail.success > 0 && (
              <div className="border-t border-ink-100 pt-4 mt-2">
                <div className="text-xs font-medium text-ink-500 mb-2">批量矩阵</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="secondary" size="sm" loading={schedBusy} onClick={() => scheduleProject(detail.id)}>
                    <CalendarClock className="w-3.5 h-3.5 mr-1" /> 批量排期发布
                  </Button>
                  <select
                    value={schedInterval}
                    onChange={(e) => setSchedInterval(Number(e.target.value))}
                    className="text-xs px-2 py-1.5 border border-ink-200 rounded-lg outline-none"
                    title="相邻两条发布时间间隔"
                  >
                    {[15, 30, 60, 120, 360, 720].map((m) => (
                      <option key={m} value={m}>{m} 分钟间隔</option>
                    ))}
                  </select>
                  <Button variant="secondary" size="sm" onClick={() => setMetricsOpen(true)}>
                    <BarChart3 className="w-3.5 h-3.5 mr-1" /> 录入效果
                  </Button>
                  <Button variant="secondary" size="sm" loading={reviewBusy} onClick={() => runReview(detail.id)}>
                    <BookOpenCheck className="w-3.5 h-3.5 mr-1" /> AI 复盘
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setTplOpen(true)}>
                    <Save className="w-3.5 h-3.5 mr-1" /> 存为模板
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── 录入效果 Modal ── */}
      <Modal open={metricsOpen} onClose={() => setMetricsOpen(false)} title="录入发布效果数据" width="md">
        <div className="space-y-3">
          <p className="text-xs text-ink-400">把发布后的数据回填到本项目，供 AI 复盘分析（每条视频共用该数据）。</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['views', '播放量'], ['likes', '点赞'], ['comments', '评论'],
              ['shares', '转发'], ['followers_gained', '涨粉'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="block text-sm font-medium text-ink-700 mb-1">{label}</label>
                <input
                  type="number"
                  min="0"
                  value={metricsForm[k]}
                  onChange={(e) => setMetricsForm((f) => ({ ...f, [k]: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-ink-200 rounded-xl outline-none focus:border-amber-500"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setMetricsOpen(false)}>取消</Button>
            <Button variant="primary" loading={metricsBusy} onClick={() => submitMetrics(detail.id)}>
              保存效果数据
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── AI 复盘 Modal ── */}
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="AI 矩阵复盘" width="lg">
        {reviewBusy ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        ) : review ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-ink-400">
              <span>数据点：{review.data_points}</span>
              <span>总播放：{review.total_views}</span>
              <span>总点赞：{review.total_likes}</span>
              <span>总涨粉：{review.total_followers}</span>
            </div>
            <div className="prose prose-sm max-w-none text-ink-700 whitespace-pre-wrap leading-relaxed text-sm">
              {review.report}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── 存为模板 Modal ── */}
      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="保存为口播模板" width="md">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">模板名称 *</label>
            <input
              value={tplForm.name}
              onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={detail ? `${detail.theme} 模板` : '例如：美食种草口播'}
              className="w-full px-3 py-2 border border-ink-200 rounded-xl outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">主题模式（可选，{'{产品}'} 等占位符可替换）</label>
            <input
              value={tplForm.theme_pattern}
              onChange={(e) => setTplForm((f) => ({ ...f, theme_pattern: e.target.value }))}
              placeholder={detail ? detail.theme : '例如：{产品}的 3 个使用技巧'}
              className="w-full px-3 py-2 border border-ink-200 rounded-xl outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">备注（可选）</label>
            <input
              value={tplForm.note}
              onChange={(e) => setTplForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="适用类目/场景…"
              className="w-full px-3 py-2 border border-ink-200 rounded-xl outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setTplOpen(false)}>取消</Button>
            <Button variant="primary" loading={tplSaving} onClick={() => saveTemplate(detail || {})}>
              <Save className="w-4 h-4 mr-1.5" /> 保存模板
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
