import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronRight, MinusCircle, Terminal } from 'lucide-react'
import { jarvisHeading, toJarvisCards } from '../lib/jarvis'
import type { JarvisCard } from '../lib/types'

interface JarvisActionCardProps {
  result: MiniJarvisCommandResult
}

function StatusIcon({ status }: { status: JarvisCard['status'] }) {
  if (status === 'success') return <CheckCircle2 size={16} aria-hidden="true" />
  if (status === 'cancelled') return <MinusCircle size={16} aria-hidden="true" />
  return <AlertCircle size={16} aria-hidden="true" />
}

function CardRow({ card }: { card: JarvisCard }) {
  const [showDetails, setShowDetails] = useState(false)
  return (
    <li className={`jarvis-card jarvis-card--${card.status}`}>
      <div className="jarvis-card__head">
        <span className="jarvis-card__status" aria-hidden="true">
          <StatusIcon status={card.status} />
        </span>
        <span className="jarvis-card__tool">{card.tool}</span>
        <span className="jarvis-card__badge">{card.status}</span>
      </div>
      <p className="jarvis-card__message">{card.message}</p>
      {card.details && (
        <div className="jarvis-card__details">
          <button
            type="button"
            className="jarvis-card__toggle"
            onClick={() => setShowDetails((s) => !s)}
            aria-expanded={showDetails}
          >
            <ChevronRight
              size={13}
              aria-hidden="true"
              className={`jarvis-card__toggle-icon ${showDetails ? 'is-open' : ''}`}
            />
            {showDetails ? 'Hide technical details' : 'Show technical details'}
          </button>
          {showDetails && (
            <pre className="jarvis-card__pre">
              <code>{card.details}</code>
            </pre>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Renders a Mini-Jarvis desktop-action result as a set of structured status
 * cards with optional expandable raw output, replacing the old raw JSON dump.
 */
export function JarvisActionCard({ result }: JarvisActionCardProps) {
  const cards = toJarvisCards(result)
  const heading = jarvisHeading(result)
  const ok = result.ok

  return (
    <section className="jarvis" aria-label="Desktop action result">
      <header className={`jarvis__head ${ok ? 'is-ok' : 'is-error'}`}>
        <span className="jarvis__icon" aria-hidden="true">
          <Terminal size={15} />
        </span>
        <span className="jarvis__heading">{heading}</span>
      </header>
      <ul className="jarvis__list">
        {cards.map((card, index) => (
          <CardRow key={`${card.tool}-${index}`} card={card} />
        ))}
      </ul>
    </section>
  )
}
