import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type LlmConfig,
  type LlmProvider,
  llmProviderMeta,
  llmProviders,
  loadConfig,
  loadConfigForProvider,
  saveConfig,
  testApiKey
} from '@/llm/provider'
import {
  cyclingHeartRateRatioWarning,
  estimateHrmaxFromAge,
  loadCyclingHeartRateProfile,
  parseOptionalInteger,
  resolveCyclingHeartRateReference,
  saveCoachMode,
  saveCyclingHeartRateProfile,
  saveHomeBackground,
  type CoachMode,
  type CyclingHeartRateProfile,
  type HomeBackground
} from '@/app/preferences'

type HeartRateDraft = {
  hrmax: string
  lthr: string
  age: string
}

const profileToDraft = (profile: CyclingHeartRateProfile): HeartRateDraft => ({
  hrmax: profile.hrmax?.toString() ?? '',
  lthr: profile.lthr?.toString() ?? '',
  age: profile.age?.toString() ?? ''
})

const readHeartRateDraft = (draft: HeartRateDraft): { profile?: CyclingHeartRateProfile; error?: string } => {
  const fields = [
    { key: 'hrmax' as const, value: draft.hrmax, label: '最大心率', min: 30, max: 230 },
    { key: 'lthr' as const, value: draft.lthr, label: '阈值心率', min: 30, max: 230 },
    { key: 'age' as const, value: draft.age, label: '年龄', min: 18, max: 80 }
  ]
  const profile: CyclingHeartRateProfile = {}
  for (const field of fields) {
    if (!field.value.trim()) continue
    const parsed = parseOptionalInteger(field.value)
    if (parsed === undefined || parsed < field.min || parsed > field.max) {
      return { error: `${field.label}请输入 ${field.min}～${field.max} 之间的整数。` }
    }
    profile[field.key] = parsed
  }
  return { profile }
}

