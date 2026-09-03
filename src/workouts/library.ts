import {
  exercises,
  getExercise as findExercise,
  searchExercises
} from '@bryllim/workout-guide'

import type {
  Exercise,
  ExerciseFrame,
  ExerciseSearchFilters,
  ExerciseType
} from '@bryllim/workout-guide'

const LOCAL_LIBRARY_DIRECTORY = 'vendor/workout-guide'

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

/** All 302 exercises, including metadata and the three frames for each exercise. */
export const workoutExercises = exercises

/** Find one exercise by its id (exercise-push-up) or slug (push-up). */
export const getWorkoutExercise = findExercise

/** Search by name, muscle, equipment, exercise type, or stretch status. */
export const searchWorkoutExercises = searchExercises

/**
 * Return the public URL for a locally bundled exercise frame.
 *
 * BASE_URL keeps the path valid both in local Vite development and when the
 * app is deployed below a subpath such as /RunCoach/ on GitHub Pages.
 */
export function getLocalWorkoutFrameUrl(
  idOrSlug: string,
  frameIndex: ExerciseFrame['index'],
  baseUrl = import.meta.env.BASE_URL
): string | null {
  const exercise = findExercise(idOrSlug)
  const frame = exercise?.frames.find(({ index }) => index === frameIndex)

  if (!frame) return null

  return `${withTrailingSlash(baseUrl)}${LOCAL_LIBRARY_DIRECTORY}/${frame.path}`
}

/** Return all three local frame URLs for an exercise. */
export function getLocalWorkoutFrameUrls(
  idOrSlug: string,
  baseUrl = import.meta.env.BASE_URL
): [string, string, string] | null {
  const exercise = findExercise(idOrSlug)

  if (!exercise) return null

  const root = `${withTrailingSlash(baseUrl)}${LOCAL_LIBRARY_DIRECTORY}/`
  return exercise.frames.map(({ path }) => `${root}${path}`) as [string, string, string]
}

/** Local compliance files that can be linked from the app's Legal/Credits UI. */
export function getWorkoutLicenseUrls(baseUrl = import.meta.env.BASE_URL) {
  const root = `${withTrailingSlash(baseUrl)}${LOCAL_LIBRARY_DIRECTORY}/`

  return {
    attribution: `${root}ATTRIBUTION.md`,
    assetLicense: `${root}LICENSE-ASSETS`,
    codeLicense: `${root}LICENSE`,
    licenseSummary: `${root}LICENSES.md`,
    manifest: `${root}manifest.json`
  } as const
}

export type {
  Exercise as WorkoutExercise,
  ExerciseFrame as WorkoutExerciseFrame,
  ExerciseSearchFilters as WorkoutExerciseSearchFilters,
  ExerciseType as WorkoutExerciseType
}
