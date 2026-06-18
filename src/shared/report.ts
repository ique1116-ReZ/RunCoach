import type { Run, SummaryEntry } from './types'

const metricLabels: Record<string, { label: string; unit?: string; decimals?: number }> = {
  pace: { label: '配速', unit: '/km' },
  speed: { label: '速度', unit: 'm/s', decimals: 2 },
  heart_rate: { label: '心率', unit: 'bpm', decimals: 0 },
  elevation: { label: '海拔', unit: 'm', decimals: 0 },
  power: { label: '功率', unit: 'W', decimals: 0 },
  cadence: { label: '步频', unit: 'rpm', decimals: 0 },
  temperature: { label: '温度', unit: '°C', decimals: 1 },
  grade: { label: '坡度', unit: '%', decimals: 1 },
  vertical_speed: { label: '垂直速度', unit: 'm/s', decimals: 2 },
  vertical_oscillation: { label: '垂直振幅', unit: 'mm', decimals: 0 },
  vertical_ratio: { label: '垂直比', unit: '%', decimals: 1 },
  stride_length: { label: '步幅', unit: 'm', decimals: 2 }
}

const metricPriority = [
  'pace',
  'heart_rate',
  'elevation',
  'power',
  'cadence',
  'temperature',
  'grade',
  'vertical_speed',
  'vertical_oscillation',
  'vertical_ratio',
  'stride_length',
  'speed'
]

const chartColors = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#ec4899',
  '#22c55e'
]

const compareColors = {
  a: '#2563eb',
  b: '#f97316'
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const humanizeKey = (key: string) =>
  metricLabels[key]?.label ??
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())

const unitForKey = (key: string) => metricLabels[key]?.unit ?? ''
const decimalsForKey = (key: string) => metricLabels[key]?.decimals ?? 2

const formatNumber = (value: number, key?: string) => {
  const decimals = key ? decimalsForKey(key) : 2
  return value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

const formatPace = (speed: number) => {
  if (!Number.isFinite(speed) || speed <= 0) return '--'
  const totalSeconds = 1000 / speed
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
}

const average = (values: number[]) => {
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const maxValue = (values: number[]) => {
  if (values.length === 0) return undefined
  return Math.max(...values)
}

const minValue = (values: number[]) => {
  if (values.length === 0) return undefined
  return Math.min(...values)
}

const getMetricValues = (run: Run, key: string) => {
  if (key === 'pace') {
    return run.points
      .map(point => {
        const speed = point.speed ?? point.metrics.speed
        if (!Number.isFinite(speed) || (speed as number) <= 0) return null
        return { x: point.distFromStart / 1000, y: 1000 / (speed as number) / 60 }
      })
      .filter(Boolean) as Array<{ x: number; y: number }>
  }

  return run.points
    .map(point => {
      const value =
        key === 'heart_rate'
          ? point.hr
          : key === 'speed'
            ? point.speed
            : key === 'elevation'
              ? point.elevation
              : point.metrics[key]
      if (!Number.isFinite(value)) return null
      return { x: point.distFromStart / 1000, y: value as number }
    })
    .filter(Boolean) as Array<{ x: number; y: number }>
}

const getOrderedMetricKeys = (run: Run) => {
  const base = run.metricKeys.filter(key => getMetricValues(run, key).length > 1)
  const keys = base.includes('speed') ? base.filter(key => key !== 'speed') : base
  if (run.points.some(point => Number.isFinite(point.speed) && (point.speed as number) > 0)) {
    keys.unshift('pace')
  }
  const unique = Array.from(new Set(keys))
  return unique.sort((a, b) => {
    const pa = metricPriority.indexOf(a)
    const pb = metricPriority.indexOf(b)
    if (pa === -1 && pb === -1) return a.localeCompare(b)
    if (pa === -1) return 1
    if (pb === -1) return -1
    return pa - pb
  })
}

const buildChartSvg = (series: Array<{ x: number; y: number }>, key: string, color: string) => {
  const width = 1120
  const height = 260
  const paddingLeft = 52
  const paddingRight = 16
  const paddingTop = 18
  const paddingBottom = 34

  if (series.length < 2) {
    return `<div class="chart-empty">该指标没有足够的数据点</div>`
  }

  const xValues = series.map(point => point.x)
  const yValues = series.map(point => point.y)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)
  const xRange = Math.max(maxX - minX, 0.001)
  const yRange = Math.max(maxY - minY, 0.001)

  const toX = (value: number) =>
    paddingLeft + ((value - minX) / xRange) * (width - paddingLeft - paddingRight)
  const toY = (value: number) =>
    height - paddingBottom - ((value - minY) / yRange) * (height - paddingTop - paddingBottom)

  const path = series
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.x).toFixed(2)},${toY(point.y).toFixed(2)}`)
    .join(' ')

  const horizontalGuides = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    const y = paddingTop + ratio * (height - paddingTop - paddingBottom)
    return `<line x1="${paddingLeft}" x2="${width - paddingRight}" y1="${y}" y2="${y}" class="chart-grid" />`
  }).join('')

  const ticks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    const value = maxY - ratio * (maxY - minY)
    const y = paddingTop + ratio * (height - paddingTop - paddingBottom)
    return `<text x="8" y="${y + 4}" class="chart-axis">${escapeHtml(formatNumber(value, key))}${escapeHtml(unitForKey(key))}</text>`
  }).join('')

  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    const value = minX + ratio * (maxX - minX)
    const x = paddingLeft + ratio * (width - paddingLeft - paddingRight)
    return `<text x="${x}" y="${height - 8}" text-anchor="middle" class="chart-axis">${escapeHtml(formatNumber(value))} km</text>`
  }).join('')

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" preserveAspectRatio="none">
      ${horizontalGuides}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${ticks}
      ${xTicks}
    </svg>
  `
}

