// src/llm/provider.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { chatCompletion, loadConfigForProvider, testApiKey, saveConfig, loadConfig, llmProviderMeta } from './provider'

afterEach(() => vi.unstubAllGlobals())

describe('provider', () => {
  it('saveConfig/loadConfig 往返', () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v }
    })
    saveConfig({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'sk-x' })
    expect(loadConfig()).toEqual({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'sk-x' })
  })

  it('分别保存每个平台的 key，并兼容切换回来', () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v }
    })
    saveConfig({ provider: 'openai', model: 'gpt-5.6-terra', apiKey: 'openai-key' })
    saveConfig({ provider: 'gemini', model: 'gemini-3.6-flash', apiKey: 'gemini-key' })
    expect(loadConfigForProvider('openai').apiKey).toBe('openai-key')
    expect(loadConfigForProvider('gemini').apiKey).toBe('gemini-key')
    expect(loadConfig()?.provider).toBe('gemini')
  })

  it('首次切换平台时把旧版活动配置迁移到平台配置表', () => {
    const store: Record<string, string> = {
      'virtualcoach.llm': JSON.stringify({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'old-key' })
    }
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v }
    })
    saveConfig({ provider: 'openai', model: 'gpt-5.6-terra', apiKey: 'new-key' })
    expect(loadConfigForProvider('kimi').apiKey).toBe('old-key')
  })

  it('testApiKey: 200 → ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 })))
    const r = await testApiKey({ provider: 'deepseek', model: llmProviderMeta.deepseek.defaultModel, apiKey: 'k' })
    expect(r.ok).toBe(true)
  })

  it('testApiKey: 401 → ok=false 带原因', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))
    const r = await testApiKey({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'bad' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('401')
  })

  it.each([
    ['openai', 'https://api.openai.com/v1/chat/completions'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
    ['qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions']
  ] as const)('%s 使用官方兼容端点并传递工具', async (provider, expectedUrl) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletion(
      { provider, model: llmProviderMeta[provider].defaultModel, apiKey: 'local-key' },
      [{ role: 'user', content: '分析骑行' }],
      [{ type: 'function', function: { name: 'analyze_run', parameters: { type: 'object' } } }]
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(expectedUrl)
    expect((init as RequestInit).headers).toEqual(expect.objectContaining({ Authorization: 'Bearer local-key' }))
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(expect.objectContaining({
      model: llmProviderMeta[provider].defaultModel,
      tool_choice: 'auto',
      tools: expect.any(Array)
    }))
  })
})
