import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastState {
  id: number
  tone: ToastTone
  message: string
}

interface StatusToastProps {
  toast: ToastState | null
  onDismiss: () => void
}

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const

/** Transient, auto-dismissing status message anchored to the bottom. */
export function StatusToast({ toast, onDismiss }: StatusToastProps) {
  useEffect(() => {
    if (!toast) return
    const ms = toast.tone === 'error' ? 6000 : 3500
    const timer = window.setTimeout(onDismiss, ms)
    return () => window.clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null
  const Icon = ICONS[toast.tone]

  return (
    <div className="toast-wrap" aria-live="polite" aria-atomic="true">
      <div className={`toast toast--${toast.tone}`} role="status">
        <Icon size={16} aria-hidden="true" className="toast__icon" />
        <span className="toast__message">{toast.message}</span>
        <button type="button" className="toast__close" onClick={onDismiss} aria-label="Dismiss">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
