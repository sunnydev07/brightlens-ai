import { useEffect, useRef } from 'react'
import { MessageCard } from './MessageCard'
import { EmptyState } from './EmptyState'
import type { ChatMessage } from '../lib/types'

interface ConversationViewProps {
  messages: ChatMessage[]
  /** Id of the assistant message currently streaming, if any. */
  streamingId: string | null
  onPrompt: (text: string) => void
}

/**
 * Scrollable transcript. Auto-scrolls to the latest content while the user is
 * near the bottom, but yields control if they scroll up to read history.
 */
export function ConversationView({ messages, streamingId, onPrompt }: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distance < 120
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  })

  if (messages.length === 0) {
    return (
      <div className="conversation conversation--empty">
        <EmptyState onPrompt={onPrompt} />
      </div>
    )
  }

  return (
    <div className="conversation" ref={scrollRef} onScroll={onScroll}>
      <div className="conversation__inner">
        {messages.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            streaming={message.id === streamingId}
          />
        ))}
      </div>
    </div>
  )
}
