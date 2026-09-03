import type { WorkoutExercise, WorkoutExerciseType } from './library'

export const muscleLabels: Record<string, string> = {
  Adductors: '内收肌',
  Back: '背部',
  Biceps: '肱二头肌',
  Calves: '小腿',
  Chest: '胸部',
  Core: '核心',
  Forearms: '前臂',
  Glutes: '臀部',
  Grip: '握力',
  Hamstrings: '腘绳肌',
  Hips: '髋部',
  Lats: '背阔肌',
  Legs: '腿部',
  'Lower Back': '下背部',
  Mobility: '灵活性',
  'Posterior Chain': '后侧链',
  Quads: '股四头肌',
  'Rear Delts': '三角肌后束',
  Shoulders: '肩部',
  Triceps: '肱三头肌',
  'Upper Back': '上背部'
}

export const equipmentLabels: Record<string, string> = {
  Barbell: '杠铃',
  Bench: '训练凳',
  Bodyweight: '自重',
  Box: '跳箱',
  Cable: '绳索器械',
  Cardio: '有氧器械',
  Chair: '椅子',
  Doorway: '门框',
  Dumbbell: '哑铃',
  Kettlebell: '壶铃',
  Machine: '固定器械',
  Plate: '杠铃片',
  'Pull-up Bar': '单杠',
  'Resistance Band': '弹力带',
  'Stability Ball': '健身球',
  Towel: '毛巾',
  Wall: '墙面'
}

export const exerciseTypeLabels: Record<WorkoutExerciseType, string> = {
  assisted_bodyweight: '辅助自重',
  bodyweight_reps: '自重次数',
  distance_duration: '距离 / 时长',
  duration: '计时训练',
  weight_reps: '负重次数'
}

export const labelFor = (value: string, labels: Record<string, string>) => labels[value] ?? value

const searchableText = (exercise: WorkoutExercise) => [
  exercise.name,
  exercise.slug,
  exercise.primaryMuscle,
  ...exercise.secondaryMuscles,
  exercise.equipment,
  labelFor(exercise.primaryMuscle, muscleLabels),
  ...exercise.secondaryMuscles.map(muscle => labelFor(muscle, muscleLabels)),
  labelFor(exercise.equipment, equipmentLabels)
].join(' ').toLocaleLowerCase()

export type WorkoutLibraryFilters = {
  query?: string
  primaryMuscle?: string
  equipment?: string
  exerciseType?: WorkoutExerciseType | ''
}

export function filterWorkoutLibrary(
  exercises: readonly WorkoutExercise[],
  filters: WorkoutLibraryFilters
): WorkoutExercise[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? ''

  return exercises.filter(exercise => {
    if (query && !searchableText(exercise).includes(query)) return false
    if (filters.primaryMuscle && exercise.primaryMuscle !== filters.primaryMuscle) return false
    if (filters.equipment && exercise.equipment !== filters.equipment) return false
    if (filters.exerciseType && exercise.exerciseType !== filters.exerciseType) return false
    return true
  })
}
