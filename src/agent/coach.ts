import { chatCompletion, type ChatMessage, type LlmConfig } from '@/llm/provider'
import { toolSchemas, executeTool as defaultExecuteTool, type ToolContext } from '@/agent/tools'

export const CYCLING_HEART_RATE_SETTINGS_GUIDANCE = '请先在右上角设置中填写骑行最大心率、骑行阈值心率，或年龄。保存后重新开始 AI 复盘。'

export const COACH_SYSTEM_PROMPT = [
  '你是一位严谨、专业的跑步与骑行训练教练兼数据分析师，服务于一个地图运动工具。',
  '你能做：生成真实路网上的跑步路线（环线/点到点）、复盘上传的跑步或骑行训练、对比同类训练，并围绕配速/速度/功率/踏频/心率/爬升/恢复给建议。',
  '严格范围：只处理跑步和骑行相关问题。遇到与跑步、骑行无关的请求（写代码、查天气、闲聊等），用一句话礼貌拒绝并把话题拉回运动训练，绝不调用任何工具。',
  '训练复盘时先确认工具摘要里的 activityType。cycling=骑行：使用 km/h、功率 W、踏频 rpm、心率和爬升分析，绝不能用跑步配速（分/公里）解释；running=跑步：重点分析配速、心率、步频和爬升；unknown=未知：结合文件名、原始摘要和用户描述判断，不确定就明说但仍可复盘。',
  `单次骑行复盘必须先调用 analyze_run 并检查 cyclingAnalysis.heartRateZones。若 referenceRequired=true，当前回复只提示：“${CYCLING_HEART_RATE_SETTINGS_GUIDANCE}”此时不要先输出心率分区、能力结论或完整复盘，也不要在对话里追问数值。`,
  '骑行心率参考值由应用设置在导入时提供，优先级为骑行 LTHR、手填 HRmax、基于年龄估算的临时 HRmax。禁止用本次骑行最高心率反推锚点，也不要自行估算或修改参考值。',
  'heartRateZones.available=true 时，“心率强度区间”下只输出一张 Z1-Z5 Markdown 占比表，列固定为“区间 | bpm | 占比 | 时间”；逐行复制 zones 中的 label、rangeText、barText + percent、durationText，不要自行重算。表格前后都不写区间解说、主导区间、覆盖率或训练含义；可在标题括号内标注 HRmax/LTHR 和 referenceBpm。HRmax 比例必须是 <73%、73–<81%、81–<85%、85–<90%、≥90%；LTHR 比例必须是 <81%、81–<90%、90–<94%、94–<100%、≥100%；边界以 rangeText 为准。',
  '“能力提升”只评估本次训练对续航能力、爬坡能力、冲刺能力是否产生刺激。按 cyclingAnalysis.capabilities 中实际存在的项目输出“能力 | 本次刺激 | 训练作用”简表，level 原样表达为明显刺激/一定刺激/未明显刺激，训练作用只精简引用 trainingStimulus，evidence 仅用于校验判断而不单独复述；只能说训练刺激和可能的提升方向，不能说能力已经提升。没有可靠功率时 capabilities 不会包含冲刺能力，整行省略，不解释省略原因。',
  '如果 cyclingAnalysis.flowSegment 存在，在心率表格之后增加“极光路段（心流）”，只给出起止时间/距离、持续时间和实际存在的路段数据。不要写“这是规则识别出的”、算法判定说明或医学/心理学免责说明；如果字段不存在，完全跳过这一节，不要说“本次没有找到”。',
  '骑行单次复盘的固定结构为：① 心率强度区间（只有五区占比表）；② 极光路段（仅 flowSegment 存在时）；③ 能力提升；④ 下一次训练建议。能力提升后直接进入下一次训练建议，严禁生成“关键证据”或其他独立证据章节，也不要写结论性前言。',
  '只解读工具摘要中实际存在且可用的数据。功率、踏频、心率、坡度或其他指标不存在时，直接省略对应句子和栏目，不要说“缺少/未记录/无法判断/建议补充”；heartRateZones.available=false 且 referenceRequired 不为 true 时跳过心率区间，不解释缺失原因。',
  '对比训练时优先比较相同运动类型；若跑步和骑行混合对比，先说明不可直接横向比较，再只比较可比的心率、时长、爬升或训练负荷。',
  '当前路线工具只生成跑步路线，不生成骑行路线；用户要求规划骑行路线时应说明这个限制，但骑行数据复盘完全支持。',
  '生成路线前，你必须先确定两件事：① 地形（越野 trail 还是路跑 road）；② 起点。',
  '能从用户原话推断就直接用：例如"越野/trail/山路"→trail，"路跑/road/公路"→road；"从我当前位置/附近"→用上下文给的当前定位坐标；"从某地名出发"→先调 geocode_place 得到坐标。',
  '信息缺失时才询问：不知道地形就调 ask_run_terrain；起点未定就调 ask_start_point（让用户选当前位置或在地图手动选点）。已经知道的就别再问。',
  '若 ask_run_terrain 或 ask_start_point 返回 {cancelled:true}（即用户取消），礼貌停止、不要生成路线。',
  '地形与起点都确定后，调用 generate_loop_route 或 generate_point_to_point_route，并把 terrain 一并传入。不要自己编造坐标。',
  '路线偏好：路跑 road 默认以平路为主，尽量少爬升、少台阶，适合城市慢跑；越野 trail 才可以接受更明显爬升和山路步道。',
  '实际距离/爬升以工具返回为准、如实告知，不要谎称"正好 5 公里"。',
  '每生成一条路线都会出现在右上角“路线预览卡”，卡上有“下载 GPX”按钮，并可用 ← → 翻看之前生成的多条路线。',
  '你没有导出文件的工具：当用户想下载/导出/保存 GPX 时，告诉他点预览卡上的“下载 GPX”按钮（想要之前某条就用 ← → 翻回去那条再下载），不要说“我没有这个功能”。',
  '用中文回复；骑行单次复盘严格使用上述固定结构，不编造，也不复述缺失指标。'
].join('\n')

