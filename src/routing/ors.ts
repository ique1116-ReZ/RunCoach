export type LngLat = [number, number]

export type RouteResult = {
  kind: 'loop' | 'point_to_point'
  coordinates: LngLat[]
  distanceM: number
  ascentM?: number
  elevations?: number[]
}

export const buildRoundTripBody = (start: LngLat, lengthM: number, seed: number, points = 5) => ({
  coordinates: [start],
  elevation: true,
  options: { round_trip: { length: lengthM, points, seed } }
})

export const buildDirectionsBody = (start: LngLat, end: LngLat) => ({
  coordinates: [start, end],
  elevation: true
})

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/foot-walking'

export const parseGeoJson = (json: any, kind: RouteResult['kind']): RouteResult => {
  const feature = json?.features?.[0]
  if (!feature?.geometry?.coordinates?.length) {
    throw new Error('ORS 未返回可用路线')
  }
  const raw: number[][] = feature.geometry.coordinates
  const has3d = raw.some(c => c.length >= 3 && Number.isFinite(c[2]))
  const elevations = has3d ? raw.map(c => c[2]) : undefined
  const coordinates: LngLat[] = raw.map(
    (c: number[]) => [c[0], c[1]] as LngLat
  )
  const summary = feature.properties?.summary ?? {}
  return {
    kind,
    coordinates,
    distanceM: Number(summary.distance ?? 0),
    ascentM: summary.ascent !== undefined ? Number(summary.ascent) : undefined,
    elevations
  }
}

export const postOrs = async (body: object): Promise<any> => {
  const key = import.meta.env.VITE_ORS_KEY
  if (!key) throw new Error('缺少 VITE_ORS_KEY，请在 .env.local 配置')
  const res = await fetch(`${ORS_BASE}/geojson`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ORS 请求失败（${res.status}）：${text || res.statusText}`)
  }
  return res.json()
}

const TOLERANCE = 0.05
const MAX_ROUNDS = 3

export const generateLoopRoute = async (
  start: LngLat,
  distanceKm: number,
  seed = 1,
  deps: { fetchRoute?: (lengthM: number, seed: number) => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchRoute =
    deps.fetchRoute ??
    (async (lengthM: number, s: number) =>
      parseGeoJson(await postOrs(buildRoundTripBody(start, lengthM, s)), 'loop'))

  const target = distanceKm * 1000
  let requested = target
  let best: RouteResult | null = null

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = await fetchRoute(Math.round(requested), seed)
    const off = Math.abs(result.distanceM - target) / target
    if (off <= TOLERANCE) return result
    if (!best || Math.abs(result.distanceM - target) < Math.abs(best.distanceM - target)) {
      best = result
    }
    requested = requested * (target / result.distanceM)
  }
  return best as RouteResult
}

export const generatePointToPointRoute = async (
  start: LngLat,
  end: LngLat,
  deps: { fetchRoute?: () => Promise<RouteResult> } = {}
): Promise<RouteResult> => {
  const fetchRoute =
    deps.fetchRoute ??
    (async () => parseGeoJson(await postOrs(buildDirectionsBody(start, end)), 'point_to_point'))
  return fetchRoute()
}
