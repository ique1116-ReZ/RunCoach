import type { LngLat, RouteResult } from './ors'

const PI = Math.PI
const AXIS = 6378245
const EE = 0.006693421622965943
// Keep the free-tier-friendly request rate at or below one request per second.
const AMAP_MIN_INTERVAL_MS = 1100
const AMAP_MAX_RATE_RETRIES = 3

let amapRequestQueue: Promise<void> = Promise.resolve()
let lastAmapRequestAt = 0

const pause = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms))

const scheduleAmapRequest = <T>(request: () => Promise<T>): Promise<T> => {
  const run = async () => {
    const waitMs = Math.max(0, AMAP_MIN_INTERVAL_MS - (Date.now() - lastAmapRequestAt))
    if (waitMs > 0) await pause(waitMs)
    lastAmapRequestAt = Date.now()
    return request()
  }
  const result = amapRequestQueue.then(run, run)
  amapRequestQueue = result.then(() => undefined, () => undefined)
  return result
}

const isAmapRateLimit = (json: any) =>
  /QPS_HAS_EXCEEDED_THE_LIMIT|ACCESS_TOO_FREQUENT/i.test(String(json?.info ?? ''))

const amapErrorMessage = (json: any) => {
  const info = String(json?.info ?? '未知错误')
  if (isAmapRateLimit(json)) return '高德路线服务当前请求较多，请稍后再试'
  if (info === 'DAILY_QUERY_OVER_LIMIT') return '高德路线服务今日调用额度已用完，请明天再试或调整控制台配额'
  return `高德路线规划失败：${info}`
}

const transformLat = (lng: number, lat: number) => {
  let value = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  value += (20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2 / 3
  value += (20 * Math.sin(lat * PI) + 40 * Math.sin(lat / 3 * PI)) * 2 / 3
  value += (160 * Math.sin(lat / 12 * PI) + 320 * Math.sin(lat * PI / 30)) * 2 / 3
  return value
}

const transformLng = (lng: number, lat: number) => {
  let value = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  value += (20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2 / 3
  value += (20 * Math.sin(lng * PI) + 40 * Math.sin(lng / 3 * PI)) * 2 / 3
  value += (150 * Math.sin(lng / 12 * PI) + 300 * Math.sin(lng / 30 * PI)) * 2 / 3
  return value
}

export const wgs84ToGcj02 = ([lng, lat]: LngLat): LngLat => {
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = lat / 180 * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / ((AXIS * (1 - EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180) / (AXIS / sqrtMagic * Math.cos(radLat) * PI)
  return [lng + dLng, lat + dLat]
}

export const gcj02ToWgs84 = (coord: LngLat): LngLat => {
  // Iteratively invert the transform. The former one-pass approximation could
  // leave the route several metres away from the WGS84 basemap in dense areas.
  let guess: LngLat = [...coord]
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const shifted = wgs84ToGcj02(guess)
    guess = [guess[0] - (shifted[0] - coord[0]), guess[1] - (shifted[1] - coord[1])]
  }
  return guess
}

const parsePolyline = (raw: string): LngLat[] => raw.split(';').map(point => {
  const [lng, lat] = point.split(',').map(Number)
  return [lng, lat] as LngLat
}).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))

export const parseAmapBicycling = (json: any): RouteResult => {
  if (String(json?.status) !== '1') throw new Error(amapErrorMessage(json))
  const paths = Array.isArray(json?.route?.paths) ? json.route.paths : []
  const path = paths[0]
  if (!path) throw new Error('高德未返回可用骑行路线')
  const steps = Array.isArray(path.steps) ? path.steps : []
  const gcjCoordinates = steps.flatMap((step: any) => parsePolyline(String(step.polyline ?? '')))
  const coordinates = gcjCoordinates.filter((coord, index) => {
    const previous = gcjCoordinates[index - 1]
    return !previous || previous[0] !== coord[0] || previous[1] !== coord[1]
  }).map(gcj02ToWgs84)
  if (coordinates.length < 2) throw new Error('高德路线缺少可绘制的坐标点')
  return {
    kind: 'point_to_point',
    coordinates,
    distanceM: Number(path.distance ?? 0),
    provider: 'amap'
  }
}

export const fetchAmapBicyclingLeg = async (
  start: LngLat,
  end: LngLat,
  key: string,
  deps: {
    request?: (url: string) => Promise<Response>
    schedule?: <T>(request: () => Promise<T>) => Promise<T>
    wait?: (ms: number) => Promise<void>
  } = {}
): Promise<RouteResult> => {
  if (!key.trim()) throw new Error('缺少高德 Web 服务 Key，请在设置中配置')
  const origin = wgs84ToGcj02(start).map(value => value.toFixed(6)).join(',')
  const destination = wgs84ToGcj02(end).map(value => value.toFixed(6)).join(',')
  const params = new URLSearchParams({
    key: key.trim(), origin, destination, output: 'json', show_fields: 'polyline,cost', alternative_route: '1'
  })
  const url = `https://restapi.amap.com/v5/direction/bicycling?${params}`
  const request = deps.request ?? (input => fetch(input))
  const schedule = deps.schedule ?? scheduleAmapRequest
  const wait = deps.wait ?? pause
  for (let attempt = 0; attempt < AMAP_MAX_RATE_RETRIES; attempt += 1) {
    const response = await schedule(() => request(url))
    if (!response.ok) throw new Error(`高德请求失败（${response.status}）`)
    const json = await response.json()
    if (String(json?.status) === '1') return parseAmapBicycling(json)
    if (!isAmapRateLimit(json) || attempt === AMAP_MAX_RATE_RETRIES - 1) {
      throw new Error(amapErrorMessage(json))
    }
    await wait(900 * 2 ** attempt)
  }
  throw new Error('高德路线服务当前请求较多，请稍后再试')
}

export const destinationPoint = ([lng, lat]: LngLat, distanceM: number, bearingDeg: number): LngLat => {
  const radius = 6371008.8
  const angular = distanceM / radius
  const bearing = bearingDeg * PI / 180
  const lat1 = lat * PI / 180
  const lng1 = lng * PI / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing))
  const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2))
  return [lng2 * 180 / PI, lat2 * 180 / PI]
}

