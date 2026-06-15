import { useState } from 'react'
import { Maximize2, X } from 'lucide-react'

interface ScreenshotPreviewProps {
  src: string
  /** When provided, shows a remove control (used in the composer). */
  onRemove?: () => void
  caption?: string
}

/**
 * Renders an attached screenshot as a thumbnail that opens a full-size
 * lightbox on click. Optionally shows a remove button for pending captures.
 */
export function ScreenshotPreview({ src, onRemove, caption }: ScreenshotPreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <figure className="shot">
        <button
          type="button"
          className="shot__thumb"
          onClick={() => setOpen(true)}
          aria-label="View screenshot full size"
        >
          <img src={src || '/placeholder.svg'} alt={caption || 'Captured screenshot'} />
          <span className="shot__zoom" aria-hidden="true">
            <Maximize2 size={15} />
          </span>
        </button>
        {onRemove && (
          <button
            type="button"
            className="shot__remove"
            onClick={onRemove}
            aria-label="Remove screenshot"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
        {caption && <figcaption className="shot__caption">{caption}</figcaption>}
      </figure>

      {open && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot preview"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="lightbox__close"
            onClick={() => setOpen(false)}
            aria-label="Close preview"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <img
            className="lightbox__img"
            src={src || '/placeholder.svg'}
            alt={caption || 'Captured screenshot, full size'}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
