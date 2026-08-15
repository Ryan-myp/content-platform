import React, { useEffect, useState } from 'react'
import { Check, ChevronDown, Cpu, Loader2, KeyRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useToast } from '../lib/toast'

/**
 * 全局模型快速切换（侧边栏底部）。
 * 模型列表来自用户中转站（未配置 Key 时为空 → 引导去个人中心配置）。
 * 切换保存到「默认模型」偏好，各创作页的模型选择器可单独设置并覆盖。
 */
export default function ModelSwitcher() {
  const toast = useToast()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [models, setModels] = useState([])
  const [relayConfigured, setRelayConfigured] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await api.get('/api/config')
      setCurrent(res.data.default_model || res.data.model_name || '')
      setModels((Array.isArray(res.data.models) ? res.data.models : []).map((m) => m?.name || m))
      setRelayConfigured(!!res.data.relay_configured)
    } catch {
      // 静默
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const onUpdate = () => load()
    window.addEventListener('models-updated', onUpdate)
    return () => window.removeEventListener('models-updated', onUpdate)
  }, [])

  const handleSelect = async (model) => {
    if (model === current) {
      setOpen(false)
      return
    }
    setSaving(true)
    try {
      await api.put('/api/model-prefs', { default: model })
      setCurrent(model)
      setOpen(false)
      toast.success(`默认模型已切换为 ${model}`)
    } catch (err) {
      toast.error(err.message || '切换模型失败')
    } finally {
      setSaving(false)
    }
  }

  const modelOptions = models.some((m) => m === current)
    ? models
    : [current, ...models].filter(Boolean)

  return (
    <div className="relative px-3 mb-1">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-ink-200/70 hover:border-brand-300 transition-colors text-left"
        title="切换默认模型"
      >
        <span className="flex items-center gap-2 min-w-0">
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin flex-shrink-0" />
          ) : (
            <Cpu className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
          )}
          <span className="text-xs text-ink-500 flex-shrink-0">模型</span>
          <span className="text-xs font-medium text-ink-800 truncate">
            {loading ? '加载中…' : current || (relayConfigured ? '未选择' : '未配置 Key')}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-3 right-3 mb-2 z-50 bg-white rounded-xl shadow-xl border border-ink-200/70 p-1.5 animate-page-in">
            <p className="px-2.5 py-1.5 text-[10px] text-ink-400 font-medium">
              默认模型（各创作页可单独选择）
            </p>
            {models.length === 0 ? (
              <div className="px-2.5 py-3 text-center">
                <p className="text-xs text-ink-500 mb-2">
                  {relayConfigured
                    ? '模型列表为空，请稍后重试或重新保存 Key'
                    : '未配置中转站 Key，无法使用 AI 功能'}
                </p>
                <div className="flex items-center justify-center gap-2">
                  {!relayConfigured && (
                    <a
                      href="https://aixinghuo.net/"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
                    >
                      去 aixinghuo.net 注册
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setOpen(false)
                      navigate('/profile')
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    去配置 Key
                  </button>
                </div>
              </div>
            ) : (
              modelOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => handleSelect(m)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                    m === current
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  <span className="truncate">{m}</span>
                  {m === current && <Check className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
