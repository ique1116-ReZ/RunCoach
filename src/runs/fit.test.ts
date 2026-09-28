import { describe, expect, it } from 'vitest'
import { readFitSensorPoints, resolveFitTotalTimeMs } from './fit'

describe('resolveFitTotalTimeMs', () => {
  it('保留无GPS传感器数据，暂停期间记录不计时或计分', () => {
    const points = readFitSensorPoints([
      { timestamp: new Date(0), heart_rate: 140, power: 200 },
      { timestamp: new Date(1000), heart_rate: 140, power: 200 },
      { timestamp: new Date(5000), heart_rate: 160, power: 500 },
      { timestamp: new Date(11000), heart_rate: 140, power: 200 },
      { timestamp: new Date(12000), heart_rate: 140, power: 200 }
    ], [
      { event: 'timer', event_type: 'start', timestamp: new Date(0) },
      { event: 'timer', event_type: 'stop', timestamp: new Date(2000) },
      { event: 'timer', event_type: 'start', timestamp: new Date(11000) }
    ])
    expect(points.map(p => p.timerTime)).toEqual([0, 1000, 2000, 2000, 2000, 3000])
    expect(points.find(p => p.time === 5000)?.hr).toBeUndefined()
    expect(points.find(p => p.time === 5000)?.power).toBeUndefined()
    expect(points.at(-1)?.power).toBe(200)
  })
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
