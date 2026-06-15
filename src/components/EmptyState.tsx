import { Camera, Keyboard, Mic, Terminal } from 'lucide-react'
import { BrandMark } from './BrandMark'

interface EmptyStateProps {
  onPrompt: (text: string) => void
}

const SUGGESTIONS = [
  'Summarize what is on my screen',
  'Explain this error message',
  'Draft a reply to this email',
  'What should I do next here?',
]

const TIPS = [
  { icon: Keyboard, label: 'Type a question below' },
  { icon: Mic, label: 'Hold Shift to talk' },
  { icon: Camera, label: 'Capture your screen' },
  { icon: Terminal, label: 'Run desktop actions' },
]

/** Shown when no conversation is active — greeting, capabilities and starters. */
export function EmptyState({ onPrompt }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__halo" aria-hidden="true">
        <BrandMark size={56} />
      </div>
      <h1 className="empty__title">How can I help you?</h1>
      <p className="empty__subtitle">
        Ask anything, capture your screen for context, or speak your request out loud.
      </p>

      <ul className="empty__tips">
        {TIPS.map(({ icon: Icon, label }) => (
          <li key={label} className="empty__tip">
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </li>
        ))}
      </ul>

      <div className="empty__starters">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            type="button"
            className="empty__starter"
            onClick={() => onPrompt(text)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
