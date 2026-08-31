import { describe, expect, it } from 'vitest'
import { analyzeRouteTraffic, defaultRequiredClearM } from './traffic-analysis'
import type { RouteResult } from './ors'

const route: RouteResult = {
  kind: 'loop',
  coordinates: [[116.4, 39.9], [116.44, 39.9], [116.44, 39.92], [116.4, 39.92], [116.4, 39.9]],
  distanceM: 11000,
  recommendation: {
    courseName: '测试课程',
    targetDistanceKm: 11,
    clearRoadKm: 2,
    routeShape: 'loop',
    fitNote: '测试'
  }
}

describe('路线交通岗分析', () => {
  it('优先使用课程要求的连续训练段长度', () => {
    expect(defaultRequiredClearM(route)).toBe(2000)
  })

  it('只保留靠近路线的信号灯并生成绿色顺畅段', async () => {
    const result = await analyzeRouteTraffic(route, {
      request: async () => new Response(JSON.stringify({ elements: [
        { id: 1, lon: 116.42, lat: 39.9 },
        { id: 2, lon: 116.8, lat: 40.2 }
      ] }), { status: 200 })
    })
    expect(result.status).toBe('ready')
    expect(result.signals).toHaveLength(1)
    expect(result.requiredClearM).toBe(2000)
    expect(result.longestClearM).toBeGreaterThan(2000)
    expect(result.smoothSegments.length).toBeGreaterThan(0)
  })

  it('没有已标注信号灯时将整条足够长的路线视为顺畅候选并保留数据免责声明', async () => {
    const result = await analyzeRouteTraffic(route, {
      request: async () => new Response(JSON.stringify({ elements: [] }), { status: 200 })
    })
    expect(result.signals).toHaveLength(0)
    expect(result.smoothSegments).toHaveLength(1)
    expect(result.note).toContain('公开地图')
  })

  it('主查询节点失败时自动改用备用节点', async () => {
    const endpoints: string[] = []
    const result = await analyzeRouteTraffic(route, {
      request: async input => {
        endpoints.push(String(input))
        if (endpoints.length === 1) return new Response('busy', { status: 503 })
        return new Response(JSON.stringify({ elements: [] }), { status: 200 })
      }
    })
    expect(result.status).toBe('ready')
    expect(endpoints).toEqual(['/api/overpass-primary', '/api/overpass-fallback'])
  })

  it('把同一大路口的多个灯头合并成一个交通岗', async () => {
    const result = await analyzeRouteTraffic(route, {
      request: async () => new Response(JSON.stringify({ elements: [
        { id: 1, lon: 116.42000, lat: 39.90000, tags: { highway: 'traffic_signals' } },
        { id: 2, lon: 116.42025, lat: 39.90000, tags: { highway: 'traffic_signals' } }
      ] }), { status: 200 })
    })
    expect(result.signals).toHaveLength(1)
  })

  it('单线往返同一交通岗只显示一次，但保留两次骑行经过', async () => {
    const outAndBack: RouteResult = {
      ...route,
      coordinates: [[116.4, 39.9], [116.42, 39.9], [116.44, 39.9], [116.42, 39.9], [116.4, 39.9]],
      distanceM: 6800
    }
    const result = await analyzeRouteTraffic(outAndBack, {
      request: async () => new Response(JSON.stringify({ elements: [
        { id: 1, lon: 116.42, lat: 39.9, tags: { highway: 'traffic_signals' } }
      ] }), { status: 200 })
    })
    expect(result.signals).toHaveLength(1)
    expect(result.signals[0].occurrencesM).toHaveLength(2)
  })
})
