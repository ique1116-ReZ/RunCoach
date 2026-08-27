import { describe, it, expect, vi } from 'vitest'
import { toolSchemas, executeTool } from './tools'

describe('tools', () => {
  it('schema 暴露 8 个工具且名字正确', () => {
    const names = toolSchemas.map((t: any) => t.function.name).sort()
    expect(names).toEqual([
      'analyze_run', 'ask_run_terrain', 'ask_start_point', 'compare_runs',
      'generate_loop_route', 'generate_point_to_point_route', 'geocode_place',
      'set_cycling_heart_rate_reference'
    ])
  })

  it('generate_loop_route 触发 onRoute 并返回实际距离', async () => {
    const onRoute = vi.fn()
    const out = await executeTool(
      'generate_loop_route',
      { start: [121.5, 31.2], distance_km: 5, seed: 2 },
      { runs: new Map(), onRoute, requestTerrain: async () => null, requestStartPoint: async () => null, _fetchLoop: async () => ({ kind: 'loop', coordinates: [[121.5, 31.2]], distanceM: 5020 }) } as any
    )
    expect(onRoute).toHaveBeenCalledOnce()
    expect(JSON.parse(out).distance_km).toBeCloseTo(5.02, 2)
  })

  it('analyze_run 找不到 run 时返回错误说明', async () => {
    const out = await executeTool('analyze_run', { run_id: 'nope' }, { runs: new Map(), onRoute: () => {}, requestTerrain: async () => null, requestStartPoint: async () => null } as any)
    expect(JSON.parse(out).error).toBeTruthy()
  })

  it('analyze_run 在无锚点时只返回心率参考追问门禁', async () => {
    const run = {
      id: 'ride-1', name: '骑行', activityType: 'cycling', sourcePath: 'ride.fit', sourceType: 'fit',
      points: [
        { lat: 31.2, lon: 121.5, time: 1700000000000, hr: 120, speed: 7, power: 150, metrics: {}, distFromStart: 0 },
        { lat: 31.21, lon: 121.51, time: 1700000060000, hr: 145, speed: 9, power: 220, metrics: {}, distFromStart: 540 }
      ],
      totalDistance: 540, totalTime: 60000, metricKeys: ['heart_rate', 'speed', 'power'], summaryEntries: [], lapSummaries: [], aggregateMetrics: {}
    }
    const out = JSON.parse(await executeTool('analyze_run', { run_id: 'ride-1' }, {
      runs: new Map([['ride-1', run]]), onRoute() {}, requestTerrain: async () => null, requestStartPoint: async () => null
    } as any))
    expect(out.cyclingAnalysis.heartRateZones).toEqual(expect.objectContaining({
      available: false,
      referenceRequired: true
    }))
    expect(out.requiredAction.reviewBlockedUntilReference).toBe(true)
    expect(out.cyclingAnalysis.capabilities).toBeUndefined()
  })

  it('保存用户提供的 HRmax 后按整数边界重算，并拒绝非法值', async () => {
    const run = {
      id: 'ride-reference', name: '骑行', activityType: 'cycling', sourcePath: 'ride.fit', sourceType: 'fit',
      points: [
        { lat: 31.2, lon: 121.5, time: 1700000000000, hr: 131, speed: 7, metrics: {}, distFromStart: 0 },
        { lat: 31.21, lon: 121.51, time: 1700000060000, hr: 162, speed: 9, metrics: {}, distFromStart: 540 }
      ],
      totalDistance: 540, totalTime: 60000, metricKeys: ['heart_rate', 'speed'], summaryEntries: [], lapSummaries: [], aggregateMetrics: {}
    } as any
    const onRunUpdated = vi.fn()
    const ctx = {
      runs: new Map([[run.id, run]]), onRoute() {}, onRunUpdated,
      requestTerrain: async () => null, requestStartPoint: async () => null
    } as any
    const saved = JSON.parse(await executeTool('set_cycling_heart_rate_reference', {
      run_id: run.id, base: 'HRmax', bpm: 180
    }, ctx))
    expect(saved).toEqual(expect.objectContaining({ saved: true, reference: expect.objectContaining({ base: 'HRmax', value: 180, source: '用户填写' }) }))
    expect(onRunUpdated).toHaveBeenCalledOnce()

    const analyzed = JSON.parse(await executeTool('analyze_run', { run_id: run.id }, ctx))
    expect(analyzed.cyclingAnalysis.heartRateZones.basis).toBe('hrmax')
    expect(analyzed.cyclingAnalysis.heartRateZones.zones.map((zone: any) => zone.rangeText)).toEqual([
      '≤131 bpm', '132–145 bpm', '146–152 bpm', '153–161 bpm', '≥162 bpm'
    ])

    const invalid = JSON.parse(await executeTool('set_cycling_heart_rate_reference', {
      run_id: run.id, base: 'LTHR', bpm: 250
    }, ctx))
    expect(invalid.error).toContain('30～230')
  })

  it('ask_run_terrain 回传用户选择', async () => {
    const out = await executeTool('ask_run_terrain', {}, {
      runs: new Map(), onRoute() {}, requestTerrain: async () => 'trail', requestStartPoint: async () => null
    } as any)
    expect(JSON.parse(out).terrain).toBe('trail')
  })

  it('ask_start_point 取消时回 cancelled', async () => {
    const out = await executeTool('ask_start_point', {}, {
      runs: new Map(), onRoute() {}, requestTerrain: async () => null, requestStartPoint: async () => null
    } as any)
    expect(JSON.parse(out).cancelled).toBe(true)
  })

  it('generate_loop_route 把 trail 映射成 foot-hiking', async () => {
    let seen = ''
    await executeTool('generate_loop_route', { start: [0, 0], distance_km: 5, terrain: 'trail' }, {
      runs: new Map(), onRoute() {}, requestTerrain: async () => null, requestStartPoint: async () => null,
      _fetchLoop: async (_s: any, _k: any, _seed: any, profile: string) => { seen = profile; return { kind: 'loop', coordinates: [[0, 0]], distanceM: 5000 } }
    } as any)
    expect(seen).toBe('foot-hiking')
  })

  it('generate_loop_route 路跑优先选择低爬升候选', async () => {
    const onRoute = vi.fn()
    const seenSeeds: number[] = []
    const out = await executeTool('generate_loop_route', { start: [0, 0], distance_km: 5, seed: 3, terrain: 'road' }, {
      runs: new Map(), onRoute, requestTerrain: async () => null, requestStartPoint: async () => null,
      _fetchLoop: async (_s: any, _k: any, seed: number) => {
        seenSeeds.push(seed)
        return seed === 10
          ? { kind: 'loop', coordinates: [[0, 0]], distanceM: 5060, ascentM: 18 }
          : { kind: 'loop', coordinates: [[0, 0]], distanceM: 5000, ascentM: 95 }
      }
    } as any)
    expect(seenSeeds).toEqual([3, 10])
    expect(onRoute).toHaveBeenCalledWith(expect.objectContaining({ ascentM: 18 }))
    expect(JSON.parse(out).flat_priority).toBe(true)
    expect(JSON.parse(out).ascent_per_km).toBeCloseTo(3.6)
  })
})
