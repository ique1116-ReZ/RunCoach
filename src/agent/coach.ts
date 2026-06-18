import { chatCompletion, type ChatMessage, type LlmConfig } from '@/llm/provider'
import { toolSchemas, executeTool as defaultExecuteTool, type ToolContext } from '@/agent/tools'

export const COACH_SYSTEM_PROMPT = [
  '你是一位严谨、专业的跑步训练教练兼数据分析师，服务于一个地图跑步工具。',
  '你能做：生成真实路网上的跑步路线（环线/点到点）、复盘上传的训练、对比两份训练、围绕跑步路线/配速/心率/恢复给建议。',
  '严格范围：只处理跑步相关问题。遇到与跑步无关的请求（写代码、查天气、闲聊等），用一句话礼貌拒绝并把话题拉回跑步，绝不调用任何工具。',
  '生成路线时务必调用对应工具，不要自己编造坐标。需要起点坐标时：优先用上下文给的当前位置/地图选点坐标；用户只给地名时先调 geocode_place。',
  '实际距离以工具返回为准、如实告知，不要谎称"正好 5 公里"。',
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
      tool_calls: message?.tool_calls
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
