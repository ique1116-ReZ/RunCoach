// src/map/MapView.tsx
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ensureLayers } from './layers'
import type { LngLat } from '@/routing/ors'

const maptilerKey = import.meta.env.VITE_MAPTILER_KEY
const styleUrl = maptilerKey
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`
  : 'https://tiles.openfreemap.org/styles/liberty'

export const MapView = ({ onReady, onMapClick, picking }: { onReady: (m: maplibregl.Map) => void; onMapClick: (c: LngLat) => void; picking?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 始终指向最新的 onMapClick，避免地图 click 监听只绑定挂载时的旧闭包（导致 picking 永远是 false）
  const clickRef = useRef(onMapClick)
  clickRef.current = onMapClick
  useEffect(() => {
    if (!ref.current || mapRef.current || !styleUrl) return
    try {
      const map = new maplibregl.Map({ container: ref.current, style: styleUrl, center: [121.47, 31.23], zoom: 13 })
      mapRef.current = map
      map.on('load', () => { setLoaded(true); ensureLayers(map); onReady(map) })
      map.on('error', e => setError(e.error?.message ?? '地图加载失败'))
      map.on('click', (e) => clickRef.current([e.lngLat.lng, e.lngLat.lat]))
      return () => { map.remove(); mapRef.current = null }
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }, [])
  return (
    <div className="map-shell">
      <div ref={ref} className="map-canvas" style={{ cursor: picking ? 'crosshair' : '' }} />
      {(!loaded || error) && (
        <div className={`map-status ${error ? 'error' : ''}`}>
          <div className="map-status-pulse" />
          <div>
            <strong>{error ? '地图暂不可用' : '正在加载地图'}</strong>
            <span>{error ? error : '准备路线、轨迹和回放图层…'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
