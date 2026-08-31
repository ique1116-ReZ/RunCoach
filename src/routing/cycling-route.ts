import { generateAmapCyclingLoop, generateAmapOutAndBackRoute } from './amap'
import { loadRoutingConfig } from './config'
import { isInChina } from './region'
import { generateLoopRoute, generateOutAndBackRoute, type LngLat, type RouteResult } from './ors'
import { analyzeLoopQuality } from './route-quality'

export type CourseRouteShape = 'loop' | 'out_and_back'

export type CourseRouteRequest = {
  courseName: string
  courseType: string
  durationMin: number
  targetDistanceKm: number
  clearRoadKm?: number
  mainBlockKm?: number
  maxGradePct?: number
  feasibility?: string
}

const haversineM = (a: LngLat, b: LngLat) => {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const lat1 = a[1] * rad
  const lat2 = b[1] * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export const estimatedSteepGrade = (route: RouteResult) => {
  if (!route.elevations || route.elevations.length !== route.coordinates.length) return undefined
  const grades = route.coordinates.slice(1).map((coord, index) => {
    const distance = haversineM(route.coordinates[index], coord)
    return distance >= 20 ? Math.abs((route.elevations![index + 1] - route.elevations![index]) / distance * 100) : undefined
  }).filter((value): value is number => value !== undefined && Number.isFinite(value))
  if (!grades.length) return undefined
  grades.sort((a, b) => a - b)
  return grades[Math.min(grades.length - 1, Math.floor(grades.length * 0.9))]
}

const scoreRoute = (route: RouteResult, course: CourseRouteRequest) => {
  const targetM = course.targetDistanceKm * 1000
  const distanceOff = Math.abs(route.distanceM - targetM) / Math.max(targetM, 1)
  const ascentPerKm = (route.ascentM ?? 0) / Math.max(route.distanceM / 1000, 0.1)
  const flatSensitive = course.maxGradePct !== undefined || course.feasibility === 'long_flat'
  return distanceOff * 5 + ascentPerKm * (flatSensitive ? 0.035 : 0.008)
}

const fitNote = (route: RouteResult, course: CourseRouteRequest, shape: CourseRouteShape) => {
  const parts = [shape === 'out_and_back' ? '按单线往返匹配' : '按骑行环线匹配']
  parts.push(`全程约 ${Math.round(course.targetDistanceKm)} 公里`)
  if (course.clearRoadKm) parts.push(`需要留出约 ${course.clearRoadKm.toFixed(1)} 公里的连续训练段`)
  if (route.provider === 'ors' && route.ascentM !== undefined) parts.push(`候选中优先选择爬升更少的路线`)
  if (route.provider === 'amap' && course.maxGradePct !== undefined) parts.push('高德不返回完整高程，坡度上限需结合现场确认')
  return parts.join('；')
}

export const recommendCyclingRoute = async (
  start: LngLat,
  course: CourseRouteRequest,
  shape: CourseRouteShape = 'loop',
  deps: {
    amapRoute?: (seed: number, shape: CourseRouteShape) => Promise<RouteResult>
    orsRoute?: (seed: number, shape: CourseRouteShape) => Promise<RouteResult>
    variant?: number
  } = {}
): Promise<RouteResult> => {
  if (!(course.targetDistanceKm > 0)) throw new Error('课程缺少可用的路线总距离')
  const config = loadRoutingConfig()
  const domestic = isInChina(start)
  const seedOffset = Math.max(0, Math.floor(deps.variant ?? 0)) * 97
  let candidates: RouteResult[]

  if (domestic) {
    if (!config.amapKey && !deps.amapRoute) throw new Error('缺少高德 Web 服务 Key，请在设置中配置')
    candidates = []
    for (const baseSeed of [1, 11, 29, 47]) {
      const seed = baseSeed + seedOffset
      const candidate = deps.amapRoute
        ? await deps.amapRoute(seed, shape)
        : shape === 'out_and_back'
          ? await generateAmapOutAndBackRoute(start, course.targetDistanceKm, config.amapKey, seed)
          : await generateAmapCyclingLoop(start, course.targetDistanceKm, config.amapKey, seed)
      if (shape === 'loop' && !analyzeLoopQuality(candidate).acceptable) continue
      candidates.push(candidate)
      if (candidates.length >= 2) break
    }
    candidates.forEach(route => { route.provider = 'amap' })
  } else {
    if (!config.orsKey && !deps.orsRoute) throw new Error('缺少 ORS API Key，请在设置中配置')
    candidates = await Promise.all([1, 11, 29].map(baseSeed => {
      const seed = baseSeed + seedOffset
      return deps.orsRoute
      ? deps.orsRoute(seed, shape)
      : shape === 'out_and_back'
        ? generateOutAndBackRoute(start, course.targetDistanceKm, 'cycling-regular', seed)
        : generateLoopRoute(start, course.targetDistanceKm, 'cycling-regular', seed)
    }))
    if (shape === 'loop') candidates = candidates.filter(route => analyzeLoopQuality(route).acceptable)
    candidates.forEach(route => { route.provider = 'ors' })
  }

  if (!candidates.length) {
    throw new Error('没有找到不走回头路的合格环线，请更换起点或改用单线往返')
  }

  const route = candidates.reduce((best, candidate) =>
    scoreRoute(candidate, course) < scoreRoute(best, course) ? candidate : best)
  route.recommendation = {
    courseName: course.courseName,
    targetDistanceKm: course.targetDistanceKm,
    clearRoadKm: course.clearRoadKm,
    mainBlockKm: course.mainBlockKm,
    maxGradePct: course.maxGradePct,
    estimatedSteepGradePct: estimatedSteepGrade(route),
    routeShape: shape,
    fitNote: fitNote(route, course, shape)
  }
  return route
}
