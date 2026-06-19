// src/settings/SettingsGear.tsx
import { useState } from 'react'
import { type LlmConfig, type LlmProvider, llmProviderMeta, testApiKey, saveConfig, loadConfig } from '@/llm/provider'

export const SettingsGear = ({ onSaved }: { onSaved: (c: LlmConfig) => void }) => {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<LlmConfig>(
    loadConfig() ?? { provider: 'kimi', model: llmProviderMeta.kimi.defaultModel, apiKey: '' }
  )
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<string>('')

  const setProvider = (p: LlmProvider) => setCfg({ ...cfg, provider: p, model: llmProviderMeta[p].defaultModel })

  const onTest = async () => {
    setStatus('测试中…')
    const r = await testApiKey(cfg)
    setStatus(r.ok ? '✓ key 有效' : `✗ 无效：${r.error}`)
  }
  const onSave = () => { saveConfig(cfg); onSaved(cfg); setStatus('已保存'); setOpen(false) }

  return (
    <>
      <button className="gear-btn" title="设置" onClick={() => setOpen(v => !v)}>⚙</button>
      {open && (
        <div className="gear-panel">
          <label>模型平台</label>
          <select value={cfg.provider} onChange={e => setProvider(e.target.value as LlmProvider)}>
            <option value="kimi">Kimi</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          <label>Model</label>
          <input value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value })} />
          <label>API Key</label>
          <div className="key-row">
            <input type={show ? 'text' : 'password'} value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value })} />
            <button onClick={() => setShow(v => !v)}>{show ? '隐藏' : '显示'}</button>
          </div>
          <div className="gear-actions">
            <button onClick={onTest}>测试</button>
            <button className="primary" onClick={onSave}>保存</button>
          </div>
          {status && <div className="gear-status">{status}</div>}
        </div>
      )}
    </>
  )
}
