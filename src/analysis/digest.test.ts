import { describe, it, expect } from 'vitest'
import { buildRunDigest, buildComparisonDigest } from './digest'
import type { Run } from '@runs/types'

const run: Run = {
  id: 'r1', name: '晨跑', sourcePath: 'a.gpx', sourceType: 'gpx',
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
  id: 'r2', name: '午跑', sourcePath: 'b.gpx', sourceType: 'gpx',
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
