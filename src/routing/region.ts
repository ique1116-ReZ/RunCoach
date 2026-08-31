import type { LngLat } from './ors'

// A deliberately conservative mainland outline. Hainan is handled separately.
// Routing near the border can still be overridden by choosing a nearby start point.
const MAINLAND: LngLat[] = [
  [73.5, 39.5], [75.5, 36], [79, 31], [86, 27.5], [93, 27.5], [97.5, 23.5],
  [102, 21.3], [108, 21.3], [113.5, 21.7], [119.5, 25], [122.5, 30.5],
  [121.5, 36.5], [124, 40], [131, 43], [134.8, 48.3], [128, 49.7],
  [122, 53.5], [116, 49.8], [111, 45], [103, 42], [96, 42.5], [91, 46],
  [82, 49.5], [79, 45], [73.5, 39.5]
]

const pointInPolygon = ([lng, lat]: LngLat, polygon: LngLat[]) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const crosses = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (crosses) inside = !inside
  }
  return inside
}

export const isInChina = (coord: LngLat) => {
  const [lng, lat] = coord
  const hainan = lng >= 108.5 && lng <= 111.5 && lat >= 18 && lat <= 20.7
  return hainan || pointInPolygon(coord, MAINLAND)
}
