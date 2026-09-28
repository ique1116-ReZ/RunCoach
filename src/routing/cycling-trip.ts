import { fetchAmapBicyclingCandidates, gcj02ToWgs84, rankAmapCyclingCandidates, type AmapCyclingCandidate } from './amap'
import { loadRoutingConfig } from './config'
import type { LngLat, RouteResult } from './ors'

export type Place = { name: string; coord: LngLat }
export type PoiSuggestion = Place & { id: string; district: string; address: string }

export const searchAmapPois = async (
  keywords: string,
  key = loadRoutingConfig().amapKey,
  deps: { request?: typeof fetch; signal?: AbortSignal } = {}
): Promise<PoiSuggestion[]> => {
  const query = keywords.trim()
  if (query.length < 2) return []
  if (!key) throw new Error('缺少高德 Web 服务 Key，请在设置中配置')
  const params = new URLSearchParams({ key, keywords: query, datatype: 'poi', output: 'json' })
  const response = await (deps.request ?? fetch)(`https://restapi.amap.com/v3/assistant/inputtips?${params}`, { signal: deps.signal })
  if (!response.ok) throw new Error(`高德地点搜索失败（${response.status}）`)
  const json = await response.json()
  if (String(json?.status) !== '1') throw new Error(`高德地点搜索失败：${json?.info ?? '未知错误'}`)
  const tips = Array.isArray(json.tips) ? json.tips : []
  return tips.flatMap((tip: any): PoiSuggestion[] => {
    const numbers = String(tip.location ?? '').split(',').map(Number)
    if (numbers.length !== 2 || !Number.isFinite(numbers[0]) || !Number.isFinite(numbers[1])) return []
    return [{
      id: String(tip.id ?? ''),
      name: String(tip.name ?? ''),
      district: String(tip.district ?? ''),
      address: String(tip.address ?? ''),
      coord: gcj02ToWgs84(numbers as LngLat)
    }]
  })
}

export const resolveAmapPoi = async (
  query: string,
  key: string,
  search: typeof searchAmapPois = searchAmapPois
): Promise<Place> => {
  const matches = await search(query, key)
  const exact = matches.filter(hit => hit.name === query.trim())
  const chosen = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null
  if (!chosen) {
    if (matches.length > 1) throw new Error(`“${query}”有多个同名或相近地点，请从下拉列表选择具体地点`)
    throw new Error(`找不到“${query}”，请换一个地点名称或在地图上选点`)
  }
  return { name: [chosen.name, chosen.district].filter(Boolean).join(' · '), coord: chosen.coord }
}

export const geocodeAmapPlace = async (
  address: string,
  key: string,
  request: typeof fetch = fetch
): Promise<Place> => {
  const query = address.trim()
  if (!query) throw new Error('请填写起点和终点')
  const params = new URLSearchParams({ key, address: query, output: 'json' })
  const response = await request(`https://restapi.amap.com/v3/geocode/geo?${params}`)
  if (!response.ok) throw new Error(`高德地点搜索失败（${response.status}）`)
  const json = await response.json()
  if (String(json?.status) !== '1') throw new Error(`高德地点搜索失败：${json?.info ?? '未知错误'}`)
  const match = Array.isArray(json.geocodes) ? json.geocodes[0] : undefined
  const parts = String(match?.location ?? '').split(',').map(Number)
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    throw new Error(`找不到“${query}”，请补充城市、区县或详细地址`)
  }
  return { name: String(match.formatted_address || query), coord: gcj02ToWgs84(parts as LngLat) }
}

export const planCyclingTrip = async (
  origin: string | Place,
  destination: string | Place,
  viaPoints: Place[] = [],
  preferGreenway = true,
  deps: {
    resolve?: (query: string, key: string) => Promise<Place>
    fetchCandidates?: typeof fetchAmapBicyclingCandidates
  } = {}
): Promise<RouteResult[]> => {
  const key = loadRoutingConfig().amapKey
  if (!key) throw new Error('缺少高德 Web 服务 Key，请在设置中配置')
  const resolve = deps.resolve ?? resolveAmapPoi
  const start = typeof origin === 'string' ? await resolve(origin, key) : origin
  const end = typeof destination === 'string' ? await resolve(destination, key) : destination
  const waypoints = [start, ...viaPoints, end]
  const segments: AmapCyclingCandidate[][] = []
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    segments.push(await (deps.fetchCandidates ?? fetchAmapBicyclingCandidates)(waypoints[index].coord, waypoints[index + 1].coord, key, { alternativeRoute: 3 }))
  }
  const alternativeCount = Math.min(...segments.map(segment => segment.length))
  const candidates = Array.from({ length: alternativeCount }, (_, alternativeIndex) => {
    const legs = segments.map(segment => segment[alternativeIndex])
    return {
      route: {
        kind: 'point_to_point' as const,
        coordinates: legs.flatMap((leg, index) => {
          const coordinates = [...leg.route.coordinates]
          coordinates[0] = waypoints[index].coord
          coordinates[coordinates.length - 1] = waypoints[index + 1].coord
          return index === 0 ? coordinates : coordinates.slice(1)
        }),
        distanceM: legs.reduce((sum, leg) => sum + leg.route.distanceM, 0),
        provider: 'amap' as const
      },
      greenwayNamedM: legs.reduce((sum, leg) => sum + leg.greenwayNamedM, 0),
      greenwayRoads: [...new Set(legs.flatMap(leg => leg.greenwayRoads))],
    }
  })
  return rankAmapCyclingCandidates(candidates, preferGreenway).map((candidate, index) => ({
    ...candidate.route,
    cyclingTrip: {
      originName: start.name,
      destinationName: end.name,
      viaNames: viaPoints.map(point => point.name),
      viaPoints,
      greenwayNamedM: candidate.greenwayNamedM,
      greenwayRoads: candidate.greenwayRoads,
      alternativeCount,
      alternativeIndex: index + 1,
      greenwayPreferred: preferGreenway
    }
  }))
}
