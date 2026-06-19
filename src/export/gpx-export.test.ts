import { describe, it, expect } from 'vitest'
import { routeToGpx } from './gpx-export'
import { parseGpxFile } from '@runs/gpx'

const route = {
  kind: 'loop' as const,
  coordinates: [[121.5, 31.2], [121.51, 31.21], [121.5, 31.2]] as [number, number][],
  distanceM: 1500
}

describe('routeToGpx', () => {
  it('生成的 GPX 含全部坐标且 lon/lat 顺序正确', () => {
    const xml = routeToGpx(route, '测试环线')
    expect(xml).toContain('<gpx')
    expect(xml).toContain('lat="31.2"')
    expect(xml).toContain('lon="121.5"')
    expect(xml).toContain('测试环线')
  })

  it('可被自己的 gpx 解析器往返读取（点数一致）', () => {
    // routeToGpx 给每个点写入递增时间，使 parseGpxFile 能保留点
    const xml = routeToGpx(route, 'rt')
    const run = parseGpxFile(xml, 'rt.gpx')
    expect(run.points.length).toBe(3)
  })
})

describe('routeToGpx 高程', () => {
  it('有 elevations 时写 <ele>', () => {
    const xml = routeToGpx({ kind: 'loop', coordinates: [[121.5, 31.2], [121.51, 31.21]], distanceM: 1000, elevations: [4, 6.5] } as any, 'ele 路线')
    expect(xml).toContain('<ele>4</ele>')
    expect(xml).toContain('<ele>6.5</ele>')
  })
  it('无 elevations 时不写 <ele>', () => {
    const xml = routeToGpx({ kind: 'loop', coordinates: [[121.5, 31.2]], distanceM: 100 } as any, 'x')
    expect(xml).not.toContain('<ele>')
  })
})
