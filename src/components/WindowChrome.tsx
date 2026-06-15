import { Minus, Square, X } from 'lucide-react'

interface WindowChromeProps {
  available: boolean
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
}

/**
 * Custom draggable title bar for the frameless Electron window. The control
 * cluster is marked no-drag so the buttons remain clickable. Hidden entirely
 * when the Electron window controls are unavailable (e.g. in a browser).
 */
export function WindowChrome({ available, onMinimize, onMaximize, onClose }: WindowChromeProps) {
  if (!available) return null
  return (
    <div className="window-chrome" role="presentation">
      <div className="window-chrome__drag" aria-hidden="true" />
      <div className="window-chrome__controls">
        <button
          type="button"
          className="win-btn win-btn--min"
          onClick={onMinimize}
          aria-label="Minimize window"
          title="Minimize"
        >
          <Minus size={14} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="win-btn win-btn--max"
          onClick={onMaximize}
          aria-label="Maximize window"
          title="Maximize"
        >
          <Square size={11} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="win-btn win-btn--close"
          onClick={onClose}
          aria-label="Close window"
          title="Close"
        >
          <X size={14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
