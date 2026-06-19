// src/map/MapView.tsx
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ensureLayers } from './layers'
import type { LngLat } from '@/routing/ors'

const styleUrl = `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`

export const MapView = ({ onReady, onMapClick }: { onReady: (m: maplibregl.Map) => void; onMapClick: (c: LngLat) => void }) => {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = new maplibregl.Map({ container: ref.current, style: styleUrl, center: [121.47, 31.23], zoom: 13 })
    mapRef.current = map
    map.on('load', () => { ensureLayers(map); onReady(map) })
    map.on('click', (e) => onMapClick([e.lngLat.lng, e.lngLat.lat]))
    return () => { map.remove(); mapRef.current = null }
  }, [])
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
}
