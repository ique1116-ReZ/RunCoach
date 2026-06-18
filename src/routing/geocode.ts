import type { LngLat } from './ors'

export type GeoHit = { name: string; center: LngLat }

export const parseGeocode = (json: any): GeoHit[] =>
  (json?.features ?? []).map((f: any) => ({
    name: f.text ?? f.place_name ?? '未知地点',
    center: [f.center[0], f.center[1]] as LngLat
  }))

export const geocodePlace = async (query: string): Promise<GeoHit[]> => {
  const key = import.meta.env.VITE_MAPTILER_KEY
  if (!key) throw new Error('缺少 VITE_MAPTILER_KEY')
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}&limit=5`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`地名搜索失败（${res.status}）`)
  return parseGeocode(await res.json())
}
