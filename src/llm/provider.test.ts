// src/llm/provider.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  chatCompletion,
  loadConfigForProvider,
  testApiKey,
  saveConfig,
  loadConfig,
  llmProviderMeta
} from './provider'

afterEach(() => vi.unstubAllGlobals())

describe('provider', () => {
  it('saveConfig/loadConfig 往返', () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v }
    })
    saveConfig({ provider: 'kimi', model: 'kimi-k2.6', apiKey: 'sk-x' })
    expect(loadConfig()).toEqual({ provider: 'kimi', model: 'kimi-k2.6', apiKey: 'sk-x' })
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
    expect(loadConfigForProvider('kimi').model).toBe('kimi-k2.6')
  })

  it('自动把已保存的 Kimi K2.5 迁移到 K2.6', () => {
    const store: Record<string, string> = {
      'virtualcoach.llm': JSON.stringify({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'old-key' }),
      'virtualcoach.llm.providers': JSON.stringify({
        kimi: { provider: 'kimi', model: 'kimi-k2.5', apiKey: 'old-key' }
      })
    }
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v }
    })
    expect(loadConfig()).toEqual({ provider: 'kimi', model: 'kimi-k2.6', apiKey: 'old-key' })
  })

  it('testApiKey: 200 → ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 })))
    const r = await testApiKey({ provider: 'deepseek', model: llmProviderMeta.deepseek.defaultModel, apiKey: 'k' })
    expect(r.ok).toBe(true)
  })

  it('testApiKey: 401 明确提示 Key 或平台不匹配', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'Invalid Authentication' }
    }), { status: 401 })))
    const r = await testApiKey({ provider: 'kimi', model: 'kimi-k2.5', apiKey: 'bad' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('拒绝了这个 API Key')
    expect(r.error).toContain('Invalid Authentication')
  })

  it('testApiKey: 模型不存在时给出可执行提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'The model does not exist or you do not have access to it.' }
    }), { status: 404 })))
    const r = await testApiKey({ provider: 'openai', model: 'expired-model', apiKey: 'key' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不存在、已下线或当前账户无权使用')
    expect(r.error).toContain('expired-model')
  })

  it('testApiKey: Kimi K3 无权限时提示充值条件', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })))
    const r = await testApiKey({ provider: 'kimi', model: 'kimi-k3', apiKey: 'key' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('完成充值后才能调用')
  })

  it('testApiKey: OpenAI 网络失败时不误报 Key 无效', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const r = await testApiKey({ provider: 'openai', model: 'gpt-5.6-terra', apiKey: 'key' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('无法连接')
    expect(r.error).toContain('不代表 API Key 错误')
    expect(r.error).toContain('api.openai.com')
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

  it.each([
    ['cn', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'],
    ['intl', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'],
    ['us', 'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions']
  ] as const)('Qwen %s Key 使用对应地域端点', async (qwenRegion, expectedUrl) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletion({
      provider: 'qwen',
      model: 'qwen3.8-flash',
      apiKey: 'region-key',
      qwenRegion
    }, [{ role: 'user', content: 'ping' }])
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe(expectedUrl)
  })

  it('Kimi K2.6 关闭思考以稳定执行工具调用，K3 不传 thinking', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletion({ provider: 'kimi', model: 'kimi-k2.6', apiKey: 'key' }, [{ role: 'user', content: 'ping' }])
    await chatCompletion({ provider: 'kimi', model: 'kimi-k3', apiKey: 'key' }, [{ role: 'user', content: 'ping' }])

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    const k26Body = JSON.parse(String(calls[0][1].body))
    const k3Body = JSON.parse(String(calls[1][1].body))
    expect(k26Body.thinking).toEqual({ type: 'disabled' })
    expect(k3Body).not.toHaveProperty('thinking')
  })

  it('测试 Kimi K3 时降低推理强度，避免简单连通性检查超时', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await testApiKey({ provider: 'kimi', model: 'kimi-k3', apiKey: ' key-with-spaces ' })

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    const body = JSON.parse(String(calls[0][1].body))
    expect(result.ok).toBe(true)
    expect(body.reasoning_effort).toBe('low')
    expect(calls[0][1].headers).toEqual(expect.objectContaining({ Authorization: 'Bearer key-with-spaces' }))
  })
})
