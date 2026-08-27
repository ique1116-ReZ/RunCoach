import { describe, it, expect } from 'vitest'
import { buildRunDigest, buildComparisonDigest } from './digest'
import type { Run } from '@runs/types'

const run: Run = {
  id: 'r1', name: '晨跑', activityType: 'running', sourcePath: 'a.gpx', sourceType: 'gpx',
  points: [
    { lat: 0, lon: 0, time: 0, hr: 140, speed: 3, metrics: { heart_rate: 140, speed: 3 }, distFromStart: 0 },
    { lat: 0, lon: 0.01, time: 60000, hr: 160, speed: 3.5, metrics: { heart_rate: 160, speed: 3.5 }, distFromStart: 1000 }
  ],
  totalDistance: 1000, totalTime: 60000,
  metricKeys: ['speed', 'heart_rate'], summaryEntries: [], lapSummaries: [], aggregateMetrics: {}
}

describe('buildRunDigest', () => {
  it('聚合距离/心率，缺失指标为 undefined', () => {
    const d: any = buildRunDigest(run)
    expect(d.totalDistanceKm).toBeCloseTo(1, 2)
    expect(d.averageHeartRate).toBe(150)
    expect(d.maxHeartRate).toBe(160)
    expect(d.averagePower).toBeUndefined()
  })
})

const runB: Run = {
  id: 'r2', name: '午跑', activityType: 'running', sourcePath: 'b.gpx', sourceType: 'gpx',
  points: [
    { lat: 0, lon: 0, time: 0, hr: 150, speed: 4, metrics: { heart_rate: 150, speed: 4 }, distFromStart: 0 },
    { lat: 0, lon: 0.02, time: 50000, hr: 170, speed: 4.5, metrics: { heart_rate: 170, speed: 4.5 }, distFromStart: 2000 }
  ],
  totalDistance: 2000, totalTime: 50000,
  metricKeys: ['speed', 'heart_rate'], summaryEntries: [], lapSummaries: [], aggregateMetrics: {}
}

describe('buildComparisonDigest', () => {
  it('a/b 子摘要反映各自跑步，relation 透传', () => {
    const cmp: any = buildComparisonDigest(run, runB, 'auto')
    expect(cmp.relation).toBe('auto')
    // a reflects runA (1 km)
    expect(cmp.a.totalDistanceKm).toBeCloseTo(1, 2)
    // b reflects runB (2 km)
    expect(cmp.b.totalDistanceKm).toBeCloseTo(2, 2)
    // distances are distinct
    expect(cmp.b.totalDistanceKm).toBeGreaterThan(cmp.a.totalDistanceKm)
    // delta is B - A = 1 km
    expect(cmp.routeComparison.totalDistanceDeltaKm).toBeCloseTo(1, 2)
    // checkpointPairs has 5 entries
    expect(cmp.checkpointPairs).toHaveLength(5)
  })
})

const ride: Run = {
  id: 'c1', name: '周末骑行', activityType: 'cycling', sourcePath: 'ride.fit', sourceType: 'fit',
  points: [
    { lat: 0, lon: 0, time: 0, hr: 130, speed: 8, power: 180, cadence: 82, metrics: { heart_rate: 130, speed: 8, power: 180, cadence: 82 }, distFromStart: 0 },
    { lat: 0, lon: 0.01, time: 60000, hr: 150, speed: 10, power: 240, cadence: 92, metrics: { heart_rate: 150, speed: 10, power: 240, cadence: 92 }, distFromStart: 540 }
  ],
  totalDistance: 540, totalTime: 60000,
  metricKeys: ['speed', 'heart_rate', 'power', 'cadence'], summaryEntries: [], lapSummaries: [], aggregateMetrics: {}
}

describe('buildRunDigest cycling', () => {
  it('骑行摘要使用 km/h、功率和 rpm，不输出跑步配速', () => {
    const digest: any = buildRunDigest(ride)
    expect(digest.activityType).toBe('cycling')
    expect(digest.averageSpeedKmh).toBeCloseTo(32.4, 1)
    expect(digest.maxSpeedKmh).toBeCloseTo(36, 1)
    expect(digest.averagePower).toBe(210)
    expect(digest.averageCadence).toBe(87)
    expect(digest.cadenceUnit).toBe('rpm')
    expect(digest.averagePace).toBeUndefined()
    expect(digest.checkpoints[0].pace).toBeUndefined()
    expect(digest.analysisFocus).toContain('骑行训练')
    expect(digest.cyclingAnalysis.heartRateZones.available).toBe(false)
    expect(digest.cyclingAnalysis.heartRateZones.referenceRequired).toBe(true)
    expect(digest.cyclingAnalysis.heartRateZones.zones).toHaveLength(0)
    expect(digest.cyclingAnalysis.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '续航能力' }),
      expect.objectContaining({ name: '爬坡能力' }),
      expect.objectContaining({ name: '冲刺能力' })
    ]))
  })

  it('有 FIT 个人阈值心率参考时使用 LTHR 区间，而不是本次最高心率', () => {
    const digest: any = buildRunDigest({
      ...ride,
      heartRateReference: { base: 'LTHR', value: 165, source: 'FIT zones_target.threshold_heart_rate' }
    })
    expect(digest.cyclingAnalysis.heartRateZones.basis).toBe('lthr')
    expect(digest.cyclingAnalysis.heartRateZones.referenceBpm).toBe(165)
    expect(digest.cyclingAnalysis.heartRateZones.zones).toHaveLength(5)
    expect(digest.cyclingAnalysis.heartRateZones.zones.every((zone: any) => /^[█░]{10}$/.test(zone.barText))).toBe(true)
    expect(digest.cyclingAnalysis.heartRateZones).not.toHaveProperty('note')
  })
})