const buildComparisonChartSvg = (
  seriesA: Array<{ x: number; y: number }>,
  seriesB: Array<{ x: number; y: number }>,
  key: string
) => {
  const width = 1120
  const height = 280
  const paddingLeft = 52
  const paddingRight = 18
  const paddingTop = 18
  const paddingBottom = 34
  const all = [...seriesA, ...seriesB]
  if (all.length < 2) {
    return `<div class="chart-empty">该指标在两条训练里都缺少足够数据</div>`
  }

  const xValues = all.map(point => point.x)
  const yValues = all.map(point => point.y)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)
  const xRange = Math.max(maxX - minX, 0.001)
  const yRange = Math.max(maxY - minY, 0.001)

  const toX = (value: number) =>
    paddingLeft + ((value - minX) / xRange) * (width - paddingLeft - paddingRight)
  const toY = (value: number) =>
    height - paddingBottom - ((value - minY) / yRange) * (height - paddingTop - paddingBottom)

  const pathFor = (series: Array<{ x: number; y: number }>) =>
    series.map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.x).toFixed(2)},${toY(point.y).toFixed(2)}`).join(' ')

  const horizontalGuides = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    const y = paddingTop + ratio * (height - paddingTop - paddingBottom)
    return `<line x1="${paddingLeft}" x2="${width - paddingRight}" y1="${y}" y2="${y}" class="chart-grid" />`
  }).join('')

  const ticks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    const value = maxY - ratio * (maxY - minY)
    const y = paddingTop + ratio * (height - paddingTop - paddingBottom)
    return `<text x="8" y="${y + 4}" class="chart-axis">${escapeHtml(formatNumber(value, key))}${escapeHtml(unitForKey(key))}</text>`
  }).join('')

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" preserveAspectRatio="none">
      ${horizontalGuides}
      ${seriesA.length > 1 ? `<path d="${pathFor(seriesA)}" fill="none" stroke="${compareColors.a}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
      ${seriesB.length > 1 ? `<path d="${pathFor(seriesB)}" fill="none" stroke="${compareColors.b}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
      ${ticks}
    </svg>
  `
}

