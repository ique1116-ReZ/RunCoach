// src/map/layers.ts
import maplibregl from 'maplibre-gl'
import type { GeoJSON } from 'geojson'
import type { LngLat } from '@/routing/ors'

const lineGeo = (coords: LngLat[]) => ({
  type: 'FeatureCollection' as const,
  features: coords.length ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }] : []
})
const pointGeo = (coord: LngLat | null) => ({
  type: 'FeatureCollection' as const,
  features: coord ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: coord } }] : []
})

export const ensureLayers = (map: maplibregl.Map) => {
  const add = (id: string) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: lineGeo([]) }) }
  add('route'); add('track'); add('start'); add('runner')
  if (!map.getLayer('route-line')) map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#2f6df6', 'line-width': 5 } })
  if (!map.getLayer('track-line')) map.addLayer({ id: 'track-line', type: 'line', source: 'track', paint: { 'line-color': '#f2994a', 'line-width': 5 } })
  if (!map.getLayer('start-dot')) map.addLayer({ id: 'start-dot', type: 'circle', source: 'start', paint: { 'circle-radius': 7, 'circle-color': '#36d399', 'circle-stroke-width': 2, 'circle-stroke-color': '#0f1622' } })
  if (!map.getLayer('runner-dot')) map.addLayer({ id: 'runner-dot', type: 'circle', source: 'runner', paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': '#2f6df6' } })
}

const setSource = (map: maplibregl.Map, id: string, data: GeoJSON) => {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(data)
}

export const setRouteLine = (map: maplibregl.Map, coords: LngLat[]) => setSource(map, 'route', lineGeo(coords))
export const setTrack = (map: maplibregl.Map, coords: LngLat[]) => setSource(map, 'track', lineGeo(coords))
export const setStartPin = (map: maplibregl.Map, coord: LngLat | null) => setSource(map, 'start', pointGeo(coord))
export const setRunnerMarker = (map: maplibregl.Map, coord: LngLat | null) => setSource(map, 'runner', pointGeo(coord))
export const clearRoute = (map: maplibregl.Map) => { setRouteLine(map, []); setStartPin(map, null) }

export const fitToCoords = (map: maplibregl.Map, coords: LngLat[]) => {
  if (coords.length === 0) return
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(coords[0], coords[0])
  )
  map.fitBounds(bounds, { padding: 60, maxZoom: 16 })
}
