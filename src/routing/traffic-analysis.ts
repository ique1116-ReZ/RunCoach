import type { LngLat, RouteResult, RouteTrafficAnalysis } from './ors'
import { distanceM } from './route-quality'

const OVERPASS_ENDPOINTS = import.meta.env.DEV
  ? ['/api/overpass-primary', '/api/overpass-fallback']
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const GENERAL_SIGNAL_SNAP_M = 18
const CROSSING_SIGNAL_SNAP_M = 10
const INTERSECTION_CLUSTER_M = 65
const SIGNAL_BUFFER_M = 40

type RawSignal = {
  coord: LngLat
  kind: 'general' | 'crossing'
}

type RouteMeasure = {
  cumulative: number[]
  totalM: number
}

const measureRoute = (coordinates: LngLat[]): RouteMeasure => {
  const cumulative = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distanceM(coordinates[index - 1], coordinates[index]))
  }
  return { cumulative, totalM: cumulative.at(-1) ?? 0 }
}

const projectSignalOccurrences = (point: LngLat, coordinates: LngLat[], measure: RouteMeasure) => {
  const latScale = Math.PI * 6371008.8 / 180
  const lngScale = latScale * Math.cos(point[1] * Math.PI / 180)
  const candidates: Array<{ distanceM: number; alongM: number }> = []
  for (let index = 1; index < coordinates.length; index += 1) {
    const a = coordinates[index - 1]
    const b = coordinates[index]
    const ax = (a[0] - point[0]) * lngScale
    const ay = (a[1] - point[1]) * latScale
    const bx = (b[0] - point[0]) * lngScale
    const by = (b[1] - point[1]) * latScale
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0
    const px = ax + dx * t
    const py = ay + dy * t
    const candidateDistance = Math.hypot(px, py)
    candidates.push({
      distanceM: candidateDistance,
      alongM: measure.cumulative[index - 1] + (measure.cumulative[index] - measure.cumulative[index - 1]) * t
    })
  }
  const minimumDistanceM = Math.min(...candidates.map(candidate => candidate.distanceM))
  const nearby = candidates.filter(candidate => candidate.distanceM <= minimumDistanceM + 3)
    .sort((a, b) => a.alongM - b.alongM)
  const occurrences: Array<{ distanceM: number; alongM: number }> = []
  for (const candidate of nearby) {
    const previous = occurrences.at(-1)
    if (!previous || candidate.alongM - previous.alongM >= 45) occurrences.push(candidate)
    else if (candidate.distanceM < previous.distanceM) occurrences[occurrences.length - 1] = candidate
  }
  return { minimumDistanceM, occurrences }
}

const pointAt = (coordinates: LngLat[], measure: RouteMeasure, alongM: number): LngLat => {
  const target = Math.max(0, Math.min(measure.totalM, alongM))
  let index = 1
  while (index < measure.cumulative.length && measure.cumulative[index] < target) index += 1
  if (index >= coordinates.length) return coordinates.at(-1) as LngLat
  const startM = measure.cumulative[index - 1]
  const endM = measure.cumulative[index]
  const t = endM > startM ? (target - startM) / (endM - startM) : 0
  return [
    coordinates[index - 1][0] + (coordinates[index][0] - coordinates[index - 1][0]) * t,
    coordinates[index - 1][1] + (coordinates[index][1] - coordinates[index - 1][1]) * t
  ]
}

const sliceRoute = (coordinates: LngLat[], measure: RouteMeasure, startM: number, endM: number): LngLat[] => {
  if (endM <= startM) return []
  const result: LngLat[] = [pointAt(coordinates, measure, startM)]
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    if (measure.cumulative[index] > startM && measure.cumulative[index] < endM) result.push(coordinates[index])
  }
  result.push(pointAt(coordinates, measure, endM))
  return result
}

const queryTrafficSignals = async (
  coordinates: LngLat[],
  request: typeof fetch,
  signal?: AbortSignal
): Promise<RawSignal[]> => {
  const lngs = coordinates.map(coord => coord[0])
  const lats = coordinates.map(coord => coord[1])
  const margin = 0.001
  const south = Math.min(...lats) - margin
  const west = Math.min(...lngs) - margin
  const north = Math.max(...lats) + margin
  const east = Math.max(...lngs) + margin
  const query = `[out:json][timeout:15];(node["highway"="traffic_signals"](${south},${west},${north},${east});node["highway"="crossing"]["crossing"="traffic_signals"](${south},${west},${north},${east}););out body;`
  let lastError: unknown
  let json: { elements?: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }> } | undefined
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const endpointSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8500)])
        : AbortSignal.timeout(8500)
      const response = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        signal: endpointSignal
      })
      if (!response.ok) throw new Error(`交通岗数据请求失败（${response.status}）`)
      json = await response.json() as { elements?: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }> }
      break
    } catch (error) {
      lastError = error
      if (signal?.aborted) throw error
    }
  }
  if (!json) throw lastError instanceof Error ? lastError : new Error('交通岗数据服务暂不可用')
  return (json.elements ?? [])
    .filter(item => Number.isFinite(item.lon) && Number.isFinite(item.lat))
    .map(item => ({
      coord: [item.lon as number, item.lat as number] as LngLat,
      kind: item.tags?.highway === 'traffic_signals' ? 'general' as const : 'crossing' as const
    }))
}

