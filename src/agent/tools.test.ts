import { describe, it, expect, vi } from 'vitest'
import { toolSchemas, executeTool } from './tools'

describe('tools', () => {
  it('schema 暴露 7 个工具且名字正确', () => {
    const names = toolSchemas.map((t: any) => t.function.name).sort()
    expect(names).toEqual([
      'analyze_run', 'ask_run_terrain', 'ask_start_point', 'compare_runs',
      'generate_loop_route', 'generate_point_to_point_route', 'geocode_place'
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
})
