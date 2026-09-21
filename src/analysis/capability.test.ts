import { describe, expect, it } from 'vitest'
import type { Run, TrackPoint } from '@runs/types'
import { buildCapabilityProfile, buildCapabilityTrainingDirection } from './capability'

const makeRide = (
  id: string,
  startTime: number,
  hours: number,
  speedKmh = 30,
  withElevation = true,
  stepSeconds = 30
): Run => {
  const points: TrackPoint[] = []
  const count = Math.floor((hours * 3600) / stepSeconds)
  let distanceM = 0
  for (let index = 0; index <= count; index += 1) {
    if (index > 0) distanceM += (speedKmh / 3.6) * stepSeconds
    points.push({
      lat: 31.2 + index * 0.00005,
      lon: 121.5 + index * 0.00005,
      time: startTime + index * stepSeconds * 1000,
      speed: speedKmh / 3.6,
      elevation: withElevation ? index * 10 : undefined,
      metrics: { speed: speedKmh / 3.6 },
      distFromStart: distanceM
    })
  }
  return {
    id,
    name: id,
    activityType: 'cycling',
    sourcePath: `${id}.gpx`,
    sourceType: 'gpx',
    points,
    totalDistance: distanceM,
    totalTime: hours * 3600 * 1000,
    metricKeys: ['speed', ...(withElevation ? ['elevation'] : [])],
    summaryEntries: [],
    lapSummaries: [],
    aggregateMetrics: {}
  }
}

describe('buildCapabilityProfile', () => {
  it('reports speed-window values in km/h rather than meters per hour', () => {
    const asOf = Date.parse('2026-09-17T12:00:00Z')
    const profile = buildCapabilityProfile([
      makeRide('speed-unit', Date.parse('2026-09-17T07:00:00Z'), 0.5, 30, false)
    ], { asOf })
    const sprint = profile.axes.find(axis => axis.id === 'sprint')
    const thirtySecond = sprint?.measurements.find(measurement => measurement.id === '30s')

    expect(thirtySecond?.value).toBeCloseTo(30, 1)
    expect(thirtySecond?.value).toBeLessThan(100)
  })

  it('keeps short GPS sample gaps inside a continuous speed window', () => {
    const ride = makeRide('sample-gap', Date.parse('2026-09-17T07:00:00Z'), 0.5, 30, false, 10)
    ride.points.splice(20, 1)
    const profile = buildCapabilityProfile([ride], { asOf: Date.parse('2026-09-17T12:00:00Z') })
    const cruise = profile.axes.find(axis => axis.id === 'cruise')
    const twentyMinute = cruise?.measurements.find(measurement => measurement.id === '20m')

    expect(twentyMinute?.value).toBeCloseTo(30, 1)
    expect(cruise?.score).toBeDefined()
  })

  it('maps continuous ride facts to all five axes', () => {
    const asOf = Date.parse('2026-09-17T12:00:00Z')
    const profile = buildCapabilityProfile([
      makeRide('long-ride', Date.parse('2026-09-17T05:00:00Z'), 5.2)
    ], { asOf })

    expect(profile.axes.every(axis => axis.score !== undefined)).toBe(true)
    expect(profile.axes.find(axis => axis.id === 'climb')?.measurements[0].unit).toBe('m/h')
    expect(profile.axes.find(axis => axis.id === 'longEndurance')?.score).toBeDefined()
  })

  it('leaves a dimension empty when its single-activity condition is not met', () => {
    const asOf = Date.parse('2026-09-17T12:00:00Z')
    const profile = buildCapabilityProfile([
      makeRide('short-ride', Date.parse('2026-09-17T07:00:00Z'), 2.5)
    ], { asOf })
    const longEndurance = profile.axes.find(axis => axis.id === 'longEndurance')

    expect(longEndurance?.score).toBeUndefined()
    expect(longEndurance?.status).toBe('insufficient')
    expect(longEndurance?.missingReason).toContain('5 小时')
  })

  it('selects one highest-priority training plan goal', () => {
    const asOf = Date.parse('2026-09-17T12:00:00Z')
    const profile = buildCapabilityProfile([
      makeRide('short-ride', Date.parse('2026-09-17T07:00:00Z'), 2.5, 70)
    ], { asOf })
    const direction = buildCapabilityTrainingDirection(profile)

    expect(direction.goals).toHaveLength(1)
    expect(direction.goals[0].id).toBe('distance')
    expect(direction.goals[0].priority).toBe('primary')
  })
})
