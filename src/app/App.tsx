// src/app/App.tsx
import { useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { setRouteLine, setStartPin, setTrack } from '@/map/layers'
import { ChatDock } from '@/chat/ChatDock'
import { useChatAgent } from '@/chat/useChatAgent'
import { SettingsGear } from '@/settings/SettingsGear'
import type { ToolContext } from '@/agent/tools'
import type { RouteResult, LngLat } from '@/routing/ors'
import { routeToGpx } from '@/export/gpx-export'
import { loadConfig, type LlmConfig } from '@/llm/provider'
import type { Run } from '@runs/types'
import { parseGpxFile } from '@runs/gpx'
import { parseFitFile } from '@runs/fit'
import { parseJsonFile } from '@runs/json'
import { ReplayBar } from './ReplayBar'
import './styles.css'

type StartSource = 'current' | 'map' | 'place'

export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [docked, setDocked] = useState(false)
  const [startSource, setStartSource] = useState<StartSource>('current')
  const [startCoord, setStartCoord] = useState<LngLat | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [config, setConfig] = useState<LlmConfig | null>(loadConfig())
  const runs = useRef<Map<string, Run>>(new Map())

  const ctx: ToolContext = useMemo(() => ({
    runs: runs.current,
    onRoute: (r: RouteResult) => {
      setRoute(r)
      const map = mapRef.current
      if (map) {
        setRouteLine(map, r.coordinates)
        if (r.coordinates[0]) setStartPin(map, r.coordinates[0])
      }
    }
  }), [])

  const { turns, send } = useChatAgent({ config, ctx })

  const currentStartContext = () => {
    if (startCoord) return `用户选定起点坐标 ${JSON.stringify(startCoord)}`
    return '用户未指定起点，可视为当前位置（地图中心）'
  }

  const onSend = (text: string) => {
    if (!docked) setDocked(true)
    void send(text, currentStartContext())
  }

  const onUpload = async (file: File) => {
    if (!docked) setDocked(true)
    const text = file.name.endsWith('.fit') ? '' : await file.text()
    const parsed: Run = file.name.endsWith('.fit')
      ? await parseFitFile(await file.arrayBuffer(), file.name)
      : file.name.endsWith('.json')
        ? await parseJsonFile(text, file.name)
        : parseGpxFile(text, file.name)
    runs.current.set(parsed.id, parsed)
    setRun(parsed)
    const map = mapRef.current
    if (map) setTrack(map, parsed.points.map(p => [p.lon, p.lat] as LngLat))
    void send(`[上传训练] ${file.name}，请复盘`, `run_id=${parsed.id}`)
  }

  const onMapClick = (c: LngLat) => {
    if (startSource === 'map') {
      setStartCoord(c)
      if (mapRef.current) setStartPin(mapRef.current, c)
    }
  }

  const downloadGpx = () => {
    if (!route) return
    const blob = new Blob([routeToGpx(route, 'RunCoach 路线')], { type: 'application/gpx+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'runcoach-route.gpx'
    a.click()
  }

  return (
    <div className="app-root">
      <MapView onReady={m => { mapRef.current = m }} onMapClick={onMapClick} />

      <div className="top-right">
        <div className="start-seg">
          {(['current', 'map', 'place'] as StartSource[]).map(s => (
            <button key={s} className={startSource === s ? 'on' : ''} onClick={() => setStartSource(s)}>
              {s === 'current' ? '📍当前' : s === 'map' ? '🗺选点' : '🔎地名'}
            </button>
          ))}
        </div>
        <SettingsGear onSaved={setConfig} />
      </div>

      {route && (
        <div className="route-card">
          <h4>路线预览</h4>
          <div className="row"><span>实际距离</span><b>{(route.distanceM / 1000).toFixed(2)} km</b></div>
          {route.ascentM !== undefined && (
            <div className="row"><span>累计爬升</span><b>{Math.round(route.ascentM)} m</b></div>
          )}
          <div className="card-btns">
            <button onClick={() => onSend('换一条')}>换一条</button>
            <button className="primary" onClick={downloadGpx}>下载 GPX</button>
          </div>
        </div>
      )}

      {run && <ReplayBar run={run} map={mapRef.current} />}

      <ChatDock turns={turns} docked={docked} onSend={onSend} onUpload={onUpload} />
    </div>
  )
}
