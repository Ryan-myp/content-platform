import React, { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, CheckCircle2, Loader2, Trash2, Cpu } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'

/**
 * 个人中心（本地免费版 · 精简）
 * 仅保留：中转站 API Key 配置（AI 计费走用户 Key）。
 * 无密码/邮箱/额度/会员等概念——本地单机、按中转站 token 计费。
 */
export default function ProfilePage({ user }) {
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // 中转站 Key
  const [relayKey, setRelayKey] = useState('')
  const [relayConfigured, setRelayConfigured] = useState(false)
  const [relayMasked, setRelayMasked] = useState('')
  const [relaySaving, setRelaySaving] = useState(false)
  const [relayVerifying, setRelayVerifying] = useState(false)
  const [relayModels, setRelayModels] = useState(0)
  const [relayBase, setRelayBase] = useState('')
  const [registerUrl, setRegisterUrl] = useState('https://aixinghuo.net/')
  const [provider, setProvider] = useState('aixinghuo')
  const [providers, setProviders] = useState(['aixinghuo', 'agnes'])

  const loadRelay = async () => {
    try {
      const res = await api.get('/api/relay/me')
      setRelayConfigured(res.data.configured)
      setRelayMasked(res.data.api_key_masked)
      setRelayBase(res.data.api_base || res.data.default_base)
      if (res.data.register_url) setRegisterUrl(res.data.register_url)
      if (res.data.provider) setProvider(res.data.provider)
      if (Array.isArray(res.data.providers)) setProviders(res.data.providers)
    } catch {
      /* 静默 */
    }
  }

  useEffect(() => {
    api
      .get('/api/auth/me')
      .then((res) => setProfile(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
    loadRelay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveRelay = async () => {
    if (!relayKey.trim()) {
      toast.warning('请输入中转站 API Key')
      return
    }
    setRelaySaving(true)
    try {
      const res = await api.put('/api/relay/me', { api_key: relayKey.trim(), provider })
      setRelayConfigured(true)
      setRelayMasked(res.data.api_key_masked)
      setRelayModels(res.data.models || 0)
      setRelayKey('')
      const hint = res.data.models
        ? `模型列表已从中转站同步（${res.data.models} 个），各创作页可自由切换模型`
        : 'Key 已保存，但模型列表同步失败，可重新保存重试'
      toast.success(hint, 5000)
      window.dispatchEvent(new CustomEvent('models-updated'))
    } catch (e) {
      toast.error(e.message || 'Key 保存失败，请确认是本站签发的中转站 Key')
    } finally {
      setRelaySaving(false)
    }
  }

  const verifyRelay = async () => {
    if (!relayKey.trim()) {
      toast.warning('请输入中转站 API Key')
      return
    }
    setRelayVerifying(true)
    try {
      const res = await api.post('/api/relay/verify', { api_key: relayKey.trim(), provider })
      toast.success(res.data.message || 'Key 有效，可以正常使用')
    } catch (e) {
      toast.error(e.message || 'Key 无效')
    } finally {
      setRelayVerifying(false)
    }
  }

  const clearRelay = async () => {
    if (!window.confirm('确定清除中转站 Key 吗？AI 功能将不可用（需重新配置）。')) return
    try {
      await api.delete('/api/relay/me')
      setRelayConfigured(false)
      setRelayMasked('')
      setRelayModels(0)
      toast.success('已清除中转站 Key 与模型列表')
      window.dispatchEvent(new CustomEvent('models-updated'))
    } catch (e) {
      toast.error(e.message || '清除失败')
    }
  }

  const displayName = profile?.nickname || profile?.username || user?.username || '本地用户'

  return (
    <div className="max-w-3xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-glow">
          {displayName[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink-900">{displayName}</h1>
          <p className="text-sm text-ink-500">
            本地免费运行 · AI 费用由你的中转站 Key 计费 · 数据仅存本机
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 中转站 API Key（唯一配置项） */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-soft p-6">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                <KeyRound className="w-4.5 h-4.5 text-amber-500" />
                中转站 API Key
              </h3>
              {relayConfigured && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已配置{relayModels ? ` · ${relayModels} 个模型` : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-400 mb-4 leading-relaxed">
              填写本站签发的中转站 Key 后，AI 功能（图片/视频/配音/数字人/工具）将使用你的 Key
              计费，并从你的中转站拉取模型列表（各创作页可自由切换模型）。中转站地址由平台固定，不可更改。
            </p>

            {!relayConfigured && (
              <a
                href={provider === 'aixinghuo' ? 'https://aixinghuo.net/' : 'https://apihub.agnes-ai.cn/'}
                target="_blank"
                rel="noreferrer"
                className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 hover:border-indigo-300 transition-colors group"
              >
                <div>
                  <div className="text-sm font-medium text-indigo-700 flex items-center gap-1.5">
                    还没有中转站 Key？
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5">
                    前往爱星火 aixinghuo.net 注册账号，在个人中心创建 API Key（sk- 开头）后回来填入即可使用全部 AI 功能
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium group-hover:bg-indigo-700 transition-colors">
                  前往注册领取 Key ↗
                </span>
              </a>
            )}

            {relayConfigured && (
              <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  当前 Key：<code className="font-mono">{relayMasked}</code>
                  <span className="text-xs text-emerald-500">（{relayBase}）</span>
                </div>
                <button
                  onClick={clearRelay}
                  className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清除
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">供应商</label>
                <div className="grid grid-cols-2 gap-2">
                  {providers.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProvider(p)}
                      className={`px-3 py-2.5 rounded-xl border text-sm transition-all text-left ${
                        provider === p
                          ? 'border-amber-500 bg-amber-50 text-amber-800 font-medium'
                          : 'border-ink-200 text-ink-600 hover:border-amber-300'
                      }`}
                    >
                      <span className="block font-medium">
                        {p === 'aixinghuo' ? '爱星火中转站' : 'AGNES 官方 API'}
                      </span>
                      <span className="block text-[11px] text-ink-400 mt-0.5">
                        {p === 'aixinghuo' ? 'aixinghuo.net · 需充值' : 'apihub.agnes-ai.cn · 有免费额度'}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-400 mt-1.5">
                  选择供应商后，保存 Key 会自动从该供应商拉取模型列表；切换供应商需重新填对应的 Key
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">API Key（{provider === 'aixinghuo' ? '爱星火' : 'AGNES'}）</label>
                <input
                  type="password"
                  value={relayKey}
                  onChange={(e) => setRelayKey(e.target.value)}
                  placeholder="sk- 开头的中转站 Key"
                  className="w-full px-3.5 py-2.5 border border-ink-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                  autoComplete="off"
                />
                <p className="text-xs text-ink-400 mt-1.5">
                  如何获取：注册中转站 → 个人中心创建 API Key（本站签名校验）
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={saveRelay}
                  disabled={relaySaving || !relayKey.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 transition-all"
                >
                  {relaySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  保存并同步模型
                </button>
                <button
                  onClick={verifyRelay}
                  disabled={relayVerifying || !relayKey.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-100 text-ink-700 rounded-xl font-medium hover:bg-ink-200 disabled:opacity-50 transition-all"
                >
                  {relayVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  仅校验
                </button>
              </div>
            </div>
          </div>

          {/* 使用说明 */}
          <div className="bg-white rounded-2xl border border-ink-200/60 shadow-soft p-6">
            <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-brand-500" />
              模型说明
            </h3>
            <ul className="text-sm text-ink-500 space-y-2 leading-relaxed">
              <li>· 配置中转站 Key 后，平台自动拉取你中转站的模型列表（不写死任何模型）</li>
              <li>· 图片/视频/配音/数字人等创作页均有模型选择器，可自由切换</li>
              <li>· 切换会按功能保存偏好，下次打开同一页面自动使用</li>
              <li>· 侧边栏底部「模型」可随时切换全局默认模型</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
