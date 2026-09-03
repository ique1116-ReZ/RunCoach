import { getWorkoutExercise } from './library'

export type WorkoutPlanFocus =
  | 'full_body'
  | 'quads'
  | 'posterior_chain'
  | 'upper_body'
  | 'core'
  | 'mobility'
  | 'conditioning'

export type WorkoutPlanLevel = 'beginner' | 'intermediate'
export type WorkoutPlanSetting = 'bodyweight' | 'minimal' | 'dumbbell' | 'band' | 'full_gym'
export type WorkoutPlanPhase = 'warmup' | 'main' | 'accessory' | 'cooldown'

export type WorkoutPlanExercise = {
  exerciseSlug: string
  phase: WorkoutPlanPhase
  sets: number
  target: string
  restSeconds: number
  intensity: string
  note?: string
}

export type WorkoutPlan = {
  id: string
  name: string
  focus: WorkoutPlanFocus
  level: WorkoutPlanLevel
  setting: WorkoutPlanSetting
  durationMinutes: number
  summary: string
  exercises: WorkoutPlanExercise[]
}

export const workoutPlanFocusLabels: Record<WorkoutPlanFocus, string> = {
  full_body: '全身',
  quads: '大腿前侧',
  posterior_chain: '臀腿后侧',
  upper_body: '上肢',
  core: '核心',
  mobility: '舒展恢复',
  conditioning: '体能循环'
}

export const workoutPlanLevelLabels: Record<WorkoutPlanLevel, string> = {
  beginner: '入门',
  intermediate: '进阶'
}

export const workoutPlanSettingLabels: Record<WorkoutPlanSetting, string> = {
  bodyweight: '纯徒手',
  minimal: '居家简易',
  dumbbell: '哑铃',
  band: '弹力带',
  full_gym: '健身房'
}

export const workoutPlanPhaseLabels: Record<WorkoutPlanPhase, string> = {
  warmup: '热身',
  main: '主训练',
  accessory: '辅助',
  cooldown: '整理'
}

const warm = (exerciseSlug: string, target = '每侧 30 秒', sets = 1): WorkoutPlanExercise => ({
  exerciseSlug, phase: 'warmup', sets, target, restSeconds: 15, intensity: 'RPE 3–4'
})
const main = (
  exerciseSlug: string,
  target = '8–12 次',
  sets = 3,
  restSeconds = 90,
  intensity = 'RPE 7–8',
  note?: string
): WorkoutPlanExercise => ({ exerciseSlug, phase: 'main', sets, target, restSeconds, intensity, note })
const accessory = (
  exerciseSlug: string,
  target = '10–15 次',
  sets = 2,
  restSeconds = 60,
  intensity = 'RPE 6–8',
  note?: string
): WorkoutPlanExercise => ({ exerciseSlug, phase: 'accessory', sets, target, restSeconds, intensity, note })
const timed = (
  exerciseSlug: string,
  target = '30 秒',
  sets = 3,
  restSeconds = 45,
  intensity = 'RPE 6–7',
  phase: WorkoutPlanPhase = 'accessory'
): WorkoutPlanExercise => ({ exerciseSlug, phase, sets, target, restSeconds, intensity })
const cool = (exerciseSlug: string, target = '45 秒', sets = 1): WorkoutPlanExercise => ({
  exerciseSlug, phase: 'cooldown', sets, target, restSeconds: 15, intensity: 'RPE 2–3'
})

/**
 * 49 hand-curated templates built from the local 302-exercise catalog.
 * The order within each plan is intentional: preparation, larger multi-joint
 * movements, accessories/core, then down-regulation where appropriate.
 */
