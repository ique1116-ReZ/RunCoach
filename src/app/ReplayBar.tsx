// src/app/ReplayBar.tsx
import { useState, useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import type { Run } from '@runs/types'
import { sampleAtDistance } from '@runs/align'
import { setRunnerMarker } from '@/map/layers'
import type { LngLat } from '@/routing/ors'

export const ReplayBar = ({ run, map }: { run: Run; map: maplibregl.Map | null }) => {
  const [pct, setPct] = useState(0)
  const dist = run.totalDistance * pct
  const s = sampleAtDistance(run, dist)
  useEffect(() => {
    if (s && map) setRunnerMarker(map, [s.lon, s.lat] as LngLat)
  }, [s?.lon, s?.lat, map])
  const pace = s?.speed
    ? `${Math.floor((1000 / s.speed) / 60)}:${String(Math.round((1000 / s.speed) % 60)).padStart(2, '0')}/km`
    : '--'
  return (
    <div className="replay-bar">
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={pct}
        onChange={e => setPct(Number(e.target.value))}
      />
      <div className="replay-live">
        <span>{(dist / 1000).toFixed(2)} km</span>
        <span>配速 {pace}</span>
        <span>心率 {s?.hr !== undefined ? Math.round(s.hr) : '--'}</span>
      </div>
    </div>
  )
}
