// src/map/layers.ts
import maplibregl from 'maplibre-gl'
import type { GeoJSON } from 'geojson'
import type { LngLat, RouteResult } from '@/routing/ors'

const lineGeo = (coords: LngLat[]) => ({
  type: 'FeatureCollection' as const,
  features: coords.length ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }] : []
})
const pointGeo = (coord: LngLat | null) => ({
  type: 'FeatureCollection' as const,
  features: coord ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: coord } }] : []
})

const pointsGeo = (coords: LngLat[]) => ({
  type: 'FeatureCollection' as const,
  features: coords.map(coord => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: coord } }))
})

const linesGeo = (lines: LngLat[][]) => ({
  type: 'FeatureCollection' as const,
  features: lines.filter(line => line.length > 1).map(coordinates => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates }
  }))
})

export const ensureLayers = (map: maplibregl.Map) => {
  const add = (id: string) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: lineGeo([]) }) }
  add('route'); add('route-smooth'); add('traffic-signals'); add('track'); add('current-location'); add('start'); add('runner')
  if (!map.getLayer('route-line-casing')) map.addLayer({ id: 'route-line-casing', type: 'line', source: 'route', paint: { 'line-color': '#071019', 'line-width': 9, 'line-opacity': 0.8 } })
  if (!map.getLayer('route-line')) map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#5f8fff', 'line-width': 5.5 } })
  if (!map.getLayer('route-smooth-casing')) map.addLayer({ id: 'route-smooth-casing', type: 'line', source: 'route-smooth', paint: { 'line-color': '#071019', 'line-width': 10, 'line-opacity': 0.72 } })
  if (!map.getLayer('route-smooth-line')) map.addLayer({ id: 'route-smooth-line', type: 'line', source: 'route-smooth', paint: { 'line-color': '#36d399', 'line-width': 6.5 } })
  if (!map.getLayer('track-line')) map.addLayer({ id: 'track-line', type: 'line', source: 'track', paint: { 'line-color': '#f2994a', 'line-width': 5 } })
  if (!map.getLayer('current-location-halo')) map.addLayer({ id: 'current-location-halo', type: 'circle', source: 'current-location', paint: { 'circle-radius': 14, 'circle-color': '#7aa7ff', 'circle-opacity': 0.24 } })
  if (!map.getLayer('current-location-dot')) map.addLayer({ id: 'current-location-dot', type: 'circle', source: 'current-location', paint: { 'circle-radius': 6, 'circle-color': '#7aa7ff', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } })
  if (!map.getLayer('start-halo')) map.addLayer({ id: 'start-halo', type: 'circle', source: 'start', paint: { 'circle-radius': 15, 'circle-color': '#36d399', 'circle-opacity': 0.22 } })
  if (!map.getLayer('start-dot')) map.addLayer({ id: 'start-dot', type: 'circle', source: 'start', paint: { 'circle-radius': 8, 'circle-color': '#36d399', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })
  if (!map.getLayer('traffic-signal-halo')) map.addLayer({ id: 'traffic-signal-halo', type: 'circle', source: 'traffic-signals', paint: { 'circle-radius': 11, 'circle-color': '#ff654f', 'circle-opacity': 0.22 } })
  if (!map.getLayer('traffic-signal-dot')) map.addLayer({ id: 'traffic-signal-dot', type: 'circle', source: 'traffic-signals', paint: { 'circle-radius': 5.5, 'circle-color': '#ff654f', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } })
  if (!map.getLayer('runner-dot')) map.addLayer({ id: 'runner-dot', type: 'circle', source: 'runner', paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': '#2f6df6' } })
}

const setSource = (map: maplibregl.Map, id: string, data: GeoJSON) => {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(data)
}

export const setRouteLine = (map: maplibregl.Map, coords: LngLat[]) => setSource(map, 'route', lineGeo(coords))
export const setRouteTrafficAnalysis = (map: maplibregl.Map, route: RouteResult) => {
  const analysis = route.trafficAnalysis
  setSource(map, 'route-smooth', linesGeo(analysis?.status === 'ready' ? analysis.smoothSegments.map(segment => segment.coordinates) : []))
  setSource(map, 'traffic-signals', pointsGeo(analysis?.status === 'ready' ? analysis.signals.map(signal => signal.coord) : []))
}
export const setTrack = (map: maplibregl.Map, coords: LngLat[]) => setSource(map, 'track', lineGeo(coords))
export const setCurrentLocationMarker = (map: maplibregl.Map, coord: LngLat | null) => setSource(map, 'current-location', pointGeo(coord))
export const setStartPin = (map: maplibregl.Map, coord: LngLat | null) => setSource(map, 'start', pointGeo(coord))
export const setRunnerMarker = (map: maplibregl.Map, coord: LngLat | null) => setSource(map, 'runner', pointGeo(coord))
export const clearRoute = (map: maplibregl.Map) => {
  setRouteLine(map, [])
  setSource(map, 'route-smooth', linesGeo([]))
  setSource(map, 'traffic-signals', pointsGeo([]))
  setStartPin(map, null)
}

export const fitToCoords = (map: maplibregl.Map, coords: LngLat[]) => {
  if (coords.length === 0) return
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(coords[0], coords[0])
  )
  map.fitBounds(bounds, { padding: 60, maxZoom: 16 })
}