const buildRouteSvg = (run: Run, gradientId = 'routeGradient') => {
  const width = 1120
  const height = 420
  const padding = 24
  if (run.points.length < 2) {
    return '<div class="chart-empty">轨迹点不足，无法生成路线图。</div>'
  }

  const lats = run.points.map(point => point.lat)
  const lons = run.points.map(point => point.lon)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const lonRange = Math.max(maxLon - minLon, 0.000001)
  const latRange = Math.max(maxLat - minLat, 0.000001)
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2
  const scale = Math.min(innerWidth / lonRange, innerHeight / latRange)
  const offsetX = (width - lonRange * scale) / 2
  const offsetY = (height - latRange * scale) / 2

  const toX = (lon: number) => offsetX + (lon - minLon) * scale
  const toY = (lat: number) => height - offsetY - (lat - minLat) * scale

  const path = run.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.lon).toFixed(2)},${toY(point.lat).toFixed(2)}`)
    .join(' ')

  const start = run.points[0]
  const end = run.points[run.points.length - 1]
  const startX = toX(start.lon).toFixed(2)
  const startY = toY(start.lat).toFixed(2)
  const endX = toX(end.lon).toFixed(2)
  const endY = toY(end.lat).toFixed(2)

  return `
    <svg viewBox="0 0 ${width} ${height}" class="route-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2563eb" />
          <stop offset="100%" stop-color="#f97316" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="rgba(15, 23, 42, 0.04)" />
      <path d="${path}" fill="none" stroke="url(#${gradientId})" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${startX}" cy="${startY}" r="10" fill="#10b981" stroke="#ffffff" stroke-width="4" />
      <circle cx="${endX}" cy="${endY}" r="10" fill="#ef4444" stroke="#ffffff" stroke-width="4" />
      <text x="${Number(startX) + 14}" y="${Number(startY) - 10}" class="route-label">Start</text>
      <text x="${Number(endX) + 14}" y="${Number(endY) - 10}" class="route-label">Finish</text>
    </svg>
  `
}

const buildCombinedRouteSvg = (runA: Run, runB: Run) => {
  const width = 1120
  const height = 460
  const padding = 26
  const allPoints = [...runA.points, ...runB.points]
  if (allPoints.length < 2) {
    return '<div class="chart-empty">轨迹点不足，无法生成对比路线图。</div>'
  }

  const lats = allPoints.map(point => point.lat)
  const lons = allPoints.map(point => point.lon)
  const minLat = minValue(lats) as number
  const maxLat = maxValue(lats) as number
  const minLon = minValue(lons) as number
  const maxLon = maxValue(lons) as number
  const lonRange = Math.max(maxLon - minLon, 0.000001)
  const latRange = Math.max(maxLat - minLat, 0.000001)
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2
  const scale = Math.min(innerWidth / lonRange, innerHeight / latRange)
  const offsetX = (width - lonRange * scale) / 2
  const offsetY = (height - latRange * scale) / 2

  const toX = (lon: number) => offsetX + (lon - minLon) * scale
  const toY = (lat: number) => height - offsetY - (lat - minLat) * scale
  const pathFor = (run: Run) =>
    run.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.lon).toFixed(2)},${toY(point.lat).toFixed(2)}`).join(' ')

  const startA = runA.points[0]
  const endA = runA.points[runA.points.length - 1]
  const startB = runB.points[0]
  const endB = runB.points[runB.points.length - 1]

  return `
    <svg viewBox="0 0 ${width} ${height}" class="route-svg" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="rgba(15, 23, 42, 0.04)" />
      <path d="${pathFor(runA)}" fill="none" stroke="${compareColors.a}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${pathFor(runB)}" fill="none" stroke="${compareColors.b}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />
      <circle cx="${toX(startA.lon).toFixed(2)}" cy="${toY(startA.lat).toFixed(2)}" r="8" fill="${compareColors.a}" stroke="#fff" stroke-width="3" />
      <circle cx="${toX(endA.lon).toFixed(2)}" cy="${toY(endA.lat).toFixed(2)}" r="8" fill="${compareColors.a}" stroke="#fff" stroke-width="3" opacity="0.65" />
      <circle cx="${toX(startB.lon).toFixed(2)}" cy="${toY(startB.lat).toFixed(2)}" r="8" fill="${compareColors.b}" stroke="#fff" stroke-width="3" />
      <circle cx="${toX(endB.lon).toFixed(2)}" cy="${toY(endB.lat).toFixed(2)}" r="8" fill="${compareColors.b}" stroke="#fff" stroke-width="3" opacity="0.65" />
    </svg>
  `
}

