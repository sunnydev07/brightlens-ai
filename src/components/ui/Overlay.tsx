import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

type Variant = 'sheet-right' | 'center'

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  variant?: Variant
  /** Header action slot (e.g. a button), rendered before the close button. */
  headerAction?: ReactNode
  children: ReactNode
  labelledBy: string
  className?: string
}

/**
 * Accessible modal/sheet shell: backdrop, focus trap, Escape-to-close, scroll
 * lock and labelled dialog semantics. `variant` controls the entry geometry.
 */
export function Overlay({
  open,
  onClose,
  title,
  description,
  variant = 'center',
  headerAction,
  children,
  labelledBy,
  className,
}: OverlayProps) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  const descId = description ? `${labelledBy}-desc` : undefined

  return (
    <div className={`overlay overlay--${variant}`}>
      <div className="overlay__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className={`overlay__panel overlay__panel--${variant} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={descId}
        ref={ref}
        tabIndex={-1}
      >
        <header className="overlay__header">
          <div className="overlay__titles">
            <h2 className="overlay__title" id={labelledBy}>
              {title}
            </h2>
            {description && (
              <p className="overlay__desc" id={descId}>
                {description}
              </p>
            )}
          </div>
          <div className="overlay__header-actions">
            {headerAction}
            <button
              type="button"
              className="overlay__close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="overlay__content">{children}</div>
      </div>
    </div>
  )
}
