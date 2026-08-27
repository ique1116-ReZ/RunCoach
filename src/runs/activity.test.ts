import { describe, expect, it } from 'vitest'
import { activityTypeLabel, detectActivityType } from './activity'

describe('detectActivityType', () => {
  it('识别 FIT 常见的跑步和骑行运动名称', () => {
    expect(detectActivityType('road_cycling')).toBe('cycling')
    expect(detectActivityType('mountain-biking')).toBe('cycling')
    expect(detectActivityType('trail_running')).toBe('running')
  })

  it('可从文件名和中文名称识别，无法判断时保留 unknown', () => {
    expect(detectActivityType('周末骑行.gpx')).toBe('cycling')
    expect(detectActivityType('Morning Run')).toBe('running')
    expect(detectActivityType('activity.fit')).toBe('unknown')
    expect(activityTypeLabel('unknown')).toBe('运动')
  })
})
