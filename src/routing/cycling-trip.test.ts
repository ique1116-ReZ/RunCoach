import { describe, expect, it } from 'vitest'
import { geocodeAmapPlace, resolveAmapPoi, searchAmapPois } from './cycling-trip'
import { wgs84ToGcj02 } from './amap'

describe('geocodeAmapPlace', () => {
  it('使用高德地点搜索并把 GCJ-02 坐标转成地图坐标', async () => {
    let requested = ''
    const result = await geocodeAmapPlace('上海市人民广场', 'test-key', async input => {
      requested = String(input)
      return new Response(JSON.stringify({ status: '1', geocodes: [{ formatted_address: '上海市黄浦区人民广场', location: '121.473700,31.230400' }] }))
    })
    const url = new URL(requested)
    expect(url.pathname).toBe('/v3/geocode/geo')
    expect(url.searchParams.get('address')).toBe('上海市人民广场')
    expect(result.name).toContain('人民广场')
    const restored = wgs84ToGcj02(result.coord)
    expect(restored[0]).toBeCloseTo(121.4737, 5)
    expect(restored[1]).toBeCloseTo(31.2304, 5)
  })

  it('地点找不到时提示补充详细地址', async () => {
    await expect(geocodeAmapPlace('模糊地点', 'test-key', async () =>
      new Response(JSON.stringify({ status: '1', geocodes: [] }))
    )).rejects.toThrow('请补充城市')
  })
})

describe('POI 联想和确认', () => {
  it('返回带区域和地址的 POI，并把坐标转为地图坐标', async () => {
    let requested = ''
    const hits = await searchAmapPois('人民广场', 'test-key', { request: async input => {
      requested = String(input)
      return new Response(JSON.stringify({ status: '1', tips: [
        { id: 'poi-1', name: '人民广场', district: '上海市黄浦区', address: '人民大道', location: '121.473700,31.230400' },
        { id: 'busline', name: '人民广场线', location: [] }
      ] }))
    } })
    const url = new URL(requested)
    expect(url.pathname).toBe('/v3/assistant/inputtips')
    expect(url.searchParams.get('datatype')).toBe('poi')
    expect(hits).toHaveLength(1)
    expect(hits[0].district).toBe('上海市黄浦区')
    expect(wgs84ToGcj02(hits[0].coord)[0]).toBeCloseTo(121.4737, 5)
  })

  it('唯一完全匹配可直接使用，同名多个地点要求选择', async () => {
    const one = async () => [{ id: '1', name: '世纪公园', district: '上海市浦东新区', address: '', coord: [121.5, 31.2] as [number, number] }]
    expect((await resolveAmapPoi('世纪公园', 'key', one)).name).toContain('上海市浦东新区')
    const multiple = async () => [
      { id: '1', name: '人民广场', district: '上海市', address: '', coord: [121.5, 31.2] as [number, number] },
      { id: '2', name: '人民广场', district: '南京市', address: '', coord: [118.8, 32.1] as [number, number] }
    ]
    await expect(resolveAmapPoi('人民广场', 'key', multiple)).rejects.toThrow('下拉列表')
  })
})
