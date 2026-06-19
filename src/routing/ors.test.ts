import { describe, it, expect, vi } from 'vitest'
import { postOrs, buildRoundTripBody, buildDirectionsBody, parseGeoJson, generateLoopRoute, generatePointToPointRoute } from './ors'

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
        // 真实 ORS 形态：ascent/descent 在 properties 顶层，summary 只有 distance/duration
        properties: { ascent: 38.2, descent: 38.2, summary: { distance: 5023.4, duration: 3000 } }
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

describe('postOrs profile', () => {
  it('用对应 profile 的 URL', async () => {
    vi.stubEnv('VITE_ORS_KEY', 'test-key')
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return new Response(JSON.stringify({ features: [] }), { status: 200 }) }))
    await postOrs({}, 'foot-hiking')
    expect(urls[0]).toContain('/v2/directions/foot-hiking/geojson')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})

const fakeRoute = (distanceM: number): any => ({
  kind: 'loop', coordinates: [[0, 0], [0.01, 0.01]], distanceM
})

describe('generateLoopRoute 凑距离', () => {
  it('首轮即达标（±5% 内）直接返回', async () => {
    const calls: number[] = []
    const r = await generateLoopRoute([0, 0], 5, 'foot-walking', 1, {
      fetchRoute: async (lengthM) => { calls.push(lengthM); return fakeRoute(4900) }
    })
    expect(r.distanceM).toBe(4900)
    expect(calls).toEqual([5000]) // 只调一次
  })

  it('首轮偏短则按比例校正后重试', async () => {
    const lengths: number[] = []
    const r = await generateLoopRoute([0, 0], 5, 'foot-walking', 1, {
      fetchRoute: async (lengthM) => {
        lengths.push(lengthM)
        return fakeRoute(lengths.length === 1 ? 4000 : 5050)
      }
    })
    // 第二轮请求长度 = 5000 * (5000/4000) = 6250
    expect(lengths[0]).toBe(5000)
    expect(lengths[1]).toBe(6250)
    expect(r.distanceM).toBe(5050) // 达标
  })

  it('3 轮都不达标则返回最接近者', async () => {
    const r = await generateLoopRoute([0, 0], 5, 'foot-walking', 1, {
      fetchRoute: async () => fakeRoute(4000) // 永远偏短
    })
    expect(r.distanceM).toBe(4000) // 最接近（也是唯一）
  })
})

describe('generatePointToPointRoute', () => {
  it('直接返回注入的路线', async () => {
    const r = await generatePointToPointRoute([0, 0], [1, 1], 'foot-walking', {
      fetchRoute: async () => ({ kind: 'point_to_point', coordinates: [[0, 0], [1, 1]], distanceM: 3200 })
    })
    expect(r.kind).toBe('point_to_point')
    expect(r.distanceM).toBe(3200)
  })
})

describe('parseGeoJson 高程', () => {
  it('3D 坐标时收集 elevations', () => {
    const json = { features: [{
      geometry: { coordinates: [[121.5, 31.2, 4], [121.51, 31.21, 6.5]] },
      properties: { summary: { distance: 1000, ascent: 3 } }
    }] }
    const r = parseGeoJson(json, 'loop')
    expect(r.coordinates).toEqual([[121.5, 31.2], [121.51, 31.21]])
    expect(r.elevations).toEqual([4, 6.5])
  })
  it('2D 坐标时 elevations 为 undefined', () => {
    const json = { features: [{ geometry: { coordinates: [[1, 2], [3, 4]] }, properties: { summary: {} } }] }
    expect(parseGeoJson(json, 'loop').elevations).toBeUndefined()
  })
})
