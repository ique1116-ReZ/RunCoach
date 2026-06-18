export type LngLat = [number, number]

export type RouteResult = {
  kind: 'loop' | 'point_to_point'
  coordinates: LngLat[]
  distanceM: number
  ascentM?: number
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
  const coordinates: LngLat[] = feature.geometry.coordinates.map(
    (c: number[]) => [c[0], c[1]] as LngLat
  )
  const summary = feature.properties?.summary ?? {}
  return {
    kind,
    coordinates,
    distanceM: Number(summary.distance ?? 0),
    ascentM: summary.ascent !== undefined ? Number(summary.ascent) : undefined
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