const buildSummaryTable = (entries: SummaryEntry[]) => {
  if (entries.length === 0) {
    return '<div class="empty-block">这个 FIT 文件没有额外的 session / file summary 标量字段。</div>'
  }

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>字段</th>
          <th>值</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(entry => `
          <tr>
            <td>${escapeHtml(humanizeKey(entry.key))}</td>
            <td>${escapeHtml(String(entry.value))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

const buildLapTable = (run: Run) => {
  if (run.lapSummaries.length === 0) {
    return '<div class="empty-block">这个 FIT 文件没有 lap 信息。</div>'
  }

  const keys = Array.from(new Set(run.lapSummaries.flatMap(lap => lap.entries.map(entry => entry.key))))

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Lap</th>
          ${keys.map(key => `<th>${escapeHtml(humanizeKey(key))}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${run.lapSummaries.map(lap => {
          const values = new Map(lap.entries.map(entry => [entry.key, entry.value]))
          return `
            <tr>
              <td>${lap.index}</td>
              ${keys.map(key => `<td>${escapeHtml(String(values.get(key) ?? ''))}</td>`).join('')}
            </tr>
          `
        }).join('')}
      </tbody>
    </table>
  `
}

const aggregateMetricFor = (run: Run, metricKey: 'heart_rate' | 'power' | 'cadence') => {
  if (metricKey === 'heart_rate') return run.aggregateMetrics.avgHeartRate
  if (metricKey === 'power') return run.aggregateMetrics.avgPower
  if (metricKey === 'cadence') return run.aggregateMetrics.avgCadence
  return undefined
}

const kpiValueFor = (run: Run, metricKey: string, formatter: (value: number) => string) => {
  if (metricKey === 'heart_rate' || metricKey === 'power' || metricKey === 'cadence') {
    const aggregateValue = aggregateMetricFor(run, metricKey)
    if (aggregateValue !== undefined) return formatter(aggregateValue)
  }
  const values = getMetricValues(run, metricKey).map(point => point.y)
  const result = average(values)
  return result !== undefined ? formatter(result) : '--'
}

const buildKpis = (run: Run) => {
  const elevationValues = getMetricValues(run, 'elevation').map(point => point.y)
  const computedClimb = elevationValues.length > 1
    ? elevationValues.slice(1).reduce((sum, value, index) => sum + Math.max(value - elevationValues[index], 0), 0)
    : undefined
  const climb = run.aggregateMetrics.totalAscent ?? computedClimb

  const cards = [
    { label: '总距离', value: `${formatNumber(run.totalDistance / 1000)} km` },
    { label: '总时长', value: formatDuration(run.totalTime) },
    { label: '平均配速', value: run.totalTime > 0 && run.totalDistance > 0 ? formatPace(run.totalDistance / (run.totalTime / 1000)) : '--' },
    { label: '平均心率', value: kpiValueFor(run, 'heart_rate', value => `${formatNumber(value, 'heart_rate')} bpm`) },
    { label: '平均功率', value: kpiValueFor(run, 'power', value => `${formatNumber(value, 'power')} W`) },
    { label: '平均步频', value: kpiValueFor(run, 'cadence', value => `${formatNumber(value, 'cadence')} rpm`) },
    { label: '累计爬升', value: climb !== undefined ? `${formatNumber(climb, 'elevation')} m` : '--' }
  ]

  return cards.map(card => `
    <div class="kpi-card panel">
      <div class="kpi-label">${escapeHtml(card.label)}</div>
      <div class="kpi-value">${escapeHtml(card.value)}</div>
    </div>
  `).join('')
}

const buildComparisonKpiRows = (runA: Run, runB: Run) => {
  const rows = [
    ['总距离', `${formatNumber(runA.totalDistance / 1000)} km`, `${formatNumber(runB.totalDistance / 1000)} km`],
    ['总时长', formatDuration(runA.totalTime), formatDuration(runB.totalTime)],
    ['平均配速', runA.totalTime > 0 && runA.totalDistance > 0 ? formatPace(runA.totalDistance / (runA.totalTime / 1000)) : '--', runB.totalTime > 0 && runB.totalDistance > 0 ? formatPace(runB.totalDistance / (runB.totalTime / 1000)) : '--'],
    ['平均心率', kpiValueFor(runA, 'heart_rate', value => `${formatNumber(value, 'heart_rate')} bpm`), kpiValueFor(runB, 'heart_rate', value => `${formatNumber(value, 'heart_rate')} bpm`)],
    ['平均功率', kpiValueFor(runA, 'power', value => `${formatNumber(value, 'power')} W`), kpiValueFor(runB, 'power', value => `${formatNumber(value, 'power')} W`)],
    ['平均步频', kpiValueFor(runA, 'cadence', value => `${formatNumber(value, 'cadence')} rpm`), kpiValueFor(runB, 'cadence', value => `${formatNumber(value, 'cadence')} rpm`)]
  ]

  return rows.map(([label, valueA, valueB]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(valueA)}</td>
      <td>${escapeHtml(valueB)}</td>
    </tr>
  `).join('')
}

const baseStyles = `
  :root {
    color-scheme: light;
    --panel: rgba(255, 255, 255, 0.78);
    --panel-strong: rgba(15, 23, 42, 0.9);
    --text: #172033;
    --muted: #5f6b7b;
    --line: rgba(148, 163, 184, 0.22);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Avenir Next", "PingFang SC", "Helvetica Neue", sans-serif;
    color: var(--text);
    background:
      radial-gradient(circle at top left, rgba(245, 158, 11, 0.22), transparent 28%),
      radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 32%),
      linear-gradient(180deg, #faf6ef 0%, #f4efe7 42%, #eef2f7 100%);
  }
  .page {
    width: min(1400px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 28px 0 48px;
  }
  .hero {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 18px;
    margin-bottom: 18px;
  }
  .panel {
    background: var(--panel);
    border: 1px solid rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 24px;
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  }
  .hero-main { padding: 26px 28px; }
  .hero-side {
    padding: 20px 22px;
    background: var(--panel-strong);
    color: #f8fafc;
  }
  .eyebrow {
    display: inline-flex;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(217, 119, 6, 0.12);
    color: #9a5a04;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h1 {
    margin: 14px 0 8px;
    font-size: clamp(32px, 5vw, 54px);
    line-height: 0.98;
  }
  .hero-main p { margin: 0; max-width: 52ch; color: var(--muted); line-height: 1.6; }
  .meta-list { display: grid; gap: 14px; }
  .meta-item { border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 12px; }
  .meta-item:last-child { border-bottom: 0; padding-bottom: 0; }
  .meta-label { font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.08em; }
  .meta-value { margin-top: 6px; font-size: 17px; word-break: break-word; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 18px; }
  .kpi-card { padding: 18px 20px; }
  .kpi-label { color: var(--muted); font-size: 13px; margin-bottom: 10px; }
  .kpi-value { font-size: 28px; font-weight: 700; }
  .section-title { margin: 28px 0 14px; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .route-panel, .chart-panel, .data-block { padding: 18px; margin-bottom: 16px; }
  .route-svg, .chart-svg { width: 100%; display: block; }
  .chart-svg { height: 260px; }
  .route-label { fill: #172033; font-size: 14px; font-weight: 700; }
  .route-meta { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
  .route-meta-item { padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,0.56); border: 1px solid rgba(148,163,184,0.15); }
  .route-meta-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .route-meta-value { font-size: 16px; font-weight: 700; }
  .chart-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .chart-header h3 { margin: 0 0 6px; font-size: 20px; }
  .chart-header p { margin: 0; color: var(--muted); font-size: 13px; }
  .chart-meta { display: grid; gap: 6px; font-size: 13px; color: var(--muted); text-align: right; }
  .chart-grid { stroke: var(--line); stroke-width: 1; }
  .chart-axis { fill: #64748b; font-size: 11px; }
  .chart-empty, .empty-block { padding: 28px 16px; border-radius: 18px; border: 1px dashed rgba(148,163,184,0.5); color: var(--muted); text-align: center; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th, .data-table td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  .data-table th { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .compare-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .compare-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .compare-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  @media (max-width: 920px) {
    .page { width: min(100vw - 20px, 1400px); padding-top: 16px; }
    .hero, .compare-grid { grid-template-columns: 1fr; }
    .chart-header { flex-direction: column; }
    .chart-meta { text-align: left; }
  }
`