export const SettingsGear = ({
  onSaved,
  onHeartRateSaved,
  coachMode,
  onCoachModeChange,
  homeBackground,
  onHomeBackgroundChange,
  openHeartRateRequest = 0
}: {
  onSaved: (config: LlmConfig) => void
  onHeartRateSaved: (profile: CyclingHeartRateProfile) => void
  coachMode: CoachMode
  onCoachModeChange: (value: CoachMode) => void
  homeBackground: HomeBackground
  onHomeBackgroundChange: (value: HomeBackground) => void
  openHeartRateRequest?: number
}) => {
  const initialConfig = loadConfig() ?? loadConfigForProvider('kimi')
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<LlmConfig>(initialConfig)
  const [mode, setMode] = useState<CoachMode>(coachMode)
  const [heartRateDraft, setHeartRateDraft] = useState<HeartRateDraft>(() => profileToDraft(loadCyclingHeartRateProfile()))
  const [bg, setBg] = useState<HomeBackground>(homeBackground)
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<string>('')
  const hrmaxInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (openHeartRateRequest <= 0) return
    setOpen(true)
    window.setTimeout(() => hrmaxInputRef.current?.focus(), 0)
  }, [openHeartRateRequest])

  const parsedHeartRate = useMemo(() => readHeartRateDraft(heartRateDraft), [heartRateDraft])
  const estimatedHrmax = estimateHrmaxFromAge(parsedHeartRate.profile?.age)
  const activeReference = parsedHeartRate.profile
    ? resolveCyclingHeartRateReference(parsedHeartRate.profile)
    : undefined
  const ratioWarning = parsedHeartRate.profile
    ? cyclingHeartRateRatioWarning(parsedHeartRate.profile)
    : undefined
  const models = llmProviderMeta[cfg.provider].models.includes(cfg.model)
    ? llmProviderMeta[cfg.provider].models
    : [cfg.model, ...llmProviderMeta[cfg.provider].models]

  const setProvider = (provider: LlmProvider) => {
    setCfg(loadConfigForProvider(provider))
    setStatus('')
  }

  const updateHeartRateDraft = (key: keyof HeartRateDraft, value: string) => {
    setHeartRateDraft(current => ({ ...current, [key]: value }))
    setStatus('')
  }

  const updateAge = (value: string) => {
    const age = parseOptionalInteger(value)
    const hrmax = estimateHrmaxFromAge(age)
    setHeartRateDraft(current => ({
      ...current,
      age: value,
      ...(hrmax !== undefined ? { hrmax: String(hrmax) } : {})
    }))
    setStatus('')
  }

  const onTest = async () => {
    if (!cfg.apiKey.trim()) {
      setStatus('请先输入 API Key。')
      return
    }
    setStatus('测试中…')
    const result = await testApiKey(cfg)
    setStatus(result.ok ? 'API Key 有效' : `测试失败：${result.error}`)
  }

  const onSave = () => {
    const parsed = readHeartRateDraft(heartRateDraft)
    if (!parsed.profile) {
      setStatus(parsed.error ?? '心率设置无效。')
      return
    }
    const savedHeartRate = saveCyclingHeartRateProfile(parsed.profile)
    const savedMode = saveCoachMode(mode)
    const savedConfig = saveConfig(cfg)
    saveHomeBackground(bg)
    if (savedConfig) onSaved(savedConfig)
    onHeartRateSaved(savedHeartRate)
    onCoachModeChange(savedMode)
    onHomeBackgroundChange(bg)
    setHeartRateDraft(profileToDraft(savedHeartRate))
    setStatus('已保存到当前浏览器')
  }

  return (
    <>
      <button className="gear-btn" title="设置" aria-label="设置" aria-expanded={open} onClick={() => setOpen(value => !value)}>⚙</button>
      {open && (
        <div className="gear-panel">
          <section className="settings-section" aria-labelledby="coach-mode-settings-title">
            <h2 id="coach-mode-settings-title">解读方式</h2>
            <div className="coach-mode-control" role="radiogroup" aria-labelledby="coach-mode-settings-title">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'training'}
                className={mode === 'training' ? 'active' : ''}
                onClick={() => { setMode('training'); setStatus('') }}
              >
                <strong>进阶训练</strong>
                <span>训练刺激与能力方向</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'health'}
                className={mode === 'health' ? 'active' : ''}
                onClick={() => { setMode('health'); setStatus('') }}
              >
                <strong>健康陪练</strong>
                <span>易懂体感与健康建议</span>
              </button>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="llm-settings-title">
            <h2 id="llm-settings-title">AI 模型</h2>
            <label htmlFor="llm-provider">模型平台</label>
            <select id="llm-provider" value={cfg.provider} onChange={event => setProvider(event.target.value as LlmProvider)}>
              {llmProviders.map(provider => (
                <option key={provider} value={provider}>{llmProviderMeta[provider].label}</option>
              ))}
            </select>
            <label htmlFor="llm-model">模型</label>
            <select id="llm-model" value={cfg.model} onChange={event => setCfg({ ...cfg, model: event.target.value })}>
              {models.map(model => <option key={model} value={model}>{model}</option>)}
            </select>
            <label htmlFor="llm-api-key">API Key</label>
            <div className="key-row">
              <input
                id="llm-api-key"
                type={show ? 'text' : 'password'}
                autoComplete="off"
                value={cfg.apiKey}
                onChange={event => setCfg({ ...cfg, apiKey: event.target.value })}
              />
              <button type="button" onClick={() => setShow(value => !value)}>{show ? '隐藏' : '显示'}</button>
            </div>
          </section>

          <section className="settings-section heart-rate-settings" aria-labelledby="heart-rate-settings-title">
            <h2 id="heart-rate-settings-title">骑行心率分区</h2>
            <div className="settings-input-grid">
              <div>
                <label htmlFor="cycling-hrmax">最大心率 HRmax</label>
                <input
                  ref={hrmaxInputRef}
                  id="cycling-hrmax"
                  inputMode="numeric"
                  placeholder="例如 188"
                  value={heartRateDraft.hrmax}
                  onChange={event => updateHeartRateDraft('hrmax', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="cycling-age">不知道 HRmax？填年龄</label>
                <input
                  id="cycling-age"
                  inputMode="numeric"
                  placeholder="18～80"
                  value={heartRateDraft.age}
                  onChange={event => updateAge(event.target.value)}
                />
              </div>
            </div>
            <label htmlFor="cycling-lthr">骑行阈值心率 LTHR</label>
            <input
              id="cycling-lthr"
              inputMode="numeric"
              placeholder="例如 168"
              value={heartRateDraft.lthr}
              onChange={event => updateHeartRateDraft('lthr', event.target.value)}
            />
            {parsedHeartRate.error && <div className="settings-note warning">{parsedHeartRate.error}</div>}
            {estimatedHrmax !== undefined && heartRateDraft.hrmax === String(estimatedHrmax) && (
              <div className="settings-note">已按年龄填入 HRmax：{estimatedHrmax} bpm</div>
            )}
            {activeReference && (
              <div className="settings-note active">当前采用：{activeReference.base} {activeReference.value} bpm</div>
            )}
            {ratioWarning && <div className="settings-note warning">{ratioWarning}</div>}
          </section>

          <section className="settings-section" aria-labelledby="display-settings-title">
            <h2 id="display-settings-title">显示</h2>
            <label htmlFor="home-background">首页背景</label>
            <select id="home-background" value={bg} onChange={event => {
              const value = event.target.value as HomeBackground
              setBg(value)
              onHomeBackgroundChange(value)
            }}>
              <option value="contour">等高线地图</option>
              <option value="dither">Dither 点阵</option>
            </select>
          </section>

          <div className="gear-actions">
            <button type="button" onClick={onTest}>测试 API</button>
            <button type="button" className="primary" onClick={onSave}>保存</button>
          </div>
          {status && <div className="gear-status" role="status">{status}</div>}
        </div>
      )}
    </>
  )
}
