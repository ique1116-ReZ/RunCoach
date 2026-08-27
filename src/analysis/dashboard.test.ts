import { describe, expect, it } from 'vitest'
import type { Run } from '@runs/types'
import { buildDashboardData, dashboardToCsv } from './dashboard'

const ride: Run = {
  id: 'ride-1', name: '周末骑行', activityType: 'cycling', sourcePath: 'ride.fit', sourceType: 'fit',
  points: [
    { lat: 31.2, lon: 121.5, time: 1700000000000, speed: 8, hr: 130, power: 180, cadence: 82, elevation: 10, metrics: {}, distFromStart: 0 },
    { lat: 31.21, lon: 121.51, time: 1700000060000, speed: 10, hr: 150, power: 240, cadence: 92, elevation: 24, metrics: {}, distFromStart: 540 }
  ],
  totalDistance: 540, totalTime: 60000, metricKeys: ['speed', 'heart_rate', 'power', 'cadence', 'elevation'],
  summaryEntries: [], lapSummaries: [], aggregateMetrics: { totalAscent: 18 }
}

describe('buildDashboardData', () => {
  it('生成骑行看板的概览、趋势采样和单位', () => {
    const data = buildDashboardData(ride)
    expect(data.activityType).toBe('cycling')
    expect(data.totalDistanceKm).toBeCloseTo(0.54, 2)
    expect(data.averageSpeedKmh).toBeCloseTo(32.4, 1)
    expect(data.averagePower).toBe(210)
    expect(data.averageCadence).toBe(87)
    expect(data.samples.length).toBe(2)
    expect(data.samples[1].speedKmh).toBeCloseTo(36, 1)
  })
})

describe('dashboardToCsv', () => {
  it('导出包含摘要字段、列名和原始轨迹指标', () => {
    const csv = dashboardToCsv(ride)
    expect(csv.startsWith('\uFEFFactivity_type,cycling')).toBe(true)
    expect(csv).toContain('speed_kmh')
    expect(csv).toContain('power_w')
    expect(csv).toContain('ride.fit')
    expect(csv).toContain('2023-11-14T22:13:20.000Z')
  })
})
