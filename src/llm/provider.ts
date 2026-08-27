// src/llm/provider.ts
export type LlmProvider = 'kimi' | 'deepseek'
export type ComparisonRelation = 'auto' | 'same_athlete' | 'different_athletes'
export type LlmConfig = { provider: LlmProvider; model: string; apiKey: string }
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

export const llmProviderMeta: Record<LlmProvider, { label: string; baseUrl: string; defaultModel: string }> = {
  kimi: { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.5' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash' }
}

const STORAGE_KEY = 'virtualcoach.llm'
const LEGACY_STORAGE_KEY = 'runcoach.llm'

export const saveConfig = (c: LlmConfig) => localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
export const loadConfig = (): LlmConfig | null => {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as LlmConfig } catch { return null }
}

export const chatCompletion = async (config: LlmConfig, messages: ChatMessage[], tools?: any[]) => {
  const meta = llmProviderMeta[config.provider]
  const body: Record<string, unknown> = {
    model: config.model || meta.defaultModel,
    messages,
    stream: false
  }
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto' }
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
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}
