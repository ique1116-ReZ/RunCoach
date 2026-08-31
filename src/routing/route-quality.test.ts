import { describe, expect, it } from 'vitest'
import { analyzeLoopQuality } from './route-quality'

describe('analyzeLoopQuality', () => {
  it('接受闭合且不折返的环线', () => {
    const result = analyzeLoopQuality({
      coordinates: [[116.4, 39.9], [116.42, 39.9], [116.42, 39.92], [116.4, 39.92], [116.4, 39.9]],
      distanceM: 7500
    })
    expect(result.acceptable).toBe(true)
    expect(result.backtrackDistanceM).toBeLessThan(120)
  })

  it('拒绝沿同一条路出去再返回的伪环线', () => {
    const result = analyzeLoopQuality({
      coordinates: [[116.4, 39.9], [116.41, 39.9], [116.42, 39.9], [116.41, 39.9], [116.4, 39.9]],
      distanceM: 3400
    })
    expect(result.acceptable).toBe(false)
    expect(result.reason).toContain('回头路')
    expect(result.backtrackDistanceM).toBeGreaterThan(1000)
  })

  it('拒绝没有回到起点的路线', () => {
    const result = analyzeLoopQuality({
      coordinates: [[116.4, 39.9], [116.42, 39.9], [116.42, 39.92], [116.405, 39.905]],
      distanceM: 6000
    })
    expect(result.acceptable).toBe(false)
    expect(result.reason).toContain('起点')
  })
})
