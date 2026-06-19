import { generateLoopRoute, generatePointToPointRoute, type RouteResult, type LngLat } from '@/routing/ors'
import { geocodePlace } from '@/routing/geocode'
import { buildRunDigest, buildComparisonDigest } from '@/analysis/digest'
import type { Run } from '@runs/types'

export type ToolContext = {
  runs: Map<string, Run>
  onRoute: (r: RouteResult) => void
  // 测试注入用，可选：
  _fetchLoop?: (start: LngLat, km: number, seed: number) => Promise<RouteResult>
  _fetchP2P?: (start: LngLat, end: LngLat) => Promise<RouteResult>
}

export const toolSchemas = [
  {
    type: 'function',
    function: {
      name: 'generate_loop_route',
      description: '在真实路网上生成一条回到起点的环线，长度贴近目标公里数',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: '[经度, 纬度]' },
          distance_km: { type: 'number', description: '目标距离（公里），需 > 0' },
          seed: { type: 'number', description: '换一条不同走法时改变此种子' }
        },
        required: ['start', 'distance_km']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_point_to_point_route',
      description: '在真实路网上生成从起点到终点的跑步路线',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'array', items: { type: 'number' }, description: '[经度, 纬度]' },
          end: { type: 'array', items: { type: 'number' }, description: '[经度, 纬度]' }
        },
        required: ['start', 'end']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'geocode_place',
      description: '把地名转成坐标（用户说"从某地出发"时用）',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_run',
      description: '取已上传训练的数据摘要用于复盘',
      parameters: {
        type: 'object',
        properties: { run_id: { type: 'string' } },
        required: ['run_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_runs',
      description: '对比两份已上传训练的摘要',
      parameters: {
        type: 'object',
        properties: {
          run_id_a: { type: 'string' },
          run_id_b: { type: 'string' },
          relation: { type: 'string', enum: ['auto', 'same_athlete', 'different_athletes'] }
        },
        required: ['run_id_a', 'run_id_b']
      }
    }
  }
]

const ok = (o: unknown) => JSON.stringify(o)
const fail = (msg: string) => JSON.stringify({ error: msg })

export const executeTool = async (name: string, args: any, ctx: ToolContext): Promise<string> => {
  try {
    if (name === 'generate_loop_route') {
      if (!(args.distance_km > 0)) return fail('距离必须大于 0')
      const route = ctx._fetchLoop
        ? await ctx._fetchLoop(args.start, args.distance_km, args.seed ?? 1)
        : await generateLoopRoute(args.start, args.distance_km, args.seed ?? 1)
      ctx.onRoute(route)
      return ok({ distance_km: +(route.distanceM / 1000).toFixed(2), ascent_m: route.ascentM, points: route.coordinates.length })
    }
    if (name === 'generate_point_to_point_route') {
      const route = ctx._fetchP2P
        ? await ctx._fetchP2P(args.start, args.end)
        : await generatePointToPointRoute(args.start, args.end)
      ctx.onRoute(route)
      return ok({ distance_km: +(route.distanceM / 1000).toFixed(2), ascent_m: route.ascentM })
    }
    if (name === 'geocode_place') {
      const hits = await geocodePlace(args.query)
      if (!hits.length) return fail(`没找到"${args.query}"`)
      return ok({ hits: hits.map(h => ({ name: h.name, coord: h.center })) })
    }
    if (name === 'analyze_run') {
      const run = ctx.runs.get(args.run_id)
      if (!run) return fail('找不到该训练，请确认已上传')
      return ok(buildRunDigest(run))
    }
    if (name === 'compare_runs') {
      const a = ctx.runs.get(args.run_id_a)
      const b = ctx.runs.get(args.run_id_b)
      if (!a || !b) return fail('需要两份已上传训练才能对比')
      return ok(buildComparisonDigest(a, b, args.relation ?? 'auto'))
    }
    return fail(`未知工具：${name}`)
  } catch (e: any) {
    return fail(String(e?.message ?? e))
  }
}
