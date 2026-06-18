import { describe, it, expect } from 'vitest'
import { buildRunDigest } from './digest'
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
