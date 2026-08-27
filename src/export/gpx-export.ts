import type { RouteResult } from '@/routing/ors'
import { APP_NAME } from '@/app/brand'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const routeToGpx = (route: RouteResult, name = `${APP_NAME} Route`): string => {
  const start = Date.now()
  const pts = route.coordinates
    .map(([lon, lat], i) => {
      const time = new Date(start + i * 2000).toISOString()
      const ele = route.elevations?.[i]
      const eleTag = ele !== undefined && Number.isFinite(ele) ? `<ele>${ele}</ele>` : ''
      return `      <trkpt lat="${lat}" lon="${lon}">${eleTag}<time>${time}</time></trkpt>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${APP_NAME}" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`
}