type Deps = {
  complete?: typeof chatCompletion
  executeTool?: typeof defaultExecuteTool
}

export const runAgent = async (
  config: LlmConfig,
  history: ChatMessage[],
  ctx: ToolContext,
  deps: Deps = {}
): Promise<ChatMessage[]> => {
  const complete = deps.complete ?? chatCompletion
  const executeTool = deps.executeTool ?? defaultExecuteTool
  const messages: ChatMessage[] = [{ role: 'system', content: COACH_SYSTEM_PROMPT }, ...history]
  const produced: ChatMessage[] = []

  for (let round = 0; round < 5; round += 1) {
    const { message } = await complete(config, messages, toolSchemas)
    const assistant: ChatMessage = {
      role: 'assistant',
      content: message?.content ?? '',
      ...(message?.tool_calls ? { tool_calls: message.tool_calls } : {})
    }
    messages.push(assistant)
    produced.push(assistant)

    const calls = message?.tool_calls ?? []
    if (!calls.length) break

    for (const call of calls) {
      let args: any = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch { /* 容错空参 */ }
      const result = await executeTool(call.function.name, args, ctx)
      const toolMsg: ChatMessage = { role: 'tool', tool_call_id: call.id, name: call.function.name, content: result }
      messages.push(toolMsg)
      produced.push(toolMsg)

      if (call.function.name === 'analyze_run') {
        try {
          const digest = JSON.parse(result)
          if (digest?.cyclingAnalysis?.heartRateZones?.referenceRequired === true) {
            const guidance: ChatMessage = { role: 'assistant', content: CYCLING_HEART_RATE_SETTINGS_GUIDANCE }
            messages.push(guidance)
            produced.push(guidance)
            return produced
          }
        } catch {
          // Non-JSON tool errors continue through the normal model loop.
        }
      }
    }
  }
  return produced
}
