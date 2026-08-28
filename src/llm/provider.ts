export const llmProviders = ['kimi', 'deepseek', 'openai', 'gemini', 'qwen'] as const

export type LlmProvider = typeof llmProviders[number]
export type QwenRegion = 'cn' | 'intl' | 'us'
export type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'
export type LlmConfig = {
  provider: LlmProvider
  model: string
  apiKey: string
  qwenRegion?: QwenRegion
}
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoning_content?: string
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

type LlmProviderMetadata = {
  label: string
  baseUrl: string
  defaultModel: string
  models: readonly string[]
  connectionNote?: string
  modelNotes?: Readonly<Record<string, string>>
}

export const qwenRegionMeta: Record<QwenRegion, { label: string; baseUrl: string }> = {
  cn: {
    label: '中国大陆（北京）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  },
  intl: {
    label: '国际版（新加坡）',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  },
  us: {
    label: '国际版（美国）',
    baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1'
  }
}

export const llmProviderMeta: Record<LlmProvider, LlmProviderMetadata> = {
  kimi: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
    models: ['kimi-k2.6', 'kimi-k3'],
    modelNotes: {
      'kimi-k3': 'Kimi K3 需要在开放平台完成充值后才能调用。'
    }
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
    models: ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    connectionNote: '需要当前网络能访问 api.openai.com；中国大陆网络可能直接连接超时。'
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.6-flash',
    models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
    connectionNote: '需要当前网络能访问 Google Gemini 官方 API；中国大陆网络可能直接连接超时。'
  },
  qwen: {
    label: '通义千问 Qwen',
    baseUrl: qwenRegionMeta.cn.baseUrl,
    defaultModel: 'qwen3.8-flash',
    models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.8-flash'],
    connectionNote: 'API Key 与接口地域必须一致；中国大陆版和国际版 Key 不能混用。'
  }
}

const STORAGE_KEY = 'virtualcoach.llm'
const PROVIDERS_STORAGE_KEY = 'virtualcoach.llm.providers'
const LEGACY_STORAGE_KEY = 'runcoach.llm'
const REQUEST_TIMEOUT_MS = 180_000
const TEST_TIMEOUT_MS = 20_000

const isLlmProvider = (value: unknown): value is LlmProvider =>
  typeof value === 'string' && llmProviders.includes(value as LlmProvider)

const isQwenRegion = (value: unknown): value is QwenRegion =>
  value === 'cn' || value === 'intl' || value === 'us'

const normalizeModel = (provider: LlmProvider, value: unknown): string => {
  const model = typeof value === 'string' ? value.trim() : ''
  if (provider === 'kimi' && model === 'kimi-k2.5') return 'kimi-k2.6'
  return model || llmProviderMeta[provider].defaultModel
}

const normalizeConfig = (value: unknown): LlmConfig | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<LlmConfig>
  if (!isLlmProvider(candidate.provider)) return null
  const normalized: LlmConfig = {
    provider: candidate.provider,
    model: normalizeModel(candidate.provider, candidate.model),
    apiKey: typeof candidate.apiKey === 'string' ? candidate.apiKey.trim() : ''
  }
  if (candidate.provider === 'qwen') {
    normalized.qwenRegion = isQwenRegion(candidate.qwenRegion) ? candidate.qwenRegion : 'cn'
  }
  return normalized
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
  return normalizeConfig({ provider, model: llmProviderMeta[provider].defaultModel, apiKey: '' })!
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

export const resolveBaseUrl = (config: LlmConfig): string => {
  if (config.provider !== 'qwen') return llmProviderMeta[config.provider].baseUrl
  return qwenRegionMeta[config.qwenRegion ?? 'cn'].baseUrl
}

const extractErrorDetail = (raw: string): string => {
  if (!raw.trim()) return ''
  try {
    const parsed = JSON.parse(raw)
    const detail = parsed?.error?.message ?? parsed?.message ?? parsed?.error_msg ?? parsed?.error
    if (typeof detail === 'string') return detail.slice(0, 240)
  } catch {
    // Non-JSON provider errors are handled below.
  }
  return raw.replace(/\s+/g, ' ').trim().slice(0, 240)
}

