import type { LngLat, RouteResult } from './ors'

const METERS_PER_DEGREE = Math.PI * 6371008.8 / 180

export const snapToRoute = (route: Pick<RouteResult, 'coordinates'>, click: LngLat) => {
  const coords = route.coordinates
  if (coords.length < 2) return null
  const lngScale = METERS_PER_DEGREE * Math.cos(click[1] * Math.PI / 180)
  const latScale = METERS_PER_DEGREE
  let best: { coord: LngLat; alongM: number; offsetM: number } | null = null
  let traveledM = 0
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1]
    const b = coords[i]
    const dx = (b[0] - a[0]) * lngScale
    const dy = (b[1] - a[1]) * latScale
    const segmentM = Math.hypot(dx, dy)
    if (segmentM < 0.01) continue
    const px = (click[0] - a[0]) * lngScale
    const py = (click[1] - a[1]) * latScale
    const fraction = Math.max(0, Math.min(1, (px * dx + py * dy) / (segmentM * segmentM)))
    const offsetM = Math.hypot(px - fraction * dx, py - fraction * dy)
    if (!best || offsetM < best.offsetM) {
      best = {
        coord: [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction],
        alongM: traveledM + segmentM * fraction,
        offsetM
      }
    }
    traveledM += segmentM
  }
  return best
}

export const addCheckpoint = (route: RouteResult, click: LngLat): RouteResult => {
  const snapped = snapToRoute(route, click)
  if (!snapped || snapped.offsetM > 120) throw new Error('请点在路线附近，再添加 CP 点')
  const prior = route.checkpoints ?? []
  if (prior.length >= 30) throw new Error('一条路线最多设置 30 个 CP 点')
  if (prior.some(cp => Math.abs(cp.alongM - snapped.alongM) < 30)) throw new Error('这里已有 CP 点，请选路线上的其他位置')
  const checkpoints = [...prior, { name: '', coord: snapped.coord, alongM: snapped.alongM }]
    .sort((a, b) => a.alongM - b.alongM)
    .map((cp, index) => ({ ...cp, name: `CP${index + 1}` }))
  return { ...route, checkpoints }
}

export const removeCheckpoint = (route: RouteResult, index: number): RouteResult => ({
  ...route,
  checkpoints: (route.checkpoints ?? []).filter((_, i) => i !== index)
    .map((cp, i) => ({ ...cp, name: `CP${i + 1}` }))
})
