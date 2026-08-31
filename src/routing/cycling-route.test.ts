import { describe, expect, it } from 'vitest'
import { recommendCyclingRoute, type CourseRouteRequest } from './cycling-route'
import type { RouteResult } from './ors'

const course: CourseRouteRequest = {
  courseName: '稳态偏吃力 3×12 分钟',
  courseType: 'sweet_spot',
  durationMin: 75,
  targetDistanceKm: 32,
  clearRoadKm: 5,
  mainBlockKm: 18,
  maxGradePct: 4,
  feasibility: 'long_flat'
}

const route = (distanceM: number, ascentM?: number): RouteResult => ({
  kind: 'loop',
  coordinates: [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
  distanceM,
  ascentM
})

describe('recommendCyclingRoute', () => {
  it('国内使用高德并保留用户选择的单线往返', async () => {
    const shapes: string[] = []
    const result = await recommendCyclingRoute([116.4, 39.9], course, 'out_and_back', {
      amapRoute: async (seed, shape) => {
        shapes.push(shape)
        return route(32000 + seed)
      }
    })
    expect(result.provider).toBe('amap')
    expect(result.recommendation?.routeShape).toBe('out_and_back')
    expect(result.recommendation?.clearRoadKm).toBe(5)
    expect(shapes).toEqual(['out_and_back', 'out_and_back'])
  })

  it('海外使用 ORS，并在平缓课程中优先更少爬升的候选', async () => {
    const result = await recommendCyclingRoute([-0.12, 51.5], course, 'loop', {
      orsRoute: async seed => seed === 11 ? route(32500, 80) : route(32000, 500)
    })
    expect(result.provider).toBe('ors')
    expect(result.ascentM).toBe(80)
    expect(result.recommendation?.routeShape).toBe('loop')
  })

  it('淘汰有明显回头路的环线并继续生成候选', async () => {
    const seeds: number[] = []
    const result = await recommendCyclingRoute([116.4, 39.9], course, 'loop', {
      amapRoute: async seed => {
        seeds.push(seed)
        if (seed === 1) {
          return {
            kind: 'loop',
            coordinates: [[116.4, 39.9], [116.41, 39.9], [116.42, 39.9], [116.41, 39.9], [116.4, 39.9]],
            distanceM: 3400
          }
        }
        return route(32000 + seed)
      }
    })
    expect(result.provider).toBe('amap')
    expect(seeds).toEqual([1, 11, 29])
  })

  it('换一条路线时使用新的候选种子', async () => {
    const seeds: number[] = []
    await recommendCyclingRoute([116.4, 39.9], course, 'out_and_back', {
      variant: 1,
      amapRoute: async seed => {
        seeds.push(seed)
        return route(32000)
      }
    })
    expect(seeds).toEqual([98, 108])
  })
})
