import { describe, it, expect, vi } from 'vitest'
import {
  buildCoachSystemPrompt,
  runAgent,
  COACH_SYSTEM_PROMPT,
  CYCLING_HEART_RATE_SETTINGS_GUIDANCE,
  HEALTH_COACH_SYSTEM_PROMPT
} from './coach'

describe('runAgent', () => {
  it('系统提示词支持跑步和骑行复盘且拒绝无关请求', () => {
    expect(buildCoachSystemPrompt('training')).toBe(COACH_SYSTEM_PROMPT)
    expect(COACH_SYSTEM_PROMPT).toContain('跑步')
    expect(COACH_SYSTEM_PROMPT).toContain('骑行')
    expect(COACH_SYSTEM_PROMPT).toContain('activityType')
    expect(COACH_SYSTEM_PROMPT).toMatch(/km\/h/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/绝不能.*跑步配速/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/拒绝|只能/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/四段输出|轻松、耐力、节奏、阈值/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/续航能力.*爬坡能力.*冲刺能力/)
    expect(COACH_SYSTEM_PROMPT).toContain('六个训练计划目标')
    expect(COACH_SYSTEM_PROMPT).toMatch(/只挑一个.*最优先提升的能力/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/HRmax.*LTHR/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/不要复读数据看板|最少的一个或两个数字/)
    expect(COACH_SYSTEM_PROMPT).toContain('cyclingAnalysis.capabilities')
    expect(COACH_SYSTEM_PROMPT).toContain('flowSegment')
    expect(COACH_SYSTEM_PROMPT).toMatch(/referenceRequired=true.*只提示/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/不要在对话里追问数值/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/LTHR、HRmax（手填或基于年龄计算后回填）/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/禁止用本次骑行最高心率.*不要自行估算/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/<73%.*73–<81%.*≥90%/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/<81%.*81–<90%.*≥100%/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/能力提升后直接.*下一次训练建议/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/严禁生成.*关键证据/)
    expect(COACH_SYSTEM_PROMPT).toMatch(/不复述缺失指标|不要说“缺少\/未记录\/无法判断\/建议补充”/)
  })

  it('健康陪练使用小白可理解的强度和能力表达', () => {
    expect(buildCoachSystemPrompt('health')).toBe(HEALTH_COACH_SYSTEM_PROMPT)
    expect(HEALTH_COACH_SYSTEM_PROMPT).toContain('非常轻松（Z1）')
    expect(HEALTH_COACH_SYSTEM_PROMPT).toContain('轻松有氧（Z2）')
    expect(HEALTH_COACH_SYSTEM_PROMPT).toContain('持续活动时不容易累')
    expect(HEALTH_COACH_SYSTEM_PROMPT).toContain('腿部力量和应对上坡')
    expect(HEALTH_COACH_SYSTEM_PROMPT).toContain('短时间快速发力')
    expect(HEALTH_COACH_SYSTEM_PROMPT).toContain('六个训练计划目标')
    expect(HEALTH_COACH_SYSTEM_PROMPT).toMatch(/只挑一个.*最优先提升的能力/)
    expect(HEALTH_COACH_SYSTEM_PROMPT).toMatch(/能完整说话.*呼吸加快但可控制/)
    expect(HEALTH_COACH_SYSTEM_PROMPT).toMatch(/不要说“缺少\/未记录\/无法判断\/建议补充”/)
    expect(HEALTH_COACH_SYSTEM_PROMPT).toContain('①今天骑得怎么样；②异常、亮点和限制因素；③与过去水平的变化及能力雷达；④这次结果如何改变下一次训练')
    expect(HEALTH_COACH_SYSTEM_PROMPT).toMatch(/不要复读数据看板|最少的数字/)
  })

  it('系统提示词覆盖地形/起点引导与取消处理', () => {
    expect(COACH_SYSTEM_PROMPT).toMatch(/越野|地形/)
    expect(COACH_SYSTEM_PROMPT).toContain('ask_run_terrain')
    expect(COACH_SYSTEM_PROMPT).toContain('ask_start_point')
    expect(COACH_SYSTEM_PROMPT).toMatch(/取消/)
  })

  it('骑行缺少 HRmax/LTHR 时由 Agent 门禁引导设置并停止本轮复盘', async () => {
    const complete = vi.fn().mockResolvedValue({ message: { role: 'assistant', content: '', tool_calls: [
      { id: 'hr1', type: 'function', function: { name: 'analyze_run', arguments: '{"run_id":"ride-1"}' } }
    ] } })
    const executeTool = vi.fn().mockResolvedValue(JSON.stringify({
      cyclingAnalysis: { heartRateZones: { available: false, referenceRequired: true } }
    }))
    const out = await runAgent(
      { provider: 'kimi', model: 'kimi-k2.5', apiKey: 'k' },
      [{ role: 'user', content: '请复盘这次骑行' }],
      { runs: new Map(), onRoute: vi.fn() } as any,
      { complete: complete as any, executeTool: executeTool as any }
    )
    expect(complete).toHaveBeenCalledOnce()
    expect(out.at(-1)?.content).toBe(CYCLING_HEART_RATE_SETTINGS_GUIDANCE)
    expect(out.at(-1)?.content).not.toMatch(/能力|分区结果/)
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

  it('多步工具调用会原样回传模型的 reasoning_content', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ message: {
        role: 'assistant',
        content: '',
        reasoning_content: '先读取训练摘要。',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'analyze_run', arguments: '{"run_id":"ride-1"}' } }]
      } })
      .mockResolvedValueOnce({ message: { role: 'assistant', content: '分析完成。' } })

    await runAgent(
      { provider: 'kimi', model: 'kimi-k3', apiKey: 'k' },
      [{ role: 'user', content: '复盘这次骑行' }],
      { runs: new Map(), onRoute: vi.fn() } as any,
      { complete: complete as any, executeTool: async () => '{"activityType":"cycling"}' } as any
    )

    const secondRoundMessages = complete.mock.calls[1][1]
    expect(secondRoundMessages).toContainEqual(expect.objectContaining({
      role: 'assistant',
      reasoning_content: '先读取训练摘要。'
    }))
  })

  it('健康陪练模式把对应系统提示词发给模型', async () => {
    const complete = vi.fn().mockResolvedValue({ message: { role: 'assistant', content: '今天骑得很稳。' } })
    await runAgent(
      { provider: 'kimi', model: 'kimi-k2.5', apiKey: 'k' },
      [{ role: 'user', content: '请复盘这次骑行' }],
      { runs: new Map(), onRoute: vi.fn() } as any,
      { coachMode: 'health', complete: complete as any }
    )
    expect(complete.mock.calls[0][1][0]).toEqual({ role: 'system', content: HEALTH_COACH_SYSTEM_PROMPT })
  })
})
