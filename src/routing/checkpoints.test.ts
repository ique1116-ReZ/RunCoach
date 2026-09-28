import { describe, expect, it } from 'vitest'
import { addCheckpoint, removeCheckpoint, snapToRoute } from './checkpoints'
import type { RouteResult } from './ors'

const route: RouteResult = {
  kind: 'point_to_point',
  coordinates: [[121.5, 31.2], [121.51, 31.2], [121.52, 31.2]],
  distanceM: 1900
}

describe('骑行 CP 点', () => {
  it('将地图点击吸附到线段并按路线顺序编号', () => {
    const nearEnd = addCheckpoint(route, [121.518, 31.2002])
    const withBoth = addCheckpoint(nearEnd, [121.504, 31.2001])
    expect(withBoth.checkpoints?.map(cp => cp.name)).toEqual(['CP1', 'CP2'])
    expect(withBoth.checkpoints?.[0].coord[1]).toBeCloseTo(31.2, 6)
    expect(withBoth.checkpoints?.[0].alongM).toBeLessThan(withBoth.checkpoints![1].alongM)
    expect(removeCheckpoint(withBoth, 0).checkpoints?.[0].name).toBe('CP1')
  })

  it('距离路线太远时不添加', () => {
    expect(snapToRoute(route, [121.505, 31.2])?.offsetM).toBeCloseTo(0, 5)
    expect(() => addCheckpoint(route, [121.505, 31.21])).toThrow('路线附近')
  })
})
