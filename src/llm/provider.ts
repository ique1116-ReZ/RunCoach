export const llmProviders = ['kimi', 'deepseek', 'openai', 'gemini', 'qwen'] as const

export type LlmProvider = typeof llmProviders[number]
export type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'
export type LlmConfig = { provider: LlmProvider; model: string; apiKey: string }
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

type LlmProviderMetadata = {
  label: string
  baseUrl: string
  defaultModel: string
  models: readonly string[]
}

export const llmProviderMeta: Record<LlmProvider, LlmProviderMetadata> = {
  kimi: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
    models: ['kimi-k2.5']
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner']
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-terra',
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.6-flash',
    models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']
  },
  qwen: {
    label: '通义千问 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.8-flash',
    models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.8-flash']
  }
}

const STORAGE_KEY = 'virtualcoach.llm'
const PROVIDERS_STORAGE_KEY = 'virtualcoach.llm.providers'
const LEGACY_STORAGE_KEY = 'runcoach.llm'

const isLlmProvider = (value: unknown): value is LlmProvider =>
  typeof value === 'string' && llmProviders.includes(value as LlmProvider)

const normalizeConfig = (value: unknown): LlmConfig | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<LlmConfig>
  if (!isLlmProvider(candidate.provider)) return null
  return {
    provider: candidate.provider,
    model: typeof candidate.model === 'string' && candidate.model.trim()
      ? candidate.model.trim()
      : llmProviderMeta[candidate.provider].defaultModel,
    apiKey: typeof candidate.apiKey === 'string' ? candidate.apiKey.trim() : ''
  }
}

const parseJson = (raw: string | null): unknown => {
  if (!raw) return undefined
  try { return JSON.parse(raw) } catch { return undefined }
}

const loadProviderConfigs = (): Partial<Record<LlmProvider, LlmConfig>> => {
  const parsed = parseJson(localStorage.getItem(PROVIDERS_STORAGE_KEY))
  if (!parsed || typeof parsed !== 'object') return {}
  const configs: Partial<Record<LlmProvider, LlmConfig>> = {}
  for (const provider of llmProviders) {
    const normalized = normalizeConfig((parsed as Record<string, unknown>)[provider])
    if (normalized?.provider === provider) configs[provider] = normalized
  }
  return configs
}

export const loadConfig = (): LlmConfig | null => {
  const active = normalizeConfig(parseJson(localStorage.getItem(STORAGE_KEY)))
    ?? normalizeConfig(parseJson(localStorage.getItem(LEGACY_STORAGE_KEY)))
  if (!active) return null
  return loadProviderConfigs()[active.provider] ?? active
}

export const loadConfigForProvider = (provider: LlmProvider): LlmConfig => {
  const saved = loadProviderConfigs()[provider]
  if (saved) return saved
  const active = loadConfig()
  if (active?.provider === provider) return active
  return { provider, model: llmProviderMeta[provider].defaultModel, apiKey: '' }
}

export const saveConfig = (config: LlmConfig) => {
  const normalized = normalizeConfig(config)
  if (!normalized) return null
  const configs = loadProviderConfigs()
  const previousActive = normalizeConfig(parseJson(localStorage.getItem(STORAGE_KEY)))
    ?? normalizeConfig(parseJson(localStorage.getItem(LEGACY_STORAGE_KEY)))
  if (previousActive && !configs[previousActive.provider]) {
    configs[previousActive.provider] = previousActive
  }
  configs[normalized.provider] = normalized
  localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(configs))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export const chatCompletion = async (config: LlmConfig, messages: ChatMessage[], tools?: any[]) => {
  const meta = llmProviderMeta[config.provider]
  const body: Record<string, unknown> = {
    model: config.model || meta.defaultModel,
    messages,
    stream: false
  }
  if (tools?.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }
  if (config.provider === 'kimi' && (config.model || meta.defaultModel).startsWith('kimi-k2.5')) {
    body.thinking = { type: 'disabled' }
  }
  const res = await fetch(`${meta.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM 请求失败（${res.status}）：${text || res.statusText}`)
  }
  const data = await res.json()
  return { message: data?.choices?.[0]?.message }
}

export const testApiKey = async (config: LlmConfig): Promise<{ ok: boolean; error?: string }> => {
  try {
    await chatCompletion(config, [{ role: 'user', content: 'ping' }])
    return { ok: true }
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}