export const workoutPlans: readonly WorkoutPlan[] = [
  {
    id: 'full-body-01', name: '全身训练 01 · 基础力量', focus: 'full_body', level: 'beginner', setting: 'full_gym', durationMinutes: 48,
    summary: '深蹲、水平推拉与髋铰链的经典全身组合。',
    exercises: [warm('worlds-greatest-stretch'), main('squat', '8–10 次'), main('bench-press', '8–10 次'), main('seated-row', '10–12 次'), accessory('romanian-deadlift', '10 次'), accessory('pallof-press', '每侧 10–12 次'), cool('childs-pose')]
  },
  {
    id: 'full-body-02', name: '全身训练 02 · 哑铃均衡', focus: 'full_body', level: 'beginner', setting: 'dumbbell', durationMinutes: 45,
    summary: '一对哑铃完成下肢、胸背和负重行走。',
    exercises: [warm('arm-circles', '前后各 30 秒'), main('goblet-squat'), main('dumbbell-bench-press'), main('one-arm-dumbbell-row', '每侧 10 次'), accessory('dumbbell-romanian-deadlift'), timed('farmer-carry', '40 秒'), cool('hamstring-stretch')]
  },
  {
    id: 'full-body-03', name: '全身训练 03 · 徒手起步', focus: 'full_body', level: 'beginner', setting: 'bodyweight', durationMinutes: 32,
    summary: '低门槛徒手版本，优先建立动作控制。',
    exercises: [warm('cat-cow-stretch', '45 秒'), main('bodyweight-squat', '12–15 次'), main('incline-push-up', '8–12 次'), main('doorway-row', '8–12 次'), accessory('glute-bridge', '12–15 次'), accessory('dead-bug', '每侧 8–10 次'), cool('childs-pose')]
  },
  {
    id: 'full-body-04', name: '全身训练 04 · 壶铃动力', focus: 'full_body', level: 'intermediate', setting: 'minimal', durationMinutes: 40,
    summary: '壶铃摆动串联蹲、推、拉与躯干稳定。',
    exercises: [warm('leg-swings-stretch', '每侧 30 秒'), main('kettlebell-swing', '12–15 次', 4, 75), main('goblet-squat', '10–12 次'), main('push-up', '8–15 次'), main('towel-row', '10–15 次'), accessory('bird-dog', '每侧 10 次'), cool('kneeling-hip-flexor-stretch')]
  },
  {
    id: 'full-body-05', name: '全身训练 05 · 器械稳健', focus: 'full_body', level: 'beginner', setting: 'full_gym', durationMinutes: 46,
    summary: '固定器械降低稳定要求，适合熟悉发力路径。',
    exercises: [warm('treadmill-incline-walk', '5 分钟'), main('leg-press'), main('machine-chest-press'), main('machine-row'), accessory('seated-leg-curl'), accessory('machine-shoulder-press'), timed('cable-pallof-hold', '每侧 25 秒'), cool('standing-quad-stretch')]
  },
  {
    id: 'full-body-06', name: '全身训练 06 · 单侧控制', focus: 'full_body', level: 'intermediate', setting: 'dumbbell', durationMinutes: 47,
    summary: '用单侧动作强化左右平衡与髋部稳定。',
    exercises: [warm('hip-airplane', '每侧 5 次'), main('bulgarian-split-squat', '每侧 8–10 次'), main('single-leg-romanian-deadlift', '每侧 8–10 次'), main('one-arm-dumbbell-row', '每侧 10 次'), main('standing-dumbbell-press', '每侧 8–10 次'), accessory('push-up-shoulder-tap', '每侧 8 次'), timed('side-plank', '每侧 30 秒'), cool('seated-forward-fold-stretch')]
  },
  {
    id: 'full-body-07', name: '全身训练 07 · 杠铃力量', focus: 'full_body', level: 'intermediate', setting: 'full_gym', durationMinutes: 58,
    summary: '偏力量的复合动作日，主项休息更充分。',
    exercises: [warm('worlds-greatest-stretch'), main('front-squat', '5–6 次', 4, 150, 'RPE 7–8'), main('bench-press', '5–6 次', 4, 150, 'RPE 7–8'), main('barbell-row', '6–8 次', 4, 120), accessory('romanian-deadlift', '8 次', 3, 120), accessory('overhead-press', '8 次'), accessory('hanging-knee-raise', '8–12 次')]
  },
  {
    id: 'full-body-08', name: '全身训练 08 · 肌耐力', focus: 'full_body', level: 'intermediate', setting: 'full_gym', durationMinutes: 44,
    summary: '中等负荷、较高次数，覆盖全身主要肌群。',
    exercises: [warm('rowing', '5 分钟'), main('hack-squat', '12–15 次', 3, 75, 'RPE 7'), main('incline-dumbbell-press', '12–15 次', 3, 75, 'RPE 7'), main('lat-pulldown', '12–15 次', 3, 75, 'RPE 7'), accessory('hip-thrust', '12–15 次'), accessory('lateral-raise', '15–20 次'), accessory('cable-crunch', '12–15 次'), cool('doorway-chest-stretch')]
  },
  {
    id: 'full-body-09', name: '全身训练 09 · 后侧偏重', focus: 'full_body', level: 'intermediate', setting: 'full_gym', durationMinutes: 50,
    summary: '全身框架中增加臀腿后侧与上背刺激。',
    exercises: [warm('cat-cow-stretch'), main('trap-bar-deadlift', '6–8 次', 4, 150), main('split-squat', '每侧 8–10 次'), main('landmine-press', '每侧 8–10 次'), main('chest-supported-row', '10–12 次'), accessory('face-pull', '12–15 次'), accessory('half-kneeling-pallof-press', '每侧 10 次'), cool('hamstring-stretch')]
  },
  {
    id: 'full-body-10', name: '全身训练 10 · 弹力带', focus: 'full_body', level: 'beginner', setting: 'band', durationMinutes: 35,
    summary: '适合居家或出差，阻力带完成全身循环。',
    exercises: [warm('arm-circles', '前后各 30 秒'), main('banded-squat', '15 次'), main('banded-row', '12–15 次'), main('banded-glute-bridge', '15 次'), main('knee-push-up', '8–12 次'), accessory('banded-pallof-press', '每侧 10–12 次'), accessory('banded-face-pull', '12–15 次'), cool('torso-twist-stretch')]
  },
  {
    id: 'full-body-11', name: '全身训练 11 · 徒手进阶', focus: 'full_body', level: 'intermediate', setting: 'bodyweight', durationMinutes: 39,
    summary: '单腿、俯卧撑和倒立划船组成的徒手全身课。',
    exercises: [warm('worlds-greatest-stretch'), main('reverse-lunge', '每侧 10–12 次'), main('push-up', '10–15 次'), main('inverted-row', '8–12 次'), main('single-leg-glute-bridge', '每侧 10–12 次'), accessory('pike-push-up', '6–10 次'), accessory('bird-dog', '每侧 10 次'), cool('childs-pose')]
  },
  {
    id: 'full-body-12', name: '全身训练 12 · 低冲击', focus: 'full_body', level: 'beginner', setting: 'minimal', durationMinutes: 31,
    summary: '无跳跃的温和全身训练，动作转换简单。',
    exercises: [warm('walking', '5 分钟'), main('step-up', '每侧 10 次'), main('wall-push-up', '12–15 次'), main('towel-row', '10–15 次'), accessory('glute-bridge-march', '每侧 10 次'), accessory('calf-raise', '15–20 次'), accessory('dead-bug', '每侧 8 次'), cool('wall-calf-stretch')]
  },

  {
    id: 'quads-01', name: '大腿前侧 01 · 深蹲基础', focus: 'quads', level: 'beginner', setting: 'full_gym', durationMinutes: 42,
    summary: '以深蹲为主项，配合单腿和膝伸展训练。',
    exercises: [warm('leg-swings-stretch'), main('squat', '8–10 次', 4, 120), main('reverse-lunge', '每侧 10 次'), accessory('leg-extension', '12–15 次'), accessory('step-up', '每侧 10–12 次'), accessory('standing-calf-raise', '12–15 次'), cool('standing-quad-stretch')]
  },
  {
    id: 'quads-02', name: '大腿前侧 02 · 哑铃居家', focus: 'quads', level: 'beginner', setting: 'dumbbell', durationMinutes: 37,
    summary: '用哑铃增加股四头肌容量，兼顾单侧稳定。',
    exercises: [warm('bodyweight-squat', '15 次'), main('goblet-squat', '10–12 次', 4), main('walking-lunge', '每侧 10 次'), accessory('front-foot-elevated-split-squat', '每侧 10 次'), accessory('step-down', '每侧 10–12 次'), accessory('single-leg-calf-raise', '每侧 12–15 次'), cool('kneeling-hip-flexor-stretch')]
  },
  {
    id: 'quads-03', name: '大腿前侧 03 · 器械容量', focus: 'quads', level: 'intermediate', setting: 'full_gym', durationMinutes: 45,
    summary: '固定轨迹下积累训练量，减少技术变量。',
    exercises: [warm('treadmill-incline-walk', '5 分钟'), main('hack-squat', '8–12 次', 4, 105), main('leg-press', '10–15 次', 3, 90), main('smith-machine-split-squat', '每侧 8–10 次'), accessory('leg-extension', '12–15 次', 3), accessory('leg-press-calf-raise', '15–20 次'), cool('standing-quad-stretch')]
  },
  {
    id: 'quads-04', name: '大腿前侧 04 · 单腿稳定', focus: 'quads', level: 'intermediate', setting: 'dumbbell', durationMinutes: 43,
    summary: '前后与侧向单腿动作，提升膝髋控制。',
    exercises: [warm('hip-airplane', '每侧 5 次'), main('bulgarian-split-squat', '每侧 8–10 次', 4, 90), main('deficit-reverse-lunge', '每侧 8–10 次'), main('dumbbell-lateral-lunge', '每侧 8 次'), accessory('single-leg-box-squat', '每侧 8–10 次'), accessory('calf-raise', '15–20 次'), cool('kneeling-hip-flexor-stretch')]
  },
  {
    id: 'quads-05', name: '大腿前侧 05 · 徒手耐力', focus: 'quads', level: 'beginner', setting: 'bodyweight', durationMinutes: 30,
    summary: '徒手高质量重复，适合无器械训练日。',
    exercises: [warm('leg-swings-stretch'), main('bodyweight-squat', '15–20 次'), main('forward-lunge', '每侧 10–12 次'), main('split-squat', '每侧 10–15 次'), accessory('step-down', '每侧 10 次'), accessory('wall-sit', '30–45 秒'), accessory('calf-raise', '18–25 次'), cool('standing-quad-stretch')]
  },
  {
    id: 'quads-06', name: '大腿前侧 06 · 前蹲力量', focus: 'quads', level: 'intermediate', setting: 'full_gym', durationMinutes: 50,
    summary: '前蹲与抬跟深蹲突出膝主导力量。',
    exercises: [warm('bodyweight-squat', '15 次'), main('front-squat', '5–7 次', 5, 150), main('heel-elevated-goblet-squat', '10–12 次'), main('smith-machine-reverse-lunge', '每侧 8–10 次'), accessory('leg-extension', '12–15 次'), accessory('seated-calf-raise', '15–20 次'), cool('standing-quad-stretch')]
  },

  {
    id: 'posterior-01', name: '臀腿后侧 01 · 髋铰链基础', focus: 'posterior_chain', level: 'beginner', setting: 'full_gym', durationMinutes: 43,
    summary: '学习髋铰链，并用臀推和腿弯举补足后侧链。',
    exercises: [warm('cat-cow-stretch'), main('romanian-deadlift', '8–10 次', 4, 120), main('hip-thrust', '8–12 次'), accessory('seated-leg-curl', '10–15 次'), accessory('glute-focused-back-extension', '10–12 次'), accessory('cable-standing-hip-abduction', '每侧 12–15 次'), cool('hamstring-stretch')]
  },
  {
    id: 'posterior-02', name: '臀腿后侧 02 · 哑铃臀腿', focus: 'posterior_chain', level: 'beginner', setting: 'dumbbell', durationMinutes: 39,
    summary: '哑铃硬拉、臀推和单腿动作的居家后侧课。',
    exercises: [warm('glute-bridge', '15 次'), main('dumbbell-romanian-deadlift', '10–12 次', 4), main('dumbbell-hip-thrust', '10–15 次'), main('reverse-lunge', '每侧 10 次'), accessory('single-leg-romanian-deadlift', '每侧 8–10 次'), accessory('side-lying-hip-abduction', '每侧 12–15 次'), cool('seated-forward-fold-stretch')]
  },
  {
    id: 'posterior-03', name: '臀腿后侧 03 · 弹力带激活', focus: 'posterior_chain', level: 'beginner', setting: 'band', durationMinutes: 32,
    summary: '中低负荷激活臀肌，适合作为轻训练日。',
    exercises: [warm('leg-swings-stretch'), main('banded-hip-thrust', '15–20 次'), main('banded-squat', '12–15 次'), accessory('banded-lateral-walk', '每侧 12 步'), accessory('banded-monster-walk', '前后各 12 步'), accessory('banded-standing-hip-abduction', '每侧 15 次'), accessory('lying-hamstring-walkout', '8–12 次'), cool('kneeling-hip-flexor-stretch')]
  },
  {
    id: 'posterior-04', name: '臀腿后侧 04 · 单腿后链', focus: 'posterior_chain', level: 'intermediate', setting: 'dumbbell', durationMinutes: 42,
    summary: '单腿髋铰链与臀桥，强化左右侧独立控制。',
    exercises: [warm('hip-airplane', '每侧 5 次'), main('single-leg-romanian-deadlift', '每侧 8 次', 4, 90), main('bulgarian-split-squat', '每侧 8–10 次'), main('single-leg-glute-bridge', '每侧 12 次'), accessory('stability-ball-hamstring-curl', '10–15 次'), accessory('side-lying-leg-raise', '每侧 15 次'), cool('hamstring-stretch')]
  },
  {
    id: 'posterior-05', name: '臀腿后侧 05 · 硬拉力量', focus: 'posterior_chain', level: 'intermediate', setting: 'full_gym', durationMinutes: 54,
    summary: '低次数硬拉为主项，后续控制总疲劳。',
    exercises: [warm('worlds-greatest-stretch'), main('deadlift', '4–6 次', 4, 180, 'RPE 7–8'), main('barbell-glute-bridge', '8–10 次', 4, 120), accessory('lying-leg-curl', '10–12 次'), accessory('cable-pull-through', '12–15 次'), accessory('reverse-hyperextension', '10–15 次'), cool('childs-pose')]
  },
  {
    id: 'posterior-06', name: '臀腿后侧 06 · 徒手控制', focus: 'posterior_chain', level: 'intermediate', setting: 'bodyweight', durationMinutes: 34,
    summary: '无需负重，以慢速离心和单侧动作增加难度。',
    exercises: [warm('cat-cow-stretch'), main('single-leg-glute-bridge', '每侧 12–15 次'), main('lying-hamstring-walkout', '8–12 次', 3, 75, 'RPE 7–8', '回程保持髋部抬高'), main('reverse-lunge', '每侧 12 次'), accessory('superman', '12–15 次'), accessory('hip-airplane', '每侧 6–8 次'), cool('hamstring-stretch')]
  },

  {
    id: 'upper-01', name: '上肢训练 01 · 水平推拉', focus: 'upper_body', level: 'beginner', setting: 'full_gym', durationMinutes: 42,
    summary: '胸推与划船等量配对，建立上肢基础。',
    exercises: [warm('arm-circles', '前后各 30 秒'), main('bench-press', '8–10 次', 4, 105), main('seated-row', '8–12 次', 4, 105), accessory('incline-dumbbell-press', '10–12 次'), accessory('face-pull', '12–15 次'), accessory('tricep-pushdown', '10–15 次'), accessory('bicep-curl', '10–15 次'), cool('doorway-chest-stretch')]
  },
  {
    id: 'upper-02', name: '上肢训练 02 · 垂直推拉', focus: 'upper_body', level: 'intermediate', setting: 'full_gym', durationMinutes: 44,
    summary: '过顶推举与下拉为主，兼顾肩胛控制。',
    exercises: [warm('scapular-push-up', '10–12 次'), main('overhead-press', '6–8 次', 4, 120), main('lat-pulldown', '8–12 次', 4, 105), accessory('landmine-press', '每侧 10 次'), accessory('straight-arm-pulldown', '12–15 次'), accessory('lateral-raise', '12–20 次'), accessory('prone-y-raise', '10–15 次'), cool('cross-body-shoulder-stretch')]
  },
  {
    id: 'upper-03', name: '上肢训练 03 · 哑铃均衡', focus: 'upper_body', level: 'beginner', setting: 'dumbbell', durationMinutes: 39,
    summary: '一对哑铃覆盖胸、背、肩和手臂。',
    exercises: [warm('arm-circles', '前后各 30 秒'), main('dumbbell-bench-press', '8–12 次'), main('one-arm-dumbbell-row', '每侧 10–12 次'), main('seated-dumbbell-press', '8–12 次'), accessory('bent-over-rear-delt-raise', '12–15 次'), accessory('hammer-curl', '10–15 次'), accessory('dumbbell-overhead-tricep-extension', '10–15 次'), cool('doorway-chest-stretch')]
  },
  {
    id: 'upper-04', name: '上肢训练 04 · 徒手推拉', focus: 'upper_body', level: 'intermediate', setting: 'minimal', durationMinutes: 36,
    summary: '俯卧撑与自重划船配对，适合居家训练。',
    exercises: [warm('scapular-push-up', '10 次'), main('push-up', '8–15 次', 4, 75), main('inverted-row', '8–12 次', 4, 75), main('pike-push-up', '6–10 次'), accessory('doorway-row', '10–15 次'), accessory('chair-dip', '8–12 次'), accessory('prone-t-raise', '12–15 次'), cool('cross-body-shoulder-stretch')]
  },
  {
    id: 'upper-05', name: '上肢训练 05 · 背部优先', focus: 'upper_body', level: 'intermediate', setting: 'full_gym', durationMinutes: 45,
    summary: '水平与垂直拉并重，推类动作维持平衡。',
    exercises: [warm('scapular-pull-up', '8–10 次'), main('pull-up', '尽量保留 2 次余力', 4, 120), main('barbell-row', '8–10 次', 4, 105), main('incline-bench-press', '8–10 次'), accessory('single-arm-cable-row', '每侧 10–12 次'), accessory('cable-rear-delt-fly', '12–15 次'), accessory('rope-hammer-curl', '10–15 次'), cool('childs-pose')]
  },
  {
    id: 'upper-06', name: '上肢训练 06 · 器械容量', focus: 'upper_body', level: 'beginner', setting: 'full_gym', durationMinutes: 43,
    summary: '器械稳定轨迹，适合专注肌肉发力与容量。',
    exercises: [warm('arm-circles', '前后各 30 秒'), main('machine-chest-press', '10–12 次', 4), main('machine-row', '10–12 次', 4), main('machine-shoulder-press', '10–12 次'), accessory('close-grip-lat-pulldown', '10–15 次'), accessory('machine-lateral-raise', '12–20 次'), accessory('cable-curl', '10–15 次'), accessory('rope-tricep-pushdown', '10–15 次'), cool('doorway-chest-stretch')]
  },

  {
    id: 'core-01', name: '核心训练 01 · 稳定基础', focus: 'core', level: 'beginner', setting: 'bodyweight', durationMinutes: 24,
    summary: '抗伸展、抗侧屈与四点支撑的核心入门。',
    exercises: [warm('cat-cow-stretch', '45 秒'), accessory('dead-bug', '每侧 8–10 次', 3), timed('plank', '25–40 秒'), timed('side-plank', '每侧 20–30 秒'), accessory('bird-dog', '每侧 8–10 次', 3), accessory('glute-bridge', '12–15 次'), cool('childs-pose')]
  },
  {
    id: 'core-02', name: '核心训练 02 · 抗旋转', focus: 'core', level: 'beginner', setting: 'full_gym', durationMinutes: 26,
    summary: '以 Pallof 系列训练躯干抵抗旋转的能力。',
    exercises: [warm('torso-twist-stretch', '45 秒'), main('pallof-press', '每侧 10–12 次'), timed('cable-pallof-hold', '每侧 25–35 秒'), accessory('half-kneeling-pallof-press', '每侧 10 次'), accessory('cable-woodchop', '每侧 10–12 次'), accessory('dead-bug', '每侧 10 次'), cool('childs-pose')]
  },
  {
    id: 'core-03', name: '核心训练 03 · 抗伸展', focus: 'core', level: 'intermediate', setting: 'bodyweight', durationMinutes: 27,
    summary: '从死虫到健腹轮，逐步增加抗伸展挑战。',
    exercises: [warm('cat-cow-stretch', '45 秒'), accessory('dead-bug', '每侧 10 次'), timed('hollow-body-hold', '20–35 秒'), main('ab-wheel', '6–10 次', 4, 75), accessory('plank-shoulder-tap', '每侧 10 次'), timed('bear-plank', '25–40 秒'), cool('childs-pose')]
  },
  {
    id: 'core-04', name: '核心训练 04 · 侧链稳定', focus: 'core', level: 'intermediate', setting: 'bodyweight', durationMinutes: 25,
    summary: '侧桥与内收肌支撑，强化躯干和骨盆侧向稳定。',
    exercises: [warm('torso-twist-stretch', '45 秒'), timed('side-plank', '每侧 30–45 秒'), accessory('side-plank-hip-dip', '每侧 10–15 次'), timed('copenhagen-plank', '每侧 15–25 秒'), accessory('side-lying-hip-abduction', '每侧 15 次'), accessory('bird-dog', '每侧 10 次'), cool('butterfly-stretch')]
  },
  {
    id: 'core-05', name: '核心训练 05 · 动态腹部', focus: 'core', level: 'beginner', setting: 'bodyweight', durationMinutes: 24,
    summary: '屈曲与旋转动作组成的易理解腹部训练。',
    exercises: [warm('cat-cow-stretch', '45 秒'), accessory('crunch', '12–20 次', 3), accessory('reverse-crunch', '10–15 次', 3), accessory('bicycle-crunch', '每侧 12–15 次', 3), accessory('russian-twist', '每侧 12 次', 3), timed('plank', '30–45 秒'), cool('childs-pose')]
  },
  {
    id: 'core-06', name: '核心训练 06 · 悬垂控制', focus: 'core', level: 'intermediate', setting: 'full_gym', durationMinutes: 29,
    summary: '悬垂举膝与躯干稳定结合，强调动作控制。',
    exercises: [warm('scapular-pull-up', '8 次'), main('hanging-knee-raise', '8–12 次', 4, 75), accessory('captains-chair-knee-raise', '10–15 次'), accessory('cable-crunch', '10–15 次'), timed('cable-pallof-hold', '每侧 30 秒'), timed('plank', '35–50 秒'), cool('childs-pose')]
  },
  {
    id: 'core-07', name: '核心训练 07 · 弹力带', focus: 'core', level: 'beginner', setting: 'band', durationMinutes: 25,
    summary: '弹力带提供可控阻力，覆盖抗旋转与对侧协调。',
    exercises: [warm('torso-twist-stretch', '45 秒'), accessory('banded-dead-bug', '每侧 8–10 次', 3), accessory('banded-pallof-press', '每侧 10–12 次', 3), accessory('banded-woodchop', '每侧 10–12 次', 3), timed('bear-plank', '25–35 秒'), accessory('glute-bridge-march', '每侧 10 次'), cool('childs-pose')]
  },
  {
    id: 'core-08', name: '核心训练 08 · 进阶张力', focus: 'core', level: 'intermediate', setting: 'bodyweight', durationMinutes: 28,
    summary: '持续张力与动态稳定结合的高难度核心课。',
    exercises: [warm('cat-cow-stretch', '45 秒'), timed('hollow-body-hold', '25–40 秒', 3, 45, 'RPE 7–8'), accessory('hollow-rock', '10–20 次', 3), timed('l-sit-hold', '10–25 秒', 4, 60, 'RPE 8'), accessory('plank-shoulder-tap', '每侧 12 次', 3), timed('superman-hold', '25–40 秒'), cool('childs-pose')]
  },

  {
    id: 'mobility-01', name: '舒展恢复 01 · 全身放松', focus: 'mobility', level: 'beginner', setting: 'bodyweight', durationMinutes: 18,
    summary: '从脊柱到髋腿的低强度全身舒展。',
    exercises: [warm('cat-cow-stretch', '60 秒'), warm('arm-circles', '前后各 40 秒'), cool('worlds-greatest-stretch', '每侧 45 秒'), cool('kneeling-hip-flexor-stretch', '每侧 45 秒'), cool('hamstring-stretch', '每侧 45 秒'), cool('childs-pose', '60 秒')]
  },
  {
    id: 'mobility-02', name: '舒展恢复 02 · 久坐髋部', focus: 'mobility', level: 'beginner', setting: 'bodyweight', durationMinutes: 16,
    summary: '针对久坐常见的髋屈肌、内收肌与腿后侧紧张。',
    exercises: [warm('walking', '4 分钟'), cool('leg-swings-stretch', '每侧 40 秒'), cool('kneeling-hip-flexor-stretch', '每侧 60 秒'), cool('butterfly-stretch', '60 秒'), cool('seated-forward-fold-stretch', '60 秒'), cool('childs-pose', '60 秒')]
  },
  {
    id: 'mobility-03', name: '舒展恢复 03 · 肩背打开', focus: 'mobility', level: 'beginner', setting: 'minimal', durationMinutes: 15,
    summary: '温和活动肩部并舒展胸、肩和上背。',
    exercises: [warm('arm-circles', '前后各 45 秒'), accessory('scapular-push-up', '10–12 次', 2, 30, 'RPE 4–5'), accessory('prone-y-raise', '10 次', 2, 30, 'RPE 4–5'), cool('doorway-chest-stretch', '每侧 45 秒'), cool('cross-body-shoulder-stretch', '每侧 45 秒'), cool('childs-pose', '60 秒')]
  },
  {
    id: 'mobility-04', name: '舒展恢复 04 · 骑后腿部', focus: 'mobility', level: 'beginner', setting: 'bodyweight', durationMinutes: 17,
    summary: '骑行后用于降速与舒展股四头肌、髋和小腿。',
    exercises: [warm('walking', '5 分钟'), cool('standing-quad-stretch', '每侧 45 秒'), cool('kneeling-hip-flexor-stretch', '每侧 45 秒'), cool('hamstring-stretch', '每侧 45 秒'), cool('wall-calf-stretch', '每侧 45 秒'), cool('butterfly-stretch', '60 秒')]
  },
  {
    id: 'mobility-05', name: '舒展恢复 05 · 晨间唤醒', focus: 'mobility', level: 'beginner', setting: 'bodyweight', durationMinutes: 12,
    summary: '短时动态活动，适合晨间或训练前轻量唤醒。',
    exercises: [warm('cat-cow-stretch', '45 秒'), warm('arm-circles', '前后各 30 秒'), warm('torso-twist-stretch', '45 秒'), warm('leg-swings-stretch', '每侧 30 秒'), warm('bodyweight-squat', '10 次'), warm('worlds-greatest-stretch', '每侧 30 秒')]
  },
  {
    id: 'conditioning-01', name: '体能循环 01 · 徒手全身', focus: 'conditioning', level: 'beginner', setting: 'bodyweight', durationMinutes: 24,
    summary: '六动作循环 3 轮，保持技术稳定而非追求极限速度。',
    exercises: [warm('jumping-jack', '60 秒'), main('bodyweight-squat', '15 次', 3, 20, 'RPE 6–7'), main('incline-push-up', '10–12 次', 3, 20, 'RPE 6–7'), main('reverse-lunge', '每侧 10 次', 3, 20, 'RPE 6–7'), timed('mountain-climber', '30 秒', 3, 20, 'RPE 7', 'main'), timed('plank', '30 秒', 3, 75, 'RPE 6–7'), cool('childs-pose')]
  },
  {
    id: 'conditioning-02', name: '体能循环 02 · 哑铃复合', focus: 'conditioning', level: 'intermediate', setting: 'dumbbell', durationMinutes: 30,
    summary: '哑铃复合动作循环，提高全身工作容量。',
    exercises: [warm('high-knees', '45 秒'), main('goblet-squat', '12 次', 4, 20, 'RPE 7'), main('dumbbell-romanian-deadlift', '12 次', 4, 20, 'RPE 7'), main('standing-dumbbell-press', '10 次', 4, 20, 'RPE 7'), main('one-arm-dumbbell-row', '每侧 10 次', 4, 20, 'RPE 7'), timed('farmer-carry', '40 秒', 4, 90, 'RPE 7', 'main'), cool('hamstring-stretch')]
  },
  {
    id: 'conditioning-03', name: '体能循环 03 · 壶铃后链', focus: 'conditioning', level: 'intermediate', setting: 'minimal', durationMinutes: 27,
    summary: '摆动为核心的短循环，重点保持髋铰链技术。',
    exercises: [warm('glute-bridge', '15 次'), main('kettlebell-swing', '15 次', 5, 30, 'RPE 7–8'), main('goblet-squat', '10 次', 5, 30, 'RPE 7'), main('push-up', '8–12 次', 5, 30, 'RPE 7'), accessory('bird-dog', '每侧 8 次', 5, 75, 'RPE 6'), cool('kneeling-hip-flexor-stretch')]
  },
  {
    id: 'conditioning-04', name: '体能循环 04 · 低冲击', focus: 'conditioning', level: 'beginner', setting: 'minimal', durationMinutes: 28,
    summary: '无跳跃循环，适合希望降低冲击的训练者。',
    exercises: [warm('walking', '4 分钟'), main('step-up', '每侧 10 次', 3, 30, 'RPE 6–7'), main('wall-push-up', '15 次', 3, 30, 'RPE 6–7'), main('towel-row', '12 次', 3, 30, 'RPE 6–7'), main('glute-bridge-march', '每侧 10 次', 3, 30, 'RPE 6–7'), timed('bear-plank', '25 秒', 3, 75, 'RPE 6'), cool('wall-calf-stretch')]
  },
  {
    id: 'conditioning-05', name: '体能循环 05 · 弹力带', focus: 'conditioning', level: 'beginner', setting: 'band', durationMinutes: 26,
    summary: '便携弹力带循环，推拉蹲髋和核心全部覆盖。',
    exercises: [warm('arm-circles', '前后各 30 秒'), main('banded-squat', '15 次', 4, 20, 'RPE 7'), main('banded-row', '15 次', 4, 20, 'RPE 7'), main('banded-glute-bridge', '15 次', 4, 20, 'RPE 7'), main('knee-push-up', '10–12 次', 4, 20, 'RPE 7'), accessory('banded-pallof-press', '每侧 10 次', 4, 75, 'RPE 6–7'), cool('torso-twist-stretch')]
  },
  {
    id: 'conditioning-06', name: '体能循环 06 · 短时进阶', focus: 'conditioning', level: 'intermediate', setting: 'bodyweight', durationMinutes: 22,
    summary: '短间歇高密度训练；出现动作变形时立即降速。',
    exercises: [warm('jumping-jack', '60 秒'), timed('skater-hop', '30 秒', 4, 20, 'RPE 7–8', 'main'), main('jump-squat', '8–10 次', 4, 25, 'RPE 7–8'), main('push-up', '8–15 次', 4, 25, 'RPE 7–8'), timed('mountain-climber', '30 秒', 4, 25, 'RPE 7–8', 'main'), timed('hollow-body-hold', '25 秒', 4, 90, 'RPE 7'), cool('childs-pose')]
  }
] as const

