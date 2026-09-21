import { describe, expect, it } from 'vitest'
import type { Run } from '@runs/types'
import { buildTrainingHistorySummary } from './training-history'

const makeRun = (id: string, startTime: number, minutes: number, distanceKm: number, load?: number, activityType: Run['activityType'] = 'cycling'): Run => ({
  id,
  name: id,
  activityType,
  sourcePath: `${id}.fit`,
  sourceType: 'fit',
  points: [
    { lat: 31.2, lon: 121.5, time: startTime, metrics: {}, distFromStart: 0 },
    { lat: 31.21, lon: 121.51, time: startTime + minutes * 60_000, metrics: {}, distFromStart: distanceKm * 1000 }
  ],
  totalDistance: distanceKm * 1000,
  totalTime: minutes * 60_000,
  metricKeys: [],
  summaryEntries: load === undefined ? [] : [{ key: 'training_stress_score', value: load }],
  lapSummaries: [],
  aggregateMetrics: {}
})

describe('buildTrainingHistorySummary', () => {
  it('aggregates the latest four weeks and ignores non-cycling or old activities', () => {
    const asOf = Date.parse('2026-09-17T12:00:00Z')
    const history = buildTrainingHistorySummary([
      makeRun('recent-a', Date.parse('2026-09-16T08:00:00Z'), 60, 30, 100),
      makeRun('recent-b', Date.parse('2026-09-10T08:00:00Z'), 120, 50, 50),
      makeRun('run', Date.parse('2026-09-08T08:00:00Z'), 90, 12, 80, 'running'),
      makeRun('old', Date.parse('2026-08-01T08:00:00Z'), 240, 100, 200)
    ], { asOf })

    expect(history.rideCount).toBe(2)
    expect(history.weeklyMin).toBe(45)
    expect(history.longestMin).toBe(120)
    expect(history.longestKm).toBe(50)
    expect(history.weeklyLoad).toBe(37.5)
    expect(history.maxLoad).toBe(100)
    expect(history.loadDays).toBe(2)
    expect(history.loadSource).toBe('device')
  })

  it('can use the same 90-day history window as the capability profile', () => {
    const asOf = Date.parse('2026-09-21T12:00:00Z')
    const history = buildTrainingHistorySummary([
      makeRun('july-ride', Date.parse('2026-07-02T08:00:00Z'), 80, 20),
      makeRun('august-ride', Date.parse('2026-08-06T08:00:00Z'), 95, 24)
    ], { asOf, windowDays: 90 })

    expect(history.rideCount).toBe(2)
    expect(history.windowDays).toBe(90)
    expect(history.sourceFiles).toEqual(['july-ride.fit', 'august-ride.fit'])
  })
})