export const buildTrainingDashboardHtml = (run: Run) => {
  const orderedMetricKeys = getOrderedMetricKeys(run)
  const charts = orderedMetricKeys.map((key, index) => {
    const color = chartColors[index % chartColors.length]
    const values = getMetricValues(run, key)
    const onlyValues = values.map(point => point.y)
    const avg = average(onlyValues)
    const peak = maxValue(onlyValues)
    return `
      <section class="panel chart-panel">
        <div class="chart-header">
          <div>
            <h3>${escapeHtml(humanizeKey(key))}</h3>
            <p>横轴按距离展开，覆盖整场训练轨迹。</p>
          </div>
          <div class="chart-meta">
            <span>均值 ${avg !== undefined ? `${escapeHtml(formatNumber(avg, key))}${escapeHtml(unitForKey(key))}` : '--'}</span>
            <span>峰值 ${peak !== undefined ? `${escapeHtml(formatNumber(peak, key))}${escapeHtml(unitForKey(key))}` : '--'}</span>
          </div>
        </div>
        ${buildChartSvg(values, key, color)}
      </section>
    `
  }).join('')

  const startPoint = run.points[0]
  const endPoint = run.points[run.points.length - 1]

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(run.name)} 训练看板</title>
    <style>${baseStyles}</style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <div class="panel hero-main">
          <span class="eyebrow">Run Replay HTML Dashboard</span>
          <h1>${escapeHtml(run.name)}</h1>
          <p>这个页面是从 ${escapeHtml(run.sourcePath)} 自动导出的整场训练看板，按距离展开展示全程指标曲线，并把 FIT 文件里的 session / lap 标量信息一起带出。</p>
        </div>
        <aside class="panel hero-side">
          <div class="meta-list">
            <div class="meta-item"><div class="meta-label">源文件</div><div class="meta-value">${escapeHtml(run.sourcePath)}</div></div>
            <div class="meta-item"><div class="meta-label">导出时间</div><div class="meta-value">${escapeHtml(new Date().toLocaleString('zh-CN'))}</div></div>
            <div class="meta-item"><div class="meta-label">数据点</div><div class="meta-value">${run.points.length}</div></div>
            <div class="meta-item"><div class="meta-label">图表数量</div><div class="meta-value">${orderedMetricKeys.length}</div></div>
          </div>
        </aside>
      </section>

      <section class="kpi-grid">${buildKpis(run)}</section>

      <div class="section-title">路线概览</div>
      <section class="panel route-panel">
        ${buildRouteSvg(run)}
        <div class="route-meta">
          <div class="route-meta-item"><div class="route-meta-label">起点</div><div class="route-meta-value">${escapeHtml(startPoint ? `${formatNumber(startPoint.lat)} , ${formatNumber(startPoint.lon)}` : '--')}</div></div>
          <div class="route-meta-item"><div class="route-meta-label">终点</div><div class="route-meta-value">${escapeHtml(endPoint ? `${formatNumber(endPoint.lat)} , ${formatNumber(endPoint.lon)}` : '--')}</div></div>
          <div class="route-meta-item"><div class="route-meta-label">轨迹点数量</div><div class="route-meta-value">${run.points.length}</div></div>
        </div>
      </section>

      <div class="section-title">训练曲线</div>
      ${charts || '<div class="panel data-block"><div class="empty-block">这个文件里没有足够的连续数值指标来生成图表。</div></div>'}

      <div class="section-title">FIT 汇总字段</div>
      <section class="panel data-block">${buildSummaryTable(run.summaryEntries)}</section>

      <div class="section-title">Lap 明细</div>
      <section class="panel data-block">${buildLapTable(run)}</section>
    </div>
  </body>
