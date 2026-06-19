// src/llm/provider.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { testApiKey, saveConfig, loadConfig, llmProviderMeta } from './provider'

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
})