export type WorkoutPlanFilters = {
  query?: string
  focus?: WorkoutPlanFocus | ''
  level?: WorkoutPlanLevel | ''
  setting?: WorkoutPlanSetting | ''
}

export function filterWorkoutPlans(filters: WorkoutPlanFilters): WorkoutPlan[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? ''

  return workoutPlans.filter(plan => {
    if (filters.focus && plan.focus !== filters.focus) return false
    if (filters.level && plan.level !== filters.level) return false
    if (filters.setting && plan.setting !== filters.setting) return false
    if (!query) return true

    const exerciseNames = plan.exercises.flatMap(item => {
      const exercise = getWorkoutExercise(item.exerciseSlug)
      return exercise ? [exercise.name, exercise.slug, exercise.primaryMuscle] : [item.exerciseSlug]
    })
    return [plan.name, plan.summary, workoutPlanFocusLabels[plan.focus], ...exerciseNames]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query)
  })
}

export type WorkoutPlanRecommendationOptions = WorkoutPlanFilters & {
  count?: number
  recentPlanIds?: readonly string[]
  seed?: string
}

const stableHash = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Deterministic, unique recommendations that avoid recently served plans when possible. */
export function recommendWorkoutPlans(options: WorkoutPlanRecommendationOptions = {}): WorkoutPlan[] {
  const count = Math.max(0, Math.floor(options.count ?? 1))
  if (!count) return []

  const candidates = filterWorkoutPlans(options)
  const recent = new Set(options.recentPlanIds ?? [])
  const fresh = candidates.filter(plan => !recent.has(plan.id))
  const fallback = candidates.filter(plan => recent.has(plan.id))
  const rank = (plans: WorkoutPlan[]) => plans.sort((a, b) => {
    const seed = options.seed ?? 'runcoach'
    return stableHash(`${seed}:${a.id}`) - stableHash(`${seed}:${b.id}`)
  })
  const ranked = [...rank(fresh), ...rank(fallback)]

  return ranked.slice(0, Math.min(count, ranked.length))
}
