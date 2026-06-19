// src/app/App.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { MapView } from '@/map/MapView'
import { setRouteLine, setStartPin, setTrack, fitToCoords } from '@/map/layers'
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
import { TerrainCard } from './TerrainCard'
import { StartPointCard } from './StartPointCard'
import { PinConfirm } from './PinConfirm'
import { ReplayBar } from './ReplayBar'
import './styles.css'

export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [docked, setDocked] = useState(false)
  const [startCoord, setStartCoord] = useState<LngLat | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [config, setConfig] = useState<LlmConfig | null>(loadConfig())
  const runs = useRef<Map<string, Run>>(new Map())

  // 引导卡片 / 选点状态
  const [terrainResolve, setTerrainResolve] = useState<((t: 'trail' | 'road' | null) => void) | null>(null)
  const [startResolve, setStartResolve] = useState<((c: LngLat | null) => void) | null>(null)
  const [picking, setPicking] = useState(false)
  const [pendingPin, setPendingPin] = useState<LngLat | null>(null)
  const [startMsg, setStartMsg] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setStartCoord([pos.coords.longitude, pos.coords.latitude]),
      () => { /* denied — keep fallback */ }
    )
  }, [])
  useEffect(() => {
    if (startCoord && mapReady && mapRef.current) mapRef.current.flyTo({ center: startCoord, zoom: 14 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady])

  const requestTerrain = () => new Promise<'trail' | 'road' | null>(resolve => setTerrainResolve(() => resolve))
  const requestStartPoint = () => new Promise<LngLat | null>(resolve => { setStartMsg(''); setStartResolve(() => resolve) })

  const ctx: ToolContext = useMemo(() => ({
    runs: runs.current,
    onRoute: (r: RouteResult) => {
      setRoute(r)
      const map = mapRef.current
      if (map) { setRouteLine(map, r.coordinates); if (r.coordinates[0]) setStartPin(map, r.coordinates[0]); fitToCoords(map, r.coordinates) }
    },
    requestTerrain,
    requestStartPoint
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const { turns, busy, send } = useChatAgent({ config, ctx })
  // 卡片/选点活跃时是“等用户操作”，不算 AI 在思考；只有真正等模型时才显示输入动画
  const cardActive = !!(terrainResolve || startResolve || picking)

  const currentStartContext = () => startCoord
    ? `已知当前定位坐标 ${JSON.stringify(startCoord)}（仅当用户明确要用当前位置/附近时直接用；否则起点未定，调 ask_start_point 让用户选）`
    : '当前定位不可用；起点未定，需要时调 ask_start_point 让用户选'

  const onSend = (text: string) => { if (!docked) setDocked(true); void send(text, currentStartContext()) }

  const onUpload = async (file: File) => {
    if (!docked) setDocked(true)
    const text = file.name.endsWith('.fit') ? '' : await file.text()
    const parsed: Run = file.name.endsWith('.fit')
      ? await parseFitFile(await file.arrayBuffer(), file.name)
      : file.name.endsWith('.json') ? await parseJsonFile(text, file.name) : parseGpxFile(text, file.name)
    runs.current.set(parsed.id, parsed)
    setRun(parsed)
    const map = mapRef.current
    if (map) { const t = parsed.points.map(p => [p.lon, p.lat] as LngLat); setTrack(map, t); fitToCoords(map, t) }
    void send(`[上传训练] ${file.name}，请复盘`, `run_id=${parsed.id}`)
  }

  const onMapClick = (c: LngLat) => {
    if (picking) { setPendingPin(c); if (mapRef.current) setStartPin(mapRef.current, c) }
  }

  // 卡片回调
  const pickTerrain = (t: 'trail' | 'road') => { terrainResolve?.(t); setTerrainResolve(null) }
  const cancelTerrain = () => { terrainResolve?.(null); setTerrainResolve(null) }

  const pickCurrent = () => {
    if (startCoord) { startResolve?.(startCoord); setStartResolve(null); return }
    if (!navigator.geolocation) { setStartMsg('定位不可用，请改用手动选点'); return }
    setStartMsg('正在定位…')
    navigator.geolocation.getCurrentPosition(
      pos => { const c: LngLat = [pos.coords.longitude, pos.coords.latitude]; setStartCoord(c); startResolve?.(c); setStartResolve(null) },
      () => setStartMsg('定位不可用，请改用手动选点')
    )
  }
  const pickManual = () => { setPicking(true) }      // 隐藏起点卡、进入选点；startResolve 保留
  const cancelStart = () => { startResolve?.(null); setStartResolve(null); setPicking(false); setPendingPin(null) }
  const confirmPin = () => { if (pendingPin) { startResolve?.(pendingPin); setStartResolve(null); setPicking(false); setPendingPin(null) } }
  const cancelPin = () => { setPendingPin(null) }    // 重新点

  const downloadGpx = () => {
    if (!route) return
    const blob = new Blob([routeToGpx(route, 'RunCoach 路线')], { type: 'application/gpx+xml' })
    const a = document.createElement('a'); const url = URL.createObjectURL(blob)
    a.href = url; a.download = 'runcoach-route.gpx'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="app-root">
      <MapView onReady={m => { mapRef.current = m; setMapReady(true) }} onMapClick={onMapClick} picking={picking} />

      <div className="top-right">
        <SettingsGear onSaved={setConfig} />
      </div>

      {terrainResolve && <TerrainCard onPick={pickTerrain} onCancel={cancelTerrain} />}
      {startResolve && !picking && <StartPointCard onCurrent={pickCurrent} onManual={pickManual} onCancel={cancelStart} message={startMsg} />}
      {picking && !pendingPin && (
        <div className="pin-confirm">
          <span>在地图上点选起点…</span>
          <button onClick={cancelStart}>✗ 取消</button>
        </div>
      )}
      {picking && pendingPin && <PinConfirm onConfirm={confirmPin} onCancel={cancelPin} />}

      {route && (
        <div className="route-card">
          <h4>路线预览</h4>
          <div className="row"><span>实际距离</span><b>{(route.distanceM / 1000).toFixed(2)} km</b></div>
          {route.ascentM !== undefined && <div className="row"><span>累计爬升</span><b>{Math.round(route.ascentM)} m</b></div>}
          <div className="card-btns">
            <button onClick={() => onSend('换一条')}>换一条</button>
            <button className="primary" onClick={downloadGpx}>下载 GPX</button>
          </div>
        </div>
      )}

      {run && <ReplayBar run={run} map={mapRef.current} />}

      <ChatDock turns={turns} docked={docked} thinking={busy && !cardActive} onSend={onSend} onUpload={onUpload} />
    </div>
  )
}
