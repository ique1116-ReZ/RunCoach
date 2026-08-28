import { describe, expect, it } from 'vitest'
import { resolveFitTotalTimeMs } from './fit'

describe('resolveFitTotalTimeMs', () => {
  it('优先使用 session.total_timer_time，排除暂停时间', () => {
    expect(resolveFitTotalTimeMs(
      { total_timer_time: 5 * 60 * 60 },
      [{ timer_time: 7 * 60 * 60 }],
      0,
      7 * 60 * 60 * 1000
    )).toBe(5 * 60 * 60 * 1000)
  })

  it('没有 session 计时器时使用最后一条记录的 timer_time', () => {
    expect(resolveFitTotalTimeMs(
      {},
      [{ timer_time: 0 }, { timer_time: 5 * 60 * 60 }],
      0,
      7 * 60 * 60 * 1000
    )).toBe(5 * 60 * 60 * 1000)
  })

  it('旧 FIT 没有 timer_time 时回退到时间戳跨度', () => {
    expect(resolveFitTotalTimeMs({}, [{}], 1000, 8000)).toBe(7000)
  })
})
