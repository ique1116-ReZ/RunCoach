import { useState, useRef } from 'react'
import { runAgent } from '@/agent/coach'
import type { ToolContext } from '@/agent/tools'
import type { ChatMessage, LlmConfig } from '@/llm/provider'
import type { ChatTurn } from './ChatDock'

export const useChatAgent = ({ config, ctx }: { config: LlmConfig | null; ctx: ToolContext }) => {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const history = useRef<ChatMessage[]>([])

  const pushUser = (text: string) => setTurns(t => [...t, { role: 'user', content: text }])
  const pushAssistant = (text: string) => setTurns(t => [...t, { role: 'assistant', content: text }])

  const send = async (text: string, extraContext?: string) => {
    pushUser(text)
    if (!config?.apiKey) { pushAssistant('请先点右上角 ⚙ 设置并测试你的 API Key。'); return }
    const userMsg: ChatMessage = { role: 'user', content: extraContext ? `${text}\n\n[上下文] ${extraContext}` : text }
    history.current.push(userMsg)
    setBusy(true)
    try {
      const produced = await runAgent(config, history.current, ctx)
      history.current.push(...produced)
      const finalText = [...produced].reverse().find(m => m.role === 'assistant' && m.content)?.content
      if (finalText) pushAssistant(finalText)
    } catch (e: any) {
      pushAssistant(`出错了：${String(e?.message ?? e)}。可稍后重试或检查 key。`)
    } finally {
      setBusy(false)
    }
  }
  return { turns, busy, send, pushUser, pushAssistant }
}
