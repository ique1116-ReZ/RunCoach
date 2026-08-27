import { generateLoopRoute, generatePointToPointRoute, type RouteResult, type LngLat, type RunProfile } from '@/routing/ors'
import { geocodePlace } from '@/routing/geocode'
import { buildRunDigest, buildComparisonDigest } from '@/analysis/digest'
import type { Run } from '@runs/types'

export type ToolContext = {
  runs: Map<string, Run>
  onRoute: (r: RouteResult) => void
  onRunUpdated?: (run: Run) => void
  requestTerrain: () => Promise<'trail' | 'road' | null>
  requestStartPoint: () => Promise<LngLat | null>
  // 测试注入用，可选：
  _fetchLoop?: (start: LngLat, km: number, seed: number, profile: RunProfile) => Promise<RouteResult>
  _fetchP2P?: (start: LngLat, end: LngLat, profile: RunProfile) => Promise<RouteResult>
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
          seed: { type: 'number', description: '换一条不同走法时改变此种子' },
          terrain: { type: 'string', enum: ['trail', 'road'], description: '越野=trail（山路步道），路跑=road（道路）' }
        },
        required: ['start', 'distance_km', 'terrain']
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
          end: { type: 'array', items: { type: 'number' }, description: '[经度, 纬度]' },
          terrain: { type: 'string', enum: ['trail', 'road'], description: '越野=trail（山路步道），路跑=road（道路）' }
        },
        required: ['start', 'end', 'terrain']
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
      description: '取已上传的跑步或骑行训练数据摘要用于复盘；骑行摘要包含 Z1-Z5 心率占比图表、续航/爬坡/冲刺训练刺激和可选的极光路段，无可靠功率时不包含冲刺',
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
      name: 'set_cycling_heart_rate_reference',
      description: '保存用户为当前骑行明确提供的骑行最大心率 HRmax 或骑行阈值心率 LTHR。只能在用户注明类型和 bpm 后调用；保存成功后再次调用 analyze_run。',
      parameters: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: '当前上传骑行的 run_id' },
          base: { type: 'string', enum: ['HRmax', 'LTHR'], description: '用户明确提供的参考值类型' },
          bpm: { type: 'number', description: '用户提供的整数 bpm，范围 30～230' }
        },
        required: ['run_id', 'base', 'bpm']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_runs',
      description: '对比两份已上传的跑步或骑行训练摘要；优先比较同一种运动',
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
  },
  {
    type: 'function',
    function: {
      name: 'ask_run_terrain',
      description: '当用户没说要越野还是路跑时，弹卡片询问。返回 {terrain} 或 {cancelled:true}',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_start_point',
      description: '当起点未知时，弹卡片让用户选当前位置或手动在地图选点。返回 {start:[lng,lat]} 或 {cancelled:true}',
      parameters: { type: 'object', properties: {} }
    }
  }
]

const ok = (o: unknown) => JSON.stringify(o)
const fail = (msg: string) => JSON.stringify({ error: msg })

const roadLoopScore = (route: RouteResult, targetKm: number) => {
  const targetM = targetKm * 1000
  const distanceOff = targetM > 0 ? Math.abs(route.distanceM - targetM) / targetM : 1
  const ascentPerKm = (route.ascentM ?? 0) / Math.max(route.distanceM / 1000, 0.1)
  // 路跑宁可距离略有误差，也优先少爬升；约 8m/km 内基本视作平路。
  return distanceOff * 1.2 + ascentPerKm / 8
}

