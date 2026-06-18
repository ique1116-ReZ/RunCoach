import { describe, it, expect } from 'vitest'
import { buildRoundTripBody, buildDirectionsBody, parseGeoJson } from './ors'

describe('ORS request bodies', () => {
  it('round trip body 携带 length/seed/points 与 elevation', () => {
    const body = buildRoundTripBody([121.5, 31.2], 5000, 7) as any
    expect(body.coordinates).toEqual([[121.5, 31.2]])
    expect(body.elevation).toBe(true)
    expect(body.options.round_trip.length).toBe(5000)
    expect(body.options.round_trip.seed).toBe(7)
    expect(body.options.round_trip.points).toBe(5)
  })

  it('directions body 含起终点与 elevation', () => {
    const body = buildDirectionsBody([121.5, 31.2], [121.6, 31.25]) as any
    expect(body.coordinates).toEqual([[121.5, 31.2], [121.6, 31.25]])
    expect(body.elevation).toBe(true)
  })
})

describe('parseGeoJson', () => {
  it('抽取坐标、距离、爬升', () => {
    const json = {
      features: [{
        geometry: { coordinates: [[121.5, 31.2, 4], [121.51, 31.21, 6]] },
        properties: { summary: { distance: 5023.4, ascent: 38.2 } }
      }]
    }
    const r = parseGeoJson(json, 'loop')
    expect(r.kind).toBe('loop')
    expect(r.coordinates).toEqual([[121.5, 31.2], [121.51, 31.21]])
    expect(r.distanceM).toBeCloseTo(5023.4)
    expect(r.ascentM).toBeCloseTo(38.2)
  })

  it('无 feature 时抛错', () => {
    expect(() => parseGeoJson({ features: [] }, 'loop')).toThrow()
  })
})
