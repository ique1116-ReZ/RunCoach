// src/routing/ip-location.ts
// IP 粗略定位兜底：当浏览器 / 系统 geolocation 拿不到位置时使用。
// 精度大致到城市级（~10km），足够作为路线规划起点。
// 走 ipapi.co 的免费接口，无需 key，CORS 友好。
import type { LngLat } from './ors'

interface IpApiResponse {
  latitude?: unknown
  longitude?: unknown
}

export async function getIpLocation(): Promise<LngLat | null> {
  try {
    const r = await fetch('https://ipapi.co/json/')
    if (!r.ok) {
      console.warn(`[ip-geo] HTTP ${r.status}`)
      return null
    }
    const j = (await r.json()) as IpApiResponse
    if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') {
      console.warn('[ip-geo] 响应缺少 lat/lon', j)
      return null
    }
    return [j.longitude, j.latitude]
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn(`[ip-geo] 请求失败: ${msg}`)
    return null
  }
}
