import { useCallback, useRef, useState } from 'react'
import { streamAnalyze, type AnalyzePayload } from '../lib/streamAnalyze'

export type StreamStatus = 'done' | 'aborted' | 'error' | 'busy'

export interface StreamOutcome {
  status: StreamStatus
  error?: string
}

export interface LockedOutcome<T> {
  status: StreamStatus
  value?: T
  error?: string
}

export interface ChatStream {
  /** True while a streamed or locked assistant task is running. */
  busy: boolean
  busyRef: React.RefObject<boolean>
  /** Stream a model response, dispatching tokens to `onToken`. */
  stream: (payload: AnalyzePayload, onToken: (token: string) => void) => Promise<StreamOutcome>
  /** Run a non-streamed async task (e.g. Mini-Jarvis) under the busy lock. */
  runLocked: <T>(task: () => Promise<T>) => Promise<LockedOutcome<T>>
  /** Abort the active stream and release the lock. */
  stop: () => void
}

/**
 * Owns the streaming request lifecycle: a single-flight busy lock, abort
 * controller, and normalized outcomes. Cancellation is cooperative and the
 * abort subscription is always cleaned up in `finally`.
 */
export function useChatStream(): ChatStream {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const begin = useCallback(() => {
    busyRef.current = true
    setBusy(true)
  }, [])

  const release = useCallback(() => {
    busyRef.current = false
    setBusy(false)
  }, [])

  const stream = useCallback(
    async (payload: AnalyzePayload, onToken: (token: string) => void): Promise<StreamOutcome> => {
      if (busyRef.current) return { status: 'busy' }
      const controller = new AbortController()
      abortControllerRef.current = controller
      begin()
      try {
        await streamAnalyze(payload, onToken, controller.signal)
        return { status: 'done' }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return { status: 'aborted' }
        return {
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to get answer',
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
          release()
        }
      }
    },
    [begin, release],
  )

  const runLocked = useCallback(
    async <T,>(task: () => Promise<T>): Promise<LockedOutcome<T>> => {
      if (busyRef.current) return { status: 'busy' }
      begin()
      try {
        const value = await task()
        return { status: 'done', value }
      } catch (err) {
        return {
          status: 'error',
          error: err instanceof Error ? err.message : 'Action failed',
        }
      } finally {
        release()
      }
    },
    [begin, release],
  )

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    release()
  }, [release])

  return { busy, busyRef, stream, runLocked, stop }
}
