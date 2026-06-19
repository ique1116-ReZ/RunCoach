import { describe, it, expect } from 'vitest'
import { parseGeocode } from './geocode'

describe('parseGeocode', () => {
  it('抽取 name 与 center', () => {
    const json = { features: [
      { text: '人民广场', center: [121.475, 31.229] },
      { text: '人民公园', center: [121.470, 31.232] }
    ] }
    const hits = parseGeocode(json)
    expect(hits).toEqual([
      { name: '人民广场', center: [121.475, 31.229] },
      { name: '人民公园', center: [121.470, 31.232] }
    ])
  })

  it('空结果返回空数组', () => {
    expect(parseGeocode({ features: [] })).toEqual([])
  })
})
