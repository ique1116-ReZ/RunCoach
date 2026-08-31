import type { LngLat, RouteResult } from './ors'

type Sample = {
  x: number
  y: number
  alongM: number
  lengthM: number
  ux: number
  uy: number
}

export type LoopQuality = {
  acceptable: boolean
  backtrackDistanceM: number
  backtrackRatio: number
  closureGapM: number
  reason?: string
}

const EARTH_RADIUS_M = 6371008.8
const SAMPLE_STEP_M = 16
const CORRIDOR_RADIUS_M = 10
const MIN_SEPARATION_M = 60

export const distanceM = (a: LngLat, b: LngLat) => {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const lat1 = a[1] * rad
  const lat2 = b[1] * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const sampleRoute = (coordinates: LngLat[]): Sample[] => {
  if (coordinates.length < 2) return []
  const origin = coordinates[0]
  const latScale = Math.PI * EARTH_RADIUS_M / 180
  const lngScale = latScale * Math.cos(origin[1] * Math.PI / 180)
  const xy = coordinates.map(([lng, lat]) => ({
    x: (lng - origin[0]) * lngScale,
    y: (lat - origin[1]) * latScale
  }))
  const samples: Sample[] = []
  let alongM = 0

  for (let index = 1; index < xy.length; index += 1) {
    const from = xy[index - 1]
    const to = xy[index]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthM = Math.hypot(dx, dy)
    if (!(lengthM > 0.5)) continue
    const pieces = Math.max(1, Math.ceil(lengthM / SAMPLE_STEP_M))
    const pieceLength = lengthM / pieces
    for (let piece = 0; piece < pieces; piece += 1) {
      const fraction = (piece + 0.5) / pieces
      samples.push({
        x: from.x + dx * fraction,
        y: from.y + dy * fraction,
        alongM: alongM + pieceLength * (piece + 0.5),
        lengthM: pieceLength,
        ux: dx / lengthM,
        uy: dy / lengthM
      })
    }
    alongM += lengthM
  }
  return samples
}

const gridKey = (x: number, y: number) => `${x}:${y}`

export const analyzeLoopQuality = (route: Pick<RouteResult, 'coordinates' | 'distanceM'>): LoopQuality => {
  const coordinates = route.coordinates
  if (coordinates.length < 4) {
    return { acceptable: false, backtrackDistanceM: 0, backtrackRatio: 0, closureGapM: Infinity, reason: '路线坐标不足' }
  }
  const samples = sampleRoute(coordinates)
  const sampledDistanceM = samples.reduce((sum, sample) => sum + sample.lengthM, 0)
  const cells = new Map<string, Sample[]>()
  let backtrackDistanceM = 0

  for (const sample of samples) {
    const cellX = Math.floor(sample.x / CORRIDOR_RADIUS_M)
    const cellY = Math.floor(sample.y / CORRIDOR_RADIUS_M)
    let reversed = false
    for (let dx = -1; dx <= 1 && !reversed; dx += 1) {
      for (let dy = -1; dy <= 1 && !reversed; dy += 1) {
        const previous = cells.get(gridKey(cellX + dx, cellY + dy)) ?? []
        reversed = previous.some(candidate => {
          if (sample.alongM - candidate.alongM < MIN_SEPARATION_M) return false
          if (Math.hypot(sample.x - candidate.x, sample.y - candidate.y) > CORRIDOR_RADIUS_M) return false
          return sample.ux * candidate.ux + sample.uy * candidate.uy < -0.82
        })
      }
    }
    if (reversed) backtrackDistanceM += sample.lengthM
    const key = gridKey(cellX, cellY)
    const bucket = cells.get(key)
    if (bucket) bucket.push(sample)
    else cells.set(key, [sample])
  }

  const closureGapM = distanceM(coordinates[0], coordinates[coordinates.length - 1])
  const backtrackRatio = backtrackDistanceM / Math.max(sampledDistanceM, 1)
  const backtrackLimitM = Math.max(120, Math.min(250, sampledDistanceM * 0.008))
  const closureLimitM = Math.max(80, Math.min(250, route.distanceM * 0.004))
  if (closureGapM > closureLimitM) {
    return { acceptable: false, backtrackDistanceM, backtrackRatio, closureGapM, reason: '路线没有真正回到起点' }
  }
  if (backtrackDistanceM > backtrackLimitM) {
    return { acceptable: false, backtrackDistanceM, backtrackRatio, closureGapM, reason: '路线包含明显回头路' }
  }
  return { acceptable: true, backtrackDistanceM, backtrackRatio, closureGapM }
}
