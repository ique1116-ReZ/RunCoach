import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getLocalWorkoutFrameUrl,
  getLocalWorkoutFrameUrls,
  getWorkoutExercise,
  searchWorkoutExercises,
  workoutExercises
} from './library'

describe('local workout library', () => {
  it('exposes the complete catalog', () => {
    expect(workoutExercises).toHaveLength(302)
    expect(getWorkoutExercise('push-up')?.frames).toHaveLength(3)
  })

  it('builds URLs that work under the GitHub Pages base path', () => {
    expect(getLocalWorkoutFrameUrl('push-up', 1, '/RunCoach/')).toBe(
      '/RunCoach/vendor/workout-guide/assets/push-up/frame-1.png'
    )
    expect(getLocalWorkoutFrameUrls('push-up', '/RunCoach')).toEqual([
      '/RunCoach/vendor/workout-guide/assets/push-up/frame-1.png',
      '/RunCoach/vendor/workout-guide/assets/push-up/frame-2.png',
      '/RunCoach/vendor/workout-guide/assets/push-up/frame-3.png'
    ])
  })

  it('returns only matching exercises when filters are supplied', () => {
    const results = searchWorkoutExercises('chest', { equipment: 'Bodyweight' })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every(({ equipment }) => equipment === 'Bodyweight')).toBe(true)
  })

  it('returns null for an unknown exercise', () => {
    expect(getLocalWorkoutFrameUrl('not-a-real-exercise', 1, '/')).toBeNull()
    expect(getLocalWorkoutFrameUrls('not-a-real-exercise', '/')).toBeNull()
  })

  it('points at a locally copied asset', () => {
    const url = getLocalWorkoutFrameUrl('push-up', 1, '/')

    expect(url).not.toBeNull()
    expect(existsSync(join(process.cwd(), 'public', url!))).toBe(true)
  })
})
