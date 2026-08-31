import { describe, expect, it } from 'vitest'
import {
  gcj02ToWgs84,
  fetchAmapBicyclingLeg,
  generateAmapOutAndBackRoute,
  parseAmapBicycling,
  wgs84ToGcj02
} from './amap'

describe('高德坐标转换', () => {
  it('WGS84 与 GCJ-02 往返误差保持在绘图可接受范围', () => {
    const source: [number, number] = [116.397389, 39.908722]
    const restored = gcj02ToWgs84(wgs84ToGcj02(source))
    expect(restored[0]).toBeCloseTo(source[0], 6)
    expect(restored[1]).toBeCloseTo(source[1], 6)
  })
})

describe('parseAmapBicycling', () => {
  it('解析 v5 骑行路线并转换回 WGS84', () => {
    const result = parseAmapBicycling({
      status: '1',
      route: { paths: [{ distance: '3200', steps: [
        { polyline: '116.403000,39.910000;116.410000,39.915000' },
        { polyline: '116.410000,39.915000;116.420000,39.920000' }
      ] }] }
    })
    expect(result.provider).toBe('amap')
    expect(result.distanceM).toBe(3200)
    expect(result.coordinates).toHaveLength(3)
  })

  it('接口错误时给出高德错误信息', () => {
    expect(() => parseAmapBicycling({ status: '0', info: 'INVALID_USER_KEY' })).toThrow('INVALID_USER_KEY')
  })

  it('QPS 超限时给出可理解的提示，不暴露原始错误码', () => {
    expect(() => parseAmapBicycling({ status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' }))
      .toThrow('当前请求较多')
  })
})

describe('fetchAmapBicyclingLeg 限流恢复', () => {
  it('QPS 超限后自动退避重试', async () => {
    let calls = 0
    const waits: number[] = []
    const result = await fetchAmapBicyclingLeg([116.4, 39.9], [116.41, 39.91], 'key', {
      schedule: request => request(),
      wait: async ms => { waits.push(ms) },
      request: async () => {
        calls += 1
        return new Response(JSON.stringify(calls < 3
          ? { status: '0', info: 'CUQPS_HAS_EXCEEDED_THE_LIMIT' }
          : { status: '1', route: { paths: [{ distance: '1000', steps: [{ polyline: '116.4,39.9;116.41,39.91' }] }] } }), { status: 200 })
      }
    })
    expect(result.distanceM).toBe(1000)
    expect(calls).toBe(3)
    expect(waits).toEqual([900, 1800])
  })
})

describe('generateAmapOutAndBackRoute', () => {
  it('只请求去程，并镜像为同线往返', async () => {
    let calls = 0
    const route = await generateAmapOutAndBackRoute([116.4, 39.9], 10, 'key', 1, {
      fetchLeg: async (start, end) => {
        calls += 1
        return { kind: 'point_to_point', coordinates: [start, [116.45, 39.92], end], distanceM: 5000 }
      }
    })
    expect(calls).toBe(1)
    expect(route.distanceM).toBe(10000)
    expect(route.coordinates[0]).toEqual(route.coordinates.at(-1))
    expect(route.provider).toBe('amap')
  })
})
