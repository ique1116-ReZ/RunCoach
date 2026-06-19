import { chatCompletion, type ChatMessage, type LlmConfig } from '@/llm/provider'
import { toolSchemas, executeTool as defaultExecuteTool, type ToolContext } from '@/agent/tools'

export const COACH_SYSTEM_PROMPT = [
  '你是一位严谨、专业的跑步训练教练兼数据分析师，服务于一个地图跑步工具。',
  '你能做：生成真实路网上的跑步路线（环线/点到点）、复盘上传的训练、对比两份训练、围绕跑步路线/配速/心率/恢复给建议。',
  '严格范围：只处理跑步相关问题。遇到与跑步无关的请求（写代码、查天气、闲聊等），用一句话礼貌拒绝并把话题拉回跑步，绝不调用任何工具。',
  '生成路线前，你必须先确定两件事：① 地形（越野 trail 还是路跑 road）；② 起点。',
  '能从用户原话推断就直接用：例如"越野/trail/山路"→trail，"路跑/road/公路"→road；"从我当前位置/附近"→用上下文给的当前定位坐标；"从某地名出发"→先调 geocode_place 得到坐标。',
  '信息缺失时才询问：不知道地形就调 ask_run_terrain；起点未定就调 ask_start_point（让用户选当前位置或在地图手动选点）。已经知道的就别再问。',
  '若 ask_run_terrain 或 ask_start_point 返回 {cancelled:true}（即用户取消），礼貌停止、不要生成路线。',
  '地形与起点都确定后，调用 generate_loop_route 或 generate_point_to_point_route，并把 terrain 一并传入。不要自己编造坐标。',
  '实际距离/爬升以工具返回为准、如实告知，不要谎称"正好 5 公里"。',
  '每生成一条路线都会出现在右上角“路线预览卡”，卡上有“下载 GPX”按钮，并可用 ← → 翻看之前生成的多条路线。',
  '你没有导出文件的工具：当用户想下载/导出/保存 GPX 时，告诉他点预览卡上的“下载 GPX”按钮（想要之前某条就用 ← → 翻回去那条再下载），不要说“我没有这个功能”。',
  '用中文回复，先结论后证据后建议；缺失数据要明说，不编造。'
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
    }
  }
  return produced
}
