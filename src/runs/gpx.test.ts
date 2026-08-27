import { describe, expect, it } from 'vitest'
import { parseGpxFile } from './gpx'

describe('parseGpxFile', () => {
  it('识别骑行类型并读取 GPX 骑行扩展指标', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
        <trk>
          <name>Morning Ride</name>
          <type>cycling</type>
          <trkseg>
            <trkpt lat="31.2000" lon="121.5000">
              <ele>10</ele><time>2026-08-27T00:00:00Z</time><power>180</power>
              <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>135</gpxtpx:hr><gpxtpx:cad>84</gpxtpx:cad><gpxtpx:atemp>25</gpxtpx:atemp></gpxtpx:TrackPointExtension></extensions>
            </trkpt>
            <trkpt lat="31.2001" lon="121.5001">
              <ele>12</ele><time>2026-08-27T00:00:05Z</time>
              <extensions><power>220</power><gpxtpx:TrackPointExtension><gpxtpx:hr>145</gpxtpx:hr><gpxtpx:cad>90</gpxtpx:cad><gpxtpx:atemp>26</gpxtpx:atemp></gpxtpx:TrackPointExtension></extensions>
            </trkpt>
          </trkseg>
        </trk>
      </gpx>`

    const activity = parseGpxFile(xml, 'ride.gpx')

    expect(activity.activityType).toBe('cycling')
    expect(activity.metricKeys).toEqual(expect.arrayContaining(['speed', 'heart_rate', 'power', 'cadence', 'temperature']))
    expect(activity.points[0]).toMatchObject({ hr: 135, power: 180, cadence: 84, temperature: 25 })
    expect(activity.points[1]).toMatchObject({ hr: 145, power: 220, cadence: 90, temperature: 26 })
  })
})