const joinLegs = (legs: RouteResult[]): RouteResult => ({
  kind: 'loop',
  coordinates: legs.flatMap((leg, index) => index === 0 ? leg.coordinates : leg.coordinates.slice(1)),
  distanceM: legs.reduce((sum, leg) => sum + leg.distanceM, 0),
  provider: 'amap'
})

export const generateAmapCyclingLoop = async (
  start: LngLat,
  distanceKm: number,
  key: string,
  seed = 1,
  deps: { fetchLeg?: (start: LngLat, end: LngLat) => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchLeg = deps.fetchLeg ?? ((from, to) => fetchAmapBicyclingLeg(from, to, key))
  const targetM = distanceKm * 1000
  let requestedM = targetM
  let best: RouteResult | undefined

  for (let round = 0; round < 2; round += 1) {
    const radius = requestedM / 3.73
    const bearing = (seed * 137.508 + round * 17) % 360
    const first = destinationPoint(start, radius, bearing)
    const second = destinationPoint(start, radius, bearing + 120)
    const firstLeg = await fetchLeg(start, first)
    const secondLeg = await fetchLeg(first, second)
    const finalLeg = await fetchLeg(second, start)
    const route = joinLegs([firstLeg, secondLeg, finalLeg])
    if (!best || Math.abs(route.distanceM - targetM) < Math.abs(best.distanceM - targetM)) best = route
    if (Math.abs(route.distanceM - targetM) / targetM <= 0.08) return route
    requestedM *= targetM / Math.max(route.distanceM, 1)
  }
  return best as RouteResult
}

export const generateAmapOutAndBackRoute = async (
  start: LngLat,
  distanceKm: number,
  key: string,
  seed = 1,
  deps: { fetchLeg?: (start: LngLat, end: LngLat) => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchLeg = deps.fetchLeg ?? ((from, to) => fetchAmapBicyclingLeg(from, to, key))
  const targetM = distanceKm * 1000
  let oneWayM = targetM / 2
  let best: RouteResult | undefined
  for (let round = 0; round < 3; round += 1) {
    const turn = destinationPoint(start, oneWayM, (seed * 137.508 + round * 11) % 360)
    const outward = await fetchLeg(start, turn)
    const route: RouteResult = {
      kind: 'loop',
      coordinates: [...outward.coordinates, ...outward.coordinates.slice(0, -1).reverse()],
      distanceM: outward.distanceM * 2,
      provider: 'amap'
    }
    if (!best || Math.abs(route.distanceM - targetM) < Math.abs(best.distanceM - targetM)) best = route
    if (Math.abs(route.distanceM - targetM) / targetM <= 0.05) return route
    oneWayM *= targetM / Math.max(route.distanceM, 1)
  }
  return best as RouteResult
}
