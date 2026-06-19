// src/map/MapView.tsx
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ensureLayers } from './layers'
import type { LngLat } from '@/routing/ors'

const styleUrl = `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`

export const MapView = ({ onReady, onMapClick, picking }: { onReady: (m: maplibregl.Map) => void; onMapClick: (c: LngLat) => void; picking?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // 始终指向最新的 onMapClick，避免地图 click 监听只绑定挂载时的旧闭包（导致 picking 永远是 false）
  const clickRef = useRef(onMapClick)
  clickRef.current = onMapClick
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = new maplibregl.Map({ container: ref.current, style: styleUrl, center: [121.47, 31.23], zoom: 13 })
    mapRef.current = map
    map.on('load', () => { ensureLayers(map); onReady(map) })
    map.on('click', (e) => clickRef.current([e.lngLat.lng, e.lngLat.lat]))
    return () => { map.remove(); mapRef.current = null }
  }, [])
  return <div ref={ref} style={{ position: 'absolute', inset: 0, cursor: picking ? 'crosshair' : '' }} />
}
