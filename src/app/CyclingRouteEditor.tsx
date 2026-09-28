import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { planCyclingTrip, searchAmapPois, type Place, type PoiSuggestion } from '@/routing/cycling-trip'
import type { LngLat, RouteResult } from '@/routing/ors'

export function CyclingRouteEditor({ map, route, onSave, onClose }: {
  map: maplibregl.Map
  route: RouteResult
  onSave: (routes: RouteResult[]) => void
  onClose: () => void
}) {
  const [points, setPoints] = useState<Place[]>(() => [
    { name: route.cyclingTrip!.originName, coord: route.coordinates[0] },
    ...(route.cyclingTrip!.viaPoints ?? []),
    { name: route.cyclingTrip!.destinationName, coord: route.coordinates.at(-1)! }
  ])
  const [insertAfter, setInsertAfter] = useState(points.length - 2)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viaQuery, setViaQuery] = useState('')
  const [viaSuggestions, setViaSuggestions] = useState<PoiSuggestion[]>([])
  const [viaSearching, setViaSearching] = useState(false)
  const active = useRef(false)
  const saving = useRef(false)

  useEffect(() => {
    if (viaQuery.trim().length < 2 || busy) { setViaSuggestions([]); setViaSearching(false); return }
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => {
      setViaSearching(true)
      void searchAmapPois(viaQuery, undefined, { signal: controller.signal })
        .then(results => { if (!controller.signal.aborted) setViaSuggestions(results) })
        .catch(() => { if (!controller.signal.aborted) setViaSuggestions([]) })
        .finally(() => { if (!controller.signal.aborted) setViaSearching(false) })
    }, 250)
    return () => { globalThis.clearTimeout(timer); controller.abort() }
  }, [viaQuery, busy])

  useEffect(() => {
    active.current = true
    map.setLayoutProperty('start-halo', 'visibility', 'none')
    map.setLayoutProperty('start-dot', 'visibility', 'none')
    return () => {
      active.current = false
      map.setLayoutProperty('start-halo', 'visibility', 'visible')
      map.setLayoutProperty('start-dot', 'visibility', 'visible')
    }
  }, [map, route])

  useEffect(() => {
    const markers = points.map((point, index) => {
      const label = index === 0 ? '起' : index === points.length - 1 ? '终' : `途${index}`
      const element = document.createElement('div')
      element.className = `cycling-edit-pin ${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'via'}`
      element.textContent = label
      element.title = `${point.name}（拖拽调整）`
      element.setAttribute('aria-label', element.title)
      element.addEventListener('click', event => event.stopPropagation())
      const marker = new maplibregl.Marker({ element, draggable: !busy })
        .setLngLat(point.coord).addTo(map)
      marker.on('dragend', () => {
        const position = marker.getLngLat()
        const coord: LngLat = [position.lng, position.lat]
        setPoints(current => current.map((item, i) => i === index
          ? { name: `${label}点 · ${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}`, coord }
          : item))
        setError('')
      })
      return marker
    })
    return () => { markers.forEach(marker => marker.remove()) }
  }, [map, points, busy])

  useEffect(() => {
    if (!adding || busy) return
    const canvas = map.getCanvas()
    const previousCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    const click = (event: maplibregl.MapMouseEvent) => {
      const coord: LngLat = [event.lngLat.lng, event.lngLat.lat]
      setPoints(current => [
        ...current.slice(0, insertAfter + 1),
        { name: `地图途经点 · ${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}`, coord },
        ...current.slice(insertAfter + 1)
      ])
      setInsertAfter(value => value + 1)
      setAdding(false)
      setError('')
    }
    map.on('click', click)
    return () => { map.off('click', click); canvas.style.cursor = previousCursor }
  }, [map, adding, busy, insertAfter])

  const save = async () => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setAdding(false)
    setError('')
    try {
      const results = await planCyclingTrip(points[0], points.at(-1)!, points.slice(1, -1), route.cyclingTrip!.greenwayPreferred)
      if (!results.length) throw new Error('没有找到可骑行路线，请调整途经点后重试')
      if (active.current) onSave(results)
    } catch (cause) {
      if (active.current) setError(String((cause as Error)?.message ?? cause))
    } finally {
      saving.current = false
      if (active.current) setBusy(false)
    }
  }

  const addPlace = (suggestion: PoiSuggestion) => {
    const coord: LngLat = suggestion.coord
    const place: Place = { name: [suggestion.name, suggestion.district].filter(Boolean).join(' · '), coord }
    setPoints(current => [
      ...current.slice(0, insertAfter + 1), place, ...current.slice(insertAfter + 1)
    ])
    setInsertAfter(value => value + 1)
    setViaQuery('')
    setViaSuggestions([])
    setError('')
  }

  return <div className="route-card cycling-route-editor" role="dialog" aria-label="微调骑行路线">
    <div className="route-card-head"><h4>微调骑行路线</h4></div>
    <p className="route-preview-hint">拖拽地图上的起点、终点或途经点。可在绿道入口、出口补点，引导路线经过绿道。</p>
    <div className="cycling-edit-points">
      {points.map((point, index) => <div className="cycling-checkpoint-row" key={index}>
        <span>{index === 0 ? '起点' : index === points.length - 1 ? '终点' : `途${index}`} · {point.name}</span>
        {index > 0 && index < points.length - 1 && <button type="button" disabled={busy} onClick={() => {
          setPoints(current => current.filter((_, i) => i !== index))
          setInsertAfter(value => Math.max(0, value >= index ? value - 1 : value))
          setAdding(false)
        }}>删除</button>}
      </div>)}
    </div>
    <label className="cycling-edit-insert">新途经点插入位置
      <select value={insertAfter} disabled={busy || adding} onChange={event => setInsertAfter(Number(event.target.value))}>
        {points.slice(0, -1).map((_, index) => <option key={index} value={index}>{index === 0 ? '起点' : `途${index}`}之后</option>)}
      </select>
    </label>
    <label className="cycling-planner-field cycling-edit-via-search">搜索并添加途经点
      <input value={viaQuery} disabled={busy} autoComplete="off" placeholder="如：滨海公园、沿江绿道入口" onChange={event => setViaQuery(event.target.value)} />
    </label>
    {viaSearching && <small className="cycling-poi-feedback">正在搜索地点…</small>}
    {viaSuggestions.length > 0 && <div className="cycling-poi-suggestions cycling-edit-suggestions" role="listbox" aria-label="途经点候选地点">
      {viaSuggestions.slice(0, 6).map((item, index) => <button type="button" role="option" key={`${item.id}-${index}`} onClick={() => addPlace(item)}>
        <strong>{item.name}</strong><small>{item.district} {item.address}</small>
      </button>)}
    </div>}
    <button type="button" disabled={busy} onClick={() => setAdding(value => !value)}>{adding ? '取消选点' : '在地图上添加途经点'}</button>
    <p className="route-preview-hint" role="status">{busy ? '正在按调整后的点重新计算骑行路线…' : adding ? '点击地图上的绿道位置，添加途经点。' : '蓝线为调整前路线；调整好后点击“应用并重新计算”。原路线保留在历史中。'}</p>
    {!!route.checkpoints?.length && <p className="route-preview-hint">新路线需重新标注 CP 点。</p>}
    {error && <p className="cycling-planner-error" role="alert">{error}</p>}
    <div className="card-btns">
      <button type="button" onClick={onClose}>取消</button>
      <button type="button" className="primary" disabled={busy} onClick={() => { void save() }}>{busy ? '计算中…' : '应用并重新计算'}</button>
    </div>
  </div>
}
