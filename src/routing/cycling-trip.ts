import { fetchAmapBicyclingCandidates, gcj02ToWgs84, rankAmapCyclingCandidates, type AmapCyclingCandidate } from './amap'
import { loadRoutingConfig } from './config'
import type { LngLat, RouteResult } from './ors'

export type Place = { name: string; coord: LngLat }
export type PoiSuggestion = Place & { id: string; district: string; address: string }

const AMAP_CITY_PREFIXES = [
  '深圳市', '上海市', '北京市', '广州市', '天津市', '重庆市', '香港', '澳门',
  '深圳', '上海', '北京', '广州', '天津', '重庆', '杭州', '成都', '武汉', '南京',
  '苏州', '西安', '长沙', '厦门', '青岛', '郑州', '福州', '宁波', '东莞', '佛山',
  '珠海', '无锡', '大连', '沈阳', '济南', '合肥', '南宁', '昆明', '贵阳', '南昌',
  '海口', '哈尔滨', '长春', '石家庄', '太原', '兰州', '银川', '乌鲁木齐', '呼和浩特'
]

const cityScopedQuery = (query: string) => {
  const city = AMAP_CITY_PREFIXES.find(prefix => query.startsWith(prefix) && query.length > prefix.length)
  return city ? { city: city.endsWith('市') ? city.slice(0, -1) : city, keywords: query.slice(city.length).trim() } : { city: '', keywords: query }
}

const poiFromAmap = (poi: any): PoiSuggestion | null => {
  const numbers = String(poi.location ?? '').split(',').map(Number)
  if (numbers.length !== 2 || !Number.isFinite(numbers[0]) || !Number.isFinite(numbers[1])) return null
  const name = String(poi.name ?? '').trim()
  if (!name) return null
  return {
    id: String(poi.id ?? `${name}-${numbers.join(',')}`),
    name,
    district: String(poi.district ?? [poi.cityname, poi.adname].filter(Boolean).join('')),
    address: String(poi.address ?? ''),
    coord: gcj02ToWgs84(numbers as LngLat)
  }
}

export const searchAmapPois = async (
  keywords: string,
  key = loadRoutingConfig().amapKey,
  deps: { request?: typeof fetch; signal?: AbortSignal } = {}
): Promise<PoiSuggestion[]> => {
  const query = keywords.trim()
  if (query.length < 2) return []
  if (!key) throw new Error('缺少高德 Web 服务 Key，请在设置中配置')
  const request = deps.request ?? fetch
  const { city, keywords: scopedKeywords } = cityScopedQuery(query)
  const inputTips = async (term: string, cityName = ''): Promise<PoiSuggestion[]> => {
    const params = new URLSearchParams({ key, keywords: term, datatype: 'poi', output: 'json' })
    if (cityName) params.set('city', cityName)
    const response = await request(`https://restapi.amap.com/v3/assistant/inputtips?${params}`, { signal: deps.signal })
    if (!response.ok) throw new Error(`高德地点搜索失败（${response.status}）`)
    const json = await response.json()
    if (String(json?.status) !== '1') throw new Error(`高德地点搜索失败：${json?.info ?? '未知错误'}`)
    return (Array.isArray(json.tips) ? json.tips : []).flatMap((tip: any) => {
      const place = poiFromAmap(tip)
      return place ? [place] : []
    })
  }

  const direct = await inputTips(scopedKeywords, city)
  if (direct.length) return direct

  // Strip a typed city prefix and pass it as a city scope; if the exact POI
  // phrase still misses, broaden to the landmark category before text search.
  const fallbackTerms = [...new Set([
    ...(['红树林', '湿地公园', '绿道', '森林公园', '公园', '广场', '骑行道']
      .filter(term => query.includes(term)))
  ])]
  const results: PoiSuggestion[] = []
  for (const term of fallbackTerms) {
    results.push(...await inputTips(term, city))
    if (results.length >= 10) break
  }
  if (results.length) return [...new Map(results.map(result => [result.id, result])).values()].slice(0, 10)

  // The dedicated POI text search is a broader fallback for aliases and POIs
  // that inputtips does not return, and it uses the same Web Service key.
  const textTerms = fallbackTerms.length ? fallbackTerms : [query]
  for (const term of textTerms) {
    const params = new URLSearchParams({ key, keywords: term, output: 'json', offset: '20', page: '1' })
    if (city) { params.set('city', city); params.set('citylimit', 'true') }
    const response = await request(`https://restapi.amap.com/v3/place/text?${params}`, { signal: deps.signal })
    if (!response.ok) throw new Error(`高德地点搜索失败（${response.status}）`)
    const json = await response.json()
    if (String(json?.status) !== '1') throw new Error(`高德地点搜索失败：${json?.info ?? '未知错误'}`)
    const pois = Array.isArray(json.pois) ? json.pois : []
    const matches: PoiSuggestion[] = pois.flatMap((poi: any): PoiSuggestion[] => {
      const place = poiFromAmap(poi)
      return place ? [place] : []
    })
    if (matches.length) return [...new Map<string, PoiSuggestion>(matches.map(result => [result.id, result])).values()].slice(0, 10)
  }
  return []
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