const generateRoadLoopRoute = async (
  args: any,
  ctx: ToolContext,
  profile: RunProfile
) => {
  const seed = args.seed ?? 1
  const seeds = [seed, seed + 7, seed + 17]
  const routes: RouteResult[] = []
  for (const candidateSeed of seeds) {
    const route = ctx._fetchLoop
      ? await ctx._fetchLoop(args.start, args.distance_km, candidateSeed, profile)
      : await generateLoopRoute(args.start, args.distance_km, profile, candidateSeed)
    routes.push(route)
    const ascentPerKm = (route.ascentM ?? 0) / Math.max(route.distanceM / 1000, 0.1)
    const distanceOff = Math.abs(route.distanceM - args.distance_km * 1000) / (args.distance_km * 1000)
    if (route.ascentM !== undefined && ascentPerKm <= 8 && distanceOff <= 0.05) break
  }
  return routes.reduce((best, route) =>
    roadLoopScore(route, args.distance_km) < roadLoopScore(best, args.distance_km) ? route : best
  )
}

export const executeTool = async (name: string, args: any, ctx: ToolContext): Promise<string> => {
  try {
    if (name === 'ask_run_terrain') {
      const t = await ctx.requestTerrain()
      return t ? ok({ terrain: t }) : ok({ cancelled: true })
    }
    if (name === 'ask_start_point') {
      const c = await ctx.requestStartPoint()
      return c ? ok({ start: c }) : ok({ cancelled: true })
    }
    if (name === 'generate_loop_route') {
      if (!(args.distance_km > 0)) return fail('距离必须大于 0')
      const profile: RunProfile = args.terrain === 'trail' ? 'foot-hiking' : 'foot-walking'
      const route = args.terrain === 'trail'
        ? (ctx._fetchLoop
          ? await ctx._fetchLoop(args.start, args.distance_km, args.seed ?? 1, profile)
          : await generateLoopRoute(args.start, args.distance_km, profile, args.seed ?? 1))
        : await generateRoadLoopRoute(args, ctx, profile)
      ctx.onRoute(route)
      return ok({
        distance_km: +(route.distanceM / 1000).toFixed(2),
        ascent_m: route.ascentM,
        ascent_per_km: route.ascentM !== undefined ? +(route.ascentM / Math.max(route.distanceM / 1000, 0.1)).toFixed(1) : undefined,
        flat_priority: args.terrain === 'road',
        points: route.coordinates.length
      })
    }
    if (name === 'generate_point_to_point_route') {
      const profile: RunProfile = args.terrain === 'trail' ? 'foot-hiking' : 'foot-walking'
      const route = ctx._fetchP2P
        ? await ctx._fetchP2P(args.start, args.end, profile)
        : await generatePointToPointRoute(args.start, args.end, profile)
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
      const digest = buildRunDigest(run)
      if (digest.cyclingAnalysis?.heartRateZones.referenceRequired) {
        return ok({
          fileName: digest.fileName,
          name: digest.name,
          activityType: digest.activityType,
          cyclingAnalysis: { heartRateZones: digest.cyclingAnalysis.heartRateZones },
          requiredAction: {
            accepted: ['HRmax', 'LTHR'],
            input: '一种类型和一个 30～230 之间的整数 bpm',
            toolAfterUserReply: 'set_cycling_heart_rate_reference',
            reviewBlockedUntilReference: true
          }
        })
      }
      return ok(digest)
    }
    if (name === 'set_cycling_heart_rate_reference') {
      const run = ctx.runs.get(args.run_id)
      if (!run) return fail('找不到该训练，请确认已上传')
      if (run.activityType !== 'cycling') return fail('心率参考值只能用于当前骑行训练')
      if (args.base !== 'HRmax' && args.base !== 'LTHR') return fail('请明确选择 HRmax 或 LTHR')
      const bpm = Number(args.bpm)
      if (!Number.isInteger(bpm) || bpm < 30 || bpm > 230) return fail('请输入 30～230 bpm 之间的整数')
      const updatedRun: Run = {
        ...run,
        heartRateReference: { base: args.base, value: bpm, source: '用户填写' }
      }
      ctx.runs.set(run.id, updatedRun)
      ctx.onRunUpdated?.(updatedRun)
      return ok({
        saved: true,
        run_id: run.id,
        reference: updatedRun.heartRateReference,
        next: '立即调用 analyze_run，使用新参考值完成本次骑行复盘'
      })
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
