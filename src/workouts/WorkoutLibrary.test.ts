import { describe, expect, it } from 'vitest'

import { workoutExercises } from './library'
import { filterWorkoutLibrary } from './catalog'

describe('filterWorkoutLibrary', () => {
  it('searches canonical English names', () => {
    const results = filterWorkoutLibrary(workoutExercises, { query: 'push-up' })

    expect(results.some(exercise => exercise.slug === 'push-up')).toBe(true)
  })

  it('searches translated muscle labels', () => {
    const results = filterWorkoutLibrary(workoutExercises, { query: '胸部' })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every(exercise => (
      exercise.primaryMuscle === 'Chest' || exercise.secondaryMuscles.includes('Chest')
    ))).toBe(true)
  })

  it('combines muscle, equipment, and type filters', () => {
    const results = filterWorkoutLibrary(workoutExercises, {
      primaryMuscle: 'Chest',
      equipment: 'Bodyweight',
      exerciseType: 'bodyweight_reps'
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every(exercise => (
      exercise.primaryMuscle === 'Chest'
      && exercise.equipment === 'Bodyweight'
      && exercise.exerciseType === 'bodyweight_reps'
    ))).toBe(true)
  })
})