const modelLooksUnavailable = (detail: string): boolean =>
  /model|模型/i.test(detail) && /not found|not exist|does not exist|invalid|unsupported|permission|access|不存在|无权限|未开通/i.test(detail)

const formatHttpError = (config: LlmConfig, status: number, rawDetail: string): string => {
  const label = llmProviderMeta[config.provider].label
  const detail = extractErrorDetail(rawDetail)
  const suffix = detail ? `（平台信息：${detail}）` : ''

  if (status === 401) {
    const regionHint = config.provider === 'qwen' ? '，并确认接口地域与 Key 一致' : ''
    return `${label} 拒绝了这个 API Key。请确认 Key 来自当前平台${regionHint}。${suffix}`
  }
  if (status === 402 || /insufficient.*(balance|quota)|balance.*insufficient|余额不足|欠费/i.test(detail)) {
    return `${label} 账户余额或可用额度不足，请到平台控制台检查计费状态。${suffix}`
  }
  if (config.provider === 'kimi' && config.model === 'kimi-k3' && status === 403) {
    return `Kimi K3 需要在开放平台完成充值后才能调用。${suffix}`
  }
  if (status === 403) {
    return `${label} 已收到 Key，但当前账户、地区或业务空间没有模型 ${config.model} 的权限。${suffix}`
  }
  if (status === 404 || (status === 400 && modelLooksUnavailable(detail))) {
    return `模型 ${config.model} 不存在、已下线或当前账户无权使用。请换用推荐模型，或输入平台控制台显示的模型 ID。${suffix}`
  }
  if (status === 429) {
    return `${label} 当前被限流，或账户额度已用完。请稍后重试并检查平台额度。${suffix}`
  }
  if (status >= 500) {
    return `${label} 服务暂时异常（HTTP ${status}），请稍后重试。${suffix}`
  }
  return `${label} 请求失败（HTTP ${status}）。${suffix}`
}

const formatNetworkError = (config: LlmConfig, error: unknown): string => {
  const label = llmProviderMeta[config.provider].label
  const host = new URL(resolveBaseUrl(config)).host
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  const timeout = name === 'AbortError' || name === 'TimeoutError'
  const prefix = timeout ? '连接超时' : '无法连接'
  const keyHint = config.provider === 'openai' || config.provider === 'gemini'
    ? '这不代表 API Key 错误。'
    : ''
  return `${label} 官方接口${prefix}。请确认当前网络和浏览器能访问 ${host}。${keyHint}`
}

const fetchCompletion = async (
  config: LlmConfig,
  messages: ChatMessage[],
  tools: any[] | undefined,
  timeoutMs: number,
  testMode = false
) => {
  const model = normalizeModel(config.provider, config.model)
  const body: Record<string, unknown> = { model, messages, stream: false }
  if (tools?.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }
  if (config.provider === 'kimi' && (model === 'kimi-k2.6' || model === 'kimi-k2.5')) {
    body.thinking = { type: 'disabled' }
  }
  if (config.provider === 'kimi' && model === 'kimi-k3' && testMode) {
    body.reasoning_effort = 'low'
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${resolveBaseUrl(config)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (error) {
    throw new Error(formatNetworkError(config, error))
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(formatHttpError({ ...config, model }, response.status, detail))
  }
  const data = await response.json()
  return { message: data?.choices?.[0]?.message }
}

export const chatCompletion = async (config: LlmConfig, messages: ChatMessage[], tools?: any[]) =>
  fetchCompletion(config, messages, tools, REQUEST_TIMEOUT_MS)

export const testApiKey = async (config: LlmConfig): Promise<{ ok: boolean; error?: string }> => {
  try {
    await fetchCompletion(config, [{ role: 'user', content: '只回复 OK' }], undefined, TEST_TIMEOUT_MS, true)
    return { ok: true }
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}