</html>`
}

export const buildComparisonDashboardHtml = (runA: Run, runB: Run) => {
  const metricKeys = Array.from(new Set([...getOrderedMetricKeys(runA), ...getOrderedMetricKeys(runB)]))
  const charts = metricKeys.map(key => {
    const valuesA = getMetricValues(runA, key)
    const valuesB = getMetricValues(runB, key)
    const avgA = average(valuesA.map(point => point.y))
    const avgB = average(valuesB.map(point => point.y))
    return `
      <section class="panel chart-panel">
        <div class="chart-header">
          <div>
            <h3>${escapeHtml(humanizeKey(key))}</h3>
            <p>同一指标下对比两条训练的整场走势。</p>
          </div>
          <div class="chart-meta">
            <span class="compare-pill"><span class="compare-dot" style="background:${compareColors.a}"></span>${escapeHtml(runA.name)} ${avgA !== undefined ? `${escapeHtml(formatNumber(avgA, key))}${escapeHtml(unitForKey(key))}` : '--'}</span>
            <span class="compare-pill"><span class="compare-dot" style="background:${compareColors.b}"></span>${escapeHtml(runB.name)} ${avgB !== undefined ? `${escapeHtml(formatNumber(avgB, key))}${escapeHtml(unitForKey(key))}` : '--'}</span>
          </div>
        </div>
        ${buildComparisonChartSvg(valuesA, valuesB, key)}
      </section>
    `
  }).join('')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(runA.name)} vs ${escapeHtml(runB.name)} 对比看板</title>
    <style>${baseStyles}</style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <div class="panel hero-main">
          <span class="eyebrow">Run Replay Compare Dashboard</span>
          <h1>${escapeHtml(runA.name)} vs ${escapeHtml(runB.name)}</h1>
          <p>这是一份双人训练对比看板，把两条训练的路线、关键 KPI 和整场指标曲线放在同一份 HTML 里，方便横向比较节奏、心率、海拔、功率和其他 FIT 指标。</p>
        </div>
        <aside class="panel hero-side">
          <div class="meta-list">
            <div class="meta-item"><div class="meta-label">跑者 A 文件</div><div class="meta-value">${escapeHtml(runA.sourcePath)}</div></div>
            <div class="meta-item"><div class="meta-label">跑者 B 文件</div><div class="meta-value">${escapeHtml(runB.sourcePath)}</div></div>
            <div class="meta-item"><div class="meta-label">导出时间</div><div class="meta-value">${escapeHtml(new Date().toLocaleString('zh-CN'))}</div></div>
          </div>
        </aside>
      </section>

      <div class="section-title">KPI 对比</div>
      <section class="panel data-block">
        <table class="data-table">
          <thead>
            <tr>
              <th>指标</th>
              <th>${escapeHtml(runA.name)}</th>
              <th>${escapeHtml(runB.name)}</th>
            </tr>
          </thead>
          <tbody>${buildComparisonKpiRows(runA, runB)}</tbody>
        </table>
      </section>

      <div class="section-title">路线对比</div>
      <section class="panel route-panel">
        ${buildCombinedRouteSvg(runA, runB)}
        <div class="route-meta">
          <div class="route-meta-item"><div class="route-meta-label">${escapeHtml(runA.name)}</div><div class="route-meta-value"><span class="compare-dot" style="background:${compareColors.a}"></span> ${formatNumber(runA.totalDistance / 1000)} km / ${formatDuration(runA.totalTime)}</div></div>
          <div class="route-meta-item"><div class="route-meta-label">${escapeHtml(runB.name)}</div><div class="route-meta-value"><span class="compare-dot" style="background:${compareColors.b}"></span> ${formatNumber(runB.totalDistance / 1000)} km / ${formatDuration(runB.totalTime)}</div></div>
        </div>
      </section>

      <div class="section-title">整场曲线对比</div>
      ${charts || '<div class="panel data-block"><div class="empty-block">两条训练都没有足够的连续数值指标来生成对比图表。</div></div>'}

      <div class="section-title">单人汇总补充</div>
      <section class="compare-grid">
        <div class="panel data-block">
          <h3>${escapeHtml(runA.name)}</h3>
          ${buildSummaryTable(runA.summaryEntries)}
        </div>
        <div class="panel data-block">
          <h3>${escapeHtml(runB.name)}</h3>
          ${buildSummaryTable(runB.summaryEntries)}
        </div>
      </section>
    </div>
  </body>
</html>`
}

