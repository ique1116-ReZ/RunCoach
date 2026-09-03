import { describe, expect, it } from 'vitest'

import { getWorkoutExercise } from './library'
import { filterWorkoutPlans, recommendWorkoutPlans, workoutPlans } from './plans'

describe('workoutPlans', () => {
  it('provides 50 unique, fully specified plans', () => {
    expect(workoutPlans).toHaveLength(50)
    expect(new Set(workoutPlans.map(plan => plan.id)).size).toBe(workoutPlans.length)

    for (const plan of workoutPlans) {
      expect(plan.exercises.length).toBeGreaterThanOrEqual(6)
      expect(plan.durationMinutes).toBeGreaterThanOrEqual(10)
      for (const item of plan.exercises) {
        expect(getWorkoutExercise(item.exerciseSlug), `${plan.id}: ${item.exerciseSlug}`).toBeTruthy()
        expect(item.sets).toBeGreaterThan(0)
        expect(item.restSeconds).toBeGreaterThanOrEqual(0)
        expect(item.target.length).toBeGreaterThan(0)
        expect(item.intensity).toMatch(/^RPE /)
      }
    }
  })

  it('covers every requested training family', () => {
    const focuses = new Set(workoutPlans.map(plan => plan.focus))
    expect(focuses).toEqual(new Set([
      'full_body', 'quads', 'posterior_chain', 'upper_body', 'core', 'mobility', 'conditioning'
    ]))
    expect(filterWorkoutPlans({ focus: 'full_body' })).toHaveLength(12)
    expect(filterWorkoutPlans({ focus: 'core' })).toHaveLength(8)
  })

  it('searches both plan copy and included exercise names', () => {
    expect(filterWorkoutPlans({ query: '睡前' }).map(plan => plan.id)).toContain('mobility-06')
    expect(filterWorkoutPlans({ query: 'trap-bar-deadlift' }).map(plan => plan.id)).toContain('full-body-09')
  })

  it('filters for level and available training setting', () => {
    const plans = filterWorkoutPlans({ level: 'beginner', setting: 'band' })
    expect(plans.length).toBeGreaterThan(0)
    expect(plans.every(plan => plan.level === 'beginner' && plan.setting === 'band')).toBe(true)
  })

  it('returns deterministic unique recommendations and avoids recent plans', () => {
    const recentPlanIds = ['full-body-01', 'full-body-02', 'full-body-03']
    const first = recommendWorkoutPlans({ focus: 'full_body', count: 5, recentPlanIds, seed: 'user-42-week-8' })
    const second = recommendWorkoutPlans({ focus: 'full_body', count: 5, recentPlanIds, seed: 'user-42-week-8' })

    expect(first.map(plan => plan.id)).toEqual(second.map(plan => plan.id))
    expect(new Set(first.map(plan => plan.id)).size).toBe(5)
    expect(first.every(plan => !recentPlanIds.includes(plan.id))).toBe(true)
  })
})
