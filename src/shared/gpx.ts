import { XMLParser } from 'fast-xml-parser'
import { Run, TrackPoint } from './types'
import { haversineMeters } from './geo'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'value'
})

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const safeNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

const safeTime = (value: unknown) => {
  if (!value) return undefined
  const time = Date.parse(String(value))
  return Number.isFinite(time) ? time : undefined
}

const extractHeartRate = (trkpt: any) => {
  const extensions = trkpt.extensions || trkpt['gpxtpx:TrackPointExtension']
  if (!extensions) return undefined
  if (extensions['gpxtpx:TrackPointExtension']) {
    return safeNumber(extensions['gpxtpx:TrackPointExtension']?.['gpxtpx:hr'])
  }
  return safeNumber(extensions?.['gpxtpx:hr'] ?? extensions?.hr)
}

export const parseGpxFile = (xml: string, sourcePath: string): Run => {
  const parsed = parser.parse(xml)
  const gpx = parsed.gpx ?? parsed
  const trks = toArray(gpx.trk)
  const trk = trks[0]
  const name = trk?.name?.value ?? trk?.name ?? 'Unnamed Run'

  const segments = toArray(trk?.trkseg)
  const points: TrackPoint[] = []

  for (const seg of segments) {
    const trkpts = toArray(seg?.trkpt)
    for (const trkpt of trkpts) {
      const lat = safeNumber(trkpt.lat)
      const lon = safeNumber(trkpt.lon)
      const time = safeTime(trkpt.time?.value ?? trkpt.time)
      const elevation = safeNumber(trkpt.ele?.value ?? trkpt.ele)
      if (lat === undefined || lon === undefined || time === undefined) continue
      const hr = extractHeartRate(trkpt)
      points.push({
        lat,
        lon,
        time,
        hr,
        elevation,
        metrics: {
          ...(hr !== undefined ? { heart_rate: hr } : {}),
          ...(elevation !== undefined ? { elevation } : {})
        },
        distFromStart: 0
      })
    }
  }

  points.sort((a, b) => a.time - b.time)

  let totalDistance = 0
  const cleaned: TrackPoint[] = []
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    const prev = cleaned[cleaned.length - 1]
    if (!prev) {
      cleaned.push(point)
      continue
    }
    if (point.time <= prev.time) continue
    const delta = haversineMeters(prev.lat, prev.lon, point.lat, point.lon)
    if (delta > 50 && (point.time - prev.time) < 2000) {
      continue
    }
    totalDistance += delta
    const speed = delta / ((point.time - prev.time) / 1000)
    cleaned.push({
      ...point,
      speed,
      metrics: {
        ...point.metrics,
        speed
      },
      distFromStart: totalDistance
    })
  }

  const first = cleaned[0]
  const last = cleaned[cleaned.length - 1]
  const totalTime = first && last ? last.time - first.time : 0

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    sourcePath,
    sourceType: 'gpx',
    points: cleaned,
    totalDistance,
    totalTime,
    metricKeys: ['speed', 'heart_rate', 'elevation'].filter(key =>
      cleaned.some(point => Number.isFinite(point.metrics[key]))
    ),
    summaryEntries: [],
    lapSummaries: [],
    aggregateMetrics: {}
  }
}