export const downloadTrainingDashboardHtml = (run: Run) => {
  const html = buildTrainingDashboardHtml(run)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const safeName = run.sourcePath.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-')
  anchor.href = url
  anchor.download = `${safeName || 'training-dashboard'}.html`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadComparisonDashboardHtml = (runA: Run, runB: Run) => {
  const html = buildComparisonDashboardHtml(runA, runB)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const safeNameA = runA.sourcePath.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-')
  const safeNameB = runB.sourcePath.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-')
  anchor.href = url
  anchor.download = `${safeNameA || 'run-a'}-vs-${safeNameB || 'run-b'}.html`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const applyInlineMarkdown = (text: string) => {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/&lt;br\s*\/?&gt;/gi, '<br />')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

const markdownToHtml = (markdown: string) => {
  const normalizedMarkdown = markdown
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
  const lines = normalizedMarkdown.split('\n')
  const html: string[] = []
  let paragraph: string[] = []
  let bulletItems: string[] = []
  let numberedItems: string[] = []
  let quoteLines: string[] = []
  let tableRows: string[][] = []

  const splitTableRow = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim())

  const isTableLine = (line: string) => /^\|.+\|$/.test(line)

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    html.push(`<p>${applyInlineMarkdown(paragraph.join('<br />'))}</p>`)
    paragraph = []
  }

  const flushBullets = () => {
    if (bulletItems.length === 0) return
    html.push(`<ul>${bulletItems.map(item => `<li>${applyInlineMarkdown(item)}</li>`).join('')}</ul>`)
    bulletItems = []
  }

  const flushNumbered = () => {
    if (numberedItems.length === 0) return
    html.push(`<ol>${numberedItems.map(item => `<li>${applyInlineMarkdown(item)}</li>`).join('')}</ol>`)
    numberedItems = []
  }

  const flushQuotes = () => {
    if (quoteLines.length === 0) return
    html.push(`<blockquote>${quoteLines.map(line => `<p>${applyInlineMarkdown(line)}</p>`).join('')}</blockquote>`)
    quoteLines = []
  }

  const flushTable = () => {
    if (tableRows.length < 2) {
      if (tableRows.length === 1) {
        paragraph.push(`| ${tableRows[0].join(' | ')} |`)
      }
      tableRows = []
      return
    }

    const [headerRow, separatorRow, ...bodyRows] = tableRows
    if (!separatorRow.every(cell => /^:?-{3,}:?$/.test(cell))) {
      paragraph.push(...tableRows.map(row => `| ${row.join(' | ')} |`))
      tableRows = []
      return
    }

    html.push(`
      <div class="table-wrap">
        <table class="analysis-table">
          <thead>
            <tr>${headerRow.map(cell => `<th>${applyInlineMarkdown(cell)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${bodyRows.map(row => `<tr>${row.map(cell => `<td>${applyInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `)
    tableRows = []
  }

  const flushAll = () => {
    flushParagraph()
    flushBullets()
    flushNumbered()
    flushQuotes()
    flushTable()
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushAll()
      continue
    }

    if (isTableLine(line)) {
      flushParagraph()
      flushBullets()
      flushNumbered()
      flushQuotes()
      tableRows.push(splitTableRow(line))
      continue
    }

    if (tableRows.length > 0) {
      flushTable()
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushAll()
      const level = Math.min(headingMatch[1].length, 6)
      html.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`)
      continue
    }

    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
      flushAll()
      html.push('<hr />')
      continue
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/)
    if (bulletMatch) {
      flushParagraph()
      flushNumbered()
      flushQuotes()
      bulletItems.push(bulletMatch[1])
      continue
    }

    const numberedMatch = line.match(/^\d+\.\s+(.*)$/)
    if (numberedMatch) {
      flushParagraph()
      flushBullets()
      flushQuotes()
      numberedItems.push(numberedMatch[1])
      continue
    }

    const quoteMatch = line.match(/^>\s?(.*)$/)
    if (quoteMatch) {
      flushParagraph()
      flushBullets()
      flushNumbered()
      quoteLines.push(quoteMatch[1])
      continue
    }

    flushBullets()
    flushNumbered()
    flushQuotes()
    paragraph.push(line)
  }

  flushAll()
  return html.join('\n')
}

const plainTextFromMarkdown = (markdown: string) =>
  markdown
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^\|/gm, '')
    .replace(/\|$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim()

export const buildLlmAnalysisReportHtml = (options: {
  title: string
  subject: string
  markdown: string
  providerLabel: string
  model: string
}) => {
  const { title, subject, markdown, providerLabel, model } = options
  const plainText = plainTextFromMarkdown(markdown)
  const summary =
    plainText.match(/一句话总结[:：]?\s*([^\n]+)/)?.[1]?.trim() ??
    plainText.split('\n').find(line => line.trim()) ??
    '已生成训练分析，请查看下方完整报告。'
  const htmlBody = markdownToHtml(markdown)

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --paper: rgba(255, 255, 255, 0.84);
        --ink: #172033;
        --muted: #5f6b7b;
        --line: rgba(148, 163, 184, 0.24);
        --accent: #1d4ed8;
        --accent-warm: #ea580c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "PingFang SC", "Helvetica Neue", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(251, 191, 36, 0.24), transparent 28%),
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.18), transparent 34%),
          linear-gradient(180deg, #f8f4ec 0%, #eef2f7 100%);
      }
      .page {
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 56px;
      }
      .hero, .content {
        background: var(--paper);
        border: 1px solid rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(12px);
        border-radius: 28px;
        box-shadow: 0 22px 56px rgba(15, 23, 42, 0.08);
      }
      .hero {
        padding: 28px;
        margin-bottom: 18px;
      }
      .eyebrow {
        display: inline-block;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 10px;
      }
      h1 {
        margin: 0;
        font-size: clamp(30px, 4vw, 46px);
        line-height: 1.05;
        letter-spacing: -0.04em;
      }
      .hero p {
        margin: 12px 0 0;
        color: var(--muted);
        line-height: 1.7;
        font-size: 15px;
      }
      .summary-card {
        margin-top: 22px;
        padding: 18px 20px;
        border-radius: 22px;
        background: linear-gradient(135deg, rgba(29, 78, 216, 0.08), rgba(234, 88, 12, 0.08));
        border: 1px solid rgba(59, 130, 246, 0.12);
      }
      .summary-label {
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 8px;
      }
      .summary-text {
        font-size: 20px;
        line-height: 1.6;
        font-weight: 600;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 18px;
      }
      .meta-card {
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.6);
        border: 1px solid var(--line);
      }
      .meta-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .meta-value {
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
      }
      .content {
        padding: 28px;
      }
      .analysis-body {
        font-size: 16px;
        line-height: 1.85;
      }
      .analysis-body h1,
      .analysis-body h2,
      .analysis-body h3,
      .analysis-body h4,
      .analysis-body h5,
      .analysis-body h6 {
        margin: 28px 0 12px;
        line-height: 1.25;
        letter-spacing: -0.02em;
      }
      .analysis-body h1 { font-size: 30px; }
      .analysis-body h2 {
        font-size: 24px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--line);
      }
      .analysis-body h3 { font-size: 20px; }
      .analysis-body p {
        margin: 12px 0;
        color: #233044;
      }
      .analysis-body ul,
      .analysis-body ol {
        margin: 12px 0 12px 20px;
        padding: 0;
      }
      .table-wrap {
        margin: 18px 0;
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.68);
      }
      .analysis-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 560px;
      }
      .analysis-table th,
      .analysis-table td {
        padding: 14px 16px;
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid var(--line);
        line-height: 1.7;
      }
      .analysis-table th {
        background: rgba(29, 78, 216, 0.06);
        font-size: 13px;
        color: #1e3a8a;
        font-weight: 700;
      }
      .analysis-table tr:last-child td {
        border-bottom: 0;
      }
      .analysis-body li {
        margin: 8px 0;
        padding-left: 4px;
      }
      .analysis-body strong {
        color: #0f172a;
      }
      .analysis-body code {
        font-family: "SFMono-Regular", "Menlo", monospace;
        font-size: 0.92em;
        background: rgba(15, 23, 42, 0.06);
        padding: 2px 6px;
        border-radius: 8px;
      }
      .analysis-body blockquote {
        margin: 16px 0;
        padding: 2px 0 2px 16px;
        border-left: 4px solid rgba(29, 78, 216, 0.22);
        color: #334155;
      }
      .analysis-body hr {
        border: 0;
        border-top: 1px solid var(--line);
        margin: 24px 0;
      }
      @media (max-width: 760px) {
        .page {
          width: min(100vw, calc(100vw - 20px));
          padding: 10px 0 24px;
        }
        .hero, .content {
          border-radius: 22px;
          padding: 20px;
        }
        .meta-grid {
          grid-template-columns: 1fr;
        }
        .summary-text {
          font-size: 18px;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <span class="eyebrow">Run Replay Analysis Report</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subject)}</p>
        <div class="summary-card">
          <div class="summary-label">一句话结论</div>
          <div class="summary-text">${escapeHtml(summary)}</div>
        </div>
        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-label">分析引擎</div>
            <div class="meta-value">${escapeHtml(providerLabel)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">模型</div>
            <div class="meta-value">${escapeHtml(model || '--')}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">生成时间</div>
            <div class="meta-value">${escapeHtml(new Date().toLocaleString('zh-CN'))}</div>
          </div>
        </div>
      </section>
      <section class="content">
        <div class="analysis-body">${htmlBody}</div>
      </section>
    </div>
  </body>
</html>`
}
