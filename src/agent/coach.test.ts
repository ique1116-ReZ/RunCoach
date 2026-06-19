import { describe, it, expect, vi } from 'vitest'
import { runAgent, COACH_SYSTEM_PROMPT } from './coach'

describe('runAgent', () => {
  it('系统提示词限定跑步范围且要求严格拒绝越界', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('跑步')
    expect(COACH_SYSTEM_PROMPT).toMatch(/拒绝|只能/)
  })

  it('系统提示词覆盖地形/起点引导与取消处理', () => {
    expect(COACH_SYSTEM_PROMPT).toMatch(/越野|地形/)
    expect(COACH_SYSTEM_PROMPT).toContain('ask_run_terrain')
    expect(COACH_SYSTEM_PROMPT).toContain('ask_start_point')
    expect(COACH_SYSTEM_PROMPT).toMatch(/取消/)
  })

  it('模型先调工具、再据结果给最终回复', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ message: { role: 'assistant', content: '', tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'geocode_place', arguments: '{"query":"人民广场"}' } }
      ] } })
      .mockResolvedValueOnce({ message: { role: 'assistant', content: '好的，已定位。' } })

    const ctx = { runs: new Map(), onRoute: vi.fn() }
    const out = await runAgent(
      { provider: 'kimi', model: 'kimi-k2.5', apiKey: 'k' },
      [{ role: 'user', content: '从人民广场出发' }],
      ctx as any,
      { complete: complete as any, executeTool: async () => '{"hits":[]}' } as any
    )
    expect(complete).toHaveBeenCalledTimes(2)
    expect(out.at(-1)!.content).toContain('已定位')
  })
})
