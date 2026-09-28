import { describe, expect, it } from 'vitest'
import type { Run } from '@runs/types'
import { calculateEffortScore, getEffortScore, heartRateCutoffs, snapshotEffortScore, weightedPower } from './effort'
import { buildCyclingAnalysis } from './cycling'
import { buildDashboardData } from './dashboard'
import { buildRunDigest } from './digest'

const ride = (seconds = 3600, hr = 140, power: number | undefined = 250): Run => ({
  id: 'effort', name: '骑行', activityType: 'cycling', sourceType: 'fit', sourcePath: 'ride.fit',
  totalTime: seconds * 1000, totalDistance: 10000, points: [], metricKeys: [],
  summaryEntries: [], lapSummaries: [], aggregateMetrics: {}, thresholdPower: 250,
  heartRateReference: { base: 'HRmax', value: 180, source: 'settings' },
  sensorPoints: Array.from({ length: seconds }, (_, i) => ({ time: i * 1000, timerTime: i * 1000, hr, power }))
})

describe('骑行负荷分', () => {
  it('一小时阈值功率为100，优先功率，保留原始小数', () => {
    expect(calculateEffortScore(ride())?.value).toBe(100)
    const score = calculateEffortScore(ride(4200, 140, 210))!
    expect(score.method).toBe('power')
    expect(score.value).toBeCloseTo(82.32)
    expect(score.displayValue).toBe(82)
    expect(score.intensityFactor).toBe(0.84)
  })

  it('滑行零功率有效，缺口不补零；80%边界及整次降级', () => {
    const run = ride(1000, 140, 0)
    expect(calculateEffortScore(run)?.value).toBe(0)
    run.sensorPoints!.forEach((p, i) => { p.power = i < 800 ? 250 : undefined })
    expect(calculateEffortScore(run)?.method).toBe('power')
    expect(calculateEffortScore(run)?.value).toBeCloseTo(100 * 1000 / 3600)
    run.sensorPoints![799].power = undefined
    expect(calculateEffortScore(run)?.method).toBe('heart_rate')
    run.thresholdPower = undefined
    expect(calculateEffortScore(run)?.method).toBe('heart_rate')
  })

  it('HR十段按时长计分，前台五区与后台子段一致且不外推缺口', () => {
    const run = ride()
    run.thresholdPower = undefined
    run.sensorPoints!.forEach((p, i) => { p.hr = i < 2400 ? 135 : 140 })
    const score = calculateEffortScore(run)!
    expect(score.value).toBeCloseTo(53.3333333)
    expect(score.segmentSeconds).toEqual([0, 0, 0, 2400, 1200, 0, 0, 0, 0, 0])
    expect(buildCyclingAnalysis(run).heartRateZones.zones[1].seconds).toBe(3600)
    run.sensorPoints!.forEach((p, i) => { p.hr = i < 2880 ? 135 : 0 })
    expect(calculateEffortScore(run)?.value).toBe(40)
    run.sensorPoints![2879].hr = undefined
    expect(calculateEffortScore(run)).toBeUndefined()
  })

  it('整数切点及严格大于Z5c的边界', () => {
    expect(heartRateCutoffs({ base: 'HRmax', value: 180, source: '' }))
      .toEqual([114, 123, 132, 139, 146, 153, 162, 168, 173])
    expect(heartRateCutoffs({ base: 'LTHR', value: 170, source: '' }))
      .toEqual([121, 130, 138, 146, 153, 160, 170, 176, 181])
    const run = ride(3600, 212)
    run.thresholdPower = undefined
    run.heartRateReference = { base: 'LTHR', value: 200, source: '' }
    expect(calculateEffortScore(run)?.value).toBe(120)
    run.sensorPoints!.forEach(p => { p.hr = 213 })
    expect(calculateEffortScore(run)?.value).toBe(140)
  })

  it('暂停不计时，规则采样前值保持，长缺口不计入HR覆盖', () => {
    const run = ride(600)
    run.sensorPoints = run.sensorPoints!.filter((_, i) => i % 5 === 0)
    run.sensorPoints.forEach(p => { if (p.time >= 300000) p.time += 1800000 })
    expect(calculateEffortScore(run)?.value).toBeCloseTo(100 / 6)
    run.thresholdPower = undefined
    expect(calculateEffortScore(run)?.value).toBe(10)
    run.sensorPoints = run.sensorPoints.filter(p => p.timerTime! < 200000 || p.timerTime! >= 400000)
    expect(calculateEffortScore(run)).toBeUndefined()
  })

  it('短缺口插值不影响恒定功率，30秒四次方算法保留变化影响', () => {
    const run = ride(600)
    run.sensorPoints![100].power = undefined
    run.sensorPoints![101].power = undefined
    expect(calculateEffortScore(run)?.weightedPower).toBe(250)
    const power = weightedPower([...Array(60).fill(0), ...Array(60).fill(300)])!
    expect(power).toBeGreaterThan(150)
    expect(power).toBeLessThan(300)
    expect(weightedPower([100, 200])).toBe(150)
  })

  it('不足5分钟不出值，短时及异常标记，不适用于跑步', () => {
    expect(calculateEffortScore(ride(299))).toBeUndefined()
    expect(calculateEffortScore(ride(300))?.shortActivity).toBe(true)
    expect(calculateEffortScore(ride(1200))?.shortActivity).toBe(false)
    expect(calculateEffortScore(ride(3600, 140, 500))?.needsVerification).toBe(true)
    expect(calculateEffortScore({ ...ride(), activityType: 'running' })).toBeUndefined()
  })

  it('看板及AI共用快照，更新阈值不改变已保存结果', () => {
    const run = snapshotEffortScore(ride())
    run.thresholdPower = 500
    expect(getEffortScore(run)?.value).toBe(100)
    expect(buildDashboardData(run).effortScore).toEqual(run.effortScore)
    expect(buildRunDigest(run).effortScore).toEqual(run.effortScore)
    expect(calculateEffortScore(run)?.value).toBe(25)
  })
})
