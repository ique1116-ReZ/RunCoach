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
