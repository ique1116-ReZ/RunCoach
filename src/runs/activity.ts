import type { ActivityType } from './types'

const cyclingPattern = /(?:\b(?:bike|biking|bicycle|cycle|cycling|cyclist|ride|riding)\b|骑行|自行车|单车)/i
const runningPattern = /(?:\b(?:jog|jogging|run|running|trail run|trail running)\b|跑步|慢跑|越野跑)/i

const asSearchText = (values: unknown[]) => values
  .filter(value => typeof value === 'string' || typeof value === 'number')
  .map(value => String(value).replace(/[_-]+/g, ' '))
  .join(' ')

export const detectActivityType = (...values: unknown[]): ActivityType => {
  const text = asSearchText(values)
  if (cyclingPattern.test(text)) return 'cycling'
  if (runningPattern.test(text)) return 'running'
  return 'unknown'
}

export const activityTypeLabel = (activityType: ActivityType) => {
  if (activityType === 'cycling') return '骑行'
  if (activityType === 'running') return '跑步'
  return '运动'
}