export const defaultRequiredClearM = (route: RouteResult) => {
  const recommendation = route.recommendation
  if (recommendation?.clearRoadKm && recommendation.clearRoadKm > 0) return recommendation.clearRoadKm * 1000
  if (recommendation?.mainBlockKm && recommendation.mainBlockKm > 0) {
    return Math.min(recommendation.mainBlockKm * 1000, route.distanceM * 0.5)
  }
  return Math.min(5000, Math.max(2000, route.distanceM * 0.25))
}

export const analyzeRouteTraffic = async (
  route: RouteResult,
  deps: { request?: typeof fetch; signal?: AbortSignal } = {}
): Promise<RouteTrafficAnalysis> => {
  if (route.coordinates.length < 2) throw new Error('路线坐标不足，无法分析交通岗')
  const measure = measureRoute(route.coordinates)
  const rawSignals = await queryTrafficSignals(route.coordinates, deps.request ?? fetch, deps.signal)
  const projected = rawSignals.map(signal => ({
    ...signal,
    ...projectSignalOccurrences(signal.coord, route.coordinates, measure)
  })).filter(item => item.minimumDistanceM <= (item.kind === 'general' ? GENERAL_SIGNAL_SNAP_M : CROSSING_SIGNAL_SNAP_M))

  const clusters: typeof projected[] = []
  for (const item of projected) {
    const cluster = clusters.find(members => members.some(member => distanceM(member.coord, item.coord) <= INTERSECTION_CLUSTER_M))
    if (cluster) cluster.push(item)
    else clusters.push([item])
  }

  const signals: RouteTrafficAnalysis['signals'] = []
  for (const cluster of clusters) {
    const occurrenceCandidates = cluster.flatMap(item => item.occurrences).sort((a, b) => a.alongM - b.alongM)
    const occurrencesM: number[] = []
    for (const occurrence of occurrenceCandidates) {
      const previous = occurrencesM.at(-1)
      if (previous === undefined || occurrence.alongM - previous >= 50) occurrencesM.push(occurrence.alongM)
    }
    if (!occurrencesM.length) continue
    signals.push({
      coord: pointAt(route.coordinates, measure, occurrencesM[0]),
      alongM: occurrencesM[0],
      occurrencesM
    })
  }
  signals.sort((a, b) => a.alongM - b.alongM)
  const passagePositions = signals.flatMap(signal => signal.occurrencesM).sort((a, b) => a - b)
    .filter((alongM, index, all) => index === 0 || alongM - all[index - 1] >= 50)

  const requiredClearM = defaultRequiredClearM(route)
  const smoothSegments: RouteTrafficAnalysis['smoothSegments'] = []
  let longestClearM = 0

  const addClearRange = (clearStart: number, clearEnd: number) => {
    const clearDistance = Math.max(0, clearEnd - clearStart)
    longestClearM = Math.max(longestClearM, clearDistance)
    if (clearDistance < requiredClearM) return
    if (clearEnd <= measure.totalM) {
      smoothSegments.push({ coordinates: sliceRoute(route.coordinates, measure, clearStart, clearEnd), distanceM: clearDistance })
      return
    }
    const firstDistance = measure.totalM - clearStart
    smoothSegments.push({ coordinates: sliceRoute(route.coordinates, measure, clearStart, measure.totalM), distanceM: firstDistance })
    smoothSegments.push({ coordinates: sliceRoute(route.coordinates, measure, 0, clearEnd - measure.totalM), distanceM: clearDistance - firstDistance })
  }

  const closedLoop = distanceM(route.coordinates[0], route.coordinates.at(-1) as LngLat) <= 100
  if (closedLoop && passagePositions.length > 0) {
    for (let index = 1; index < passagePositions.length; index += 1) {
      addClearRange(passagePositions[index - 1] + SIGNAL_BUFFER_M, passagePositions[index] - SIGNAL_BUFFER_M)
    }
    addClearRange(
      passagePositions.at(-1)! + SIGNAL_BUFFER_M,
      measure.totalM + passagePositions[0] - SIGNAL_BUFFER_M
    )
  } else {
    const boundaries = [0, ...passagePositions, measure.totalM]
    for (let index = 1; index < boundaries.length; index += 1) {
      addClearRange(
        boundaries[index - 1] + (index === 1 ? 0 : SIGNAL_BUFFER_M),
        boundaries[index] - (index === boundaries.length - 1 ? 0 : SIGNAL_BUFFER_M)
      )
    }
  }

  return {
    status: 'ready',
    source: 'openstreetmap',
    signals,
    smoothSegments,
    longestClearM,
    requiredClearM,
    note: '同一路口多个灯头合并为一个交通岗；仅统计贴近骑行轨迹、可能打断连续骑行的公开地图信号灯'
  }
}

export const unavailableTrafficAnalysis = (route: RouteResult): RouteTrafficAnalysis => ({
  status: 'unavailable',
  source: 'openstreetmap',
  signals: [],
  smoothSegments: [],
  longestClearM: 0,
  requiredClearM: defaultRequiredClearM(route),
  note: '未取得交通岗数据，路线顺畅程度尚未验证'
})

export const pendingTrafficAnalysis = (route: RouteResult): RouteTrafficAnalysis => ({
  status: 'analyzing',
  source: 'openstreetmap',
  signals: [],
  smoothSegments: [],
  longestClearM: 0,
  requiredClearM: defaultRequiredClearM(route),
  note: '正在自动识别会打断连续骑行的受控路口…'
})
