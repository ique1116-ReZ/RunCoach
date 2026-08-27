export type HomeBackground = 'contour' | 'dither'

const HOME_BACKGROUND_KEY = 'virtualcoach.homeBackground'
const LEGACY_HOME_BACKGROUND_KEY = 'runcoach.homeBackground'

export const isHomeBackground = (value: unknown): value is HomeBackground =>
  value === 'contour' || value === 'dither'

export const loadHomeBackground = (): HomeBackground => {
  const raw = localStorage.getItem(HOME_BACKGROUND_KEY) ?? localStorage.getItem(LEGACY_HOME_BACKGROUND_KEY)
  return isHomeBackground(raw) ? raw : 'contour'
}

export const saveHomeBackground = (value: HomeBackground) => {
  localStorage.setItem(HOME_BACKGROUND_KEY, value)
}
