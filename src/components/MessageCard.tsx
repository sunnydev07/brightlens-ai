import { useState } from 'react'
import { AlertTriangle, Check, Copy, User } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { Markdown } from './Markdown'
import { ScreenshotPreview } from './ScreenshotPreview'
import { JarvisActionCard } from './JarvisActionCard'
import { formatMiniJarvisResult } from '../lib/jarvis'
import type { ChatMessage } from '../lib/types'

interface MessageCardProps {
  message: ChatMessage
  /** True for the assistant turn currently receiving tokens. */
  streaming?: boolean
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      type="button"
      className="msg__copy"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  )
}

/** A single conversation turn — user prompt or assistant response. */
export function MessageCard({ message, streaming = false }: MessageCardProps) {
  const isUser = message.role === 'user'

  const copyText = message.jarvis
    ? formatMiniJarvisResult(message.jarvis)
    : message.content

  return (
    <article className={`msg ${isUser ? 'msg--user' : 'msg--assistant'}`}>
      <div className="msg__avatar" aria-hidden="true">
        {isUser ? <User size={16} /> : <BrandMark size={20} />}
      </div>

      <div className="msg__body">
        <div className="msg__meta">
          <span className="msg__author">{isUser ? 'You' : 'Brightlens'}</span>
          {!isUser && !streaming && !message.error && copyText && (
            <CopyButton getText={() => copyText} />
          )}
        </div>

        {message.image && (
          <ScreenshotPreview src={message.image} caption="Captured screen" />
        )}

        {message.jarvis ? (
          <JarvisActionCard result={message.jarvis} />
        ) : message.error ? (
          <div className="msg__error" role="alert">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{message.error}</span>
          </div>
        ) : message.content ? (
          <div className="msg__content">
            <Markdown text={message.content} />
            {streaming && <span className="msg__caret" aria-hidden="true" />}
          </div>
        ) : streaming ? (
          <div className="msg__thinking" aria-label="Generating response">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        ) : null}
      </div>
    </article>
  )
}
