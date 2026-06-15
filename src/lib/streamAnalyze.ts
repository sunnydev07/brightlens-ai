import { API_BASE_URL } from './constants'
import type { VisionMode } from './types'

export interface AnalyzePayload {
  image?: string | null
  prompt: string
  mode: VisionMode
  systemPrompt?: string | null
}

/**
 * Parse a single SSE line of the shape `data: {"token"|"error": ...}`.
 * Pure and side-effect free aside from the supplied `onToken` callback.
 * Exported for unit testing.
 */
export function processSseLine(line: string, onToken: (token: string) => void): void {
  if (!line.startsWith('data: ')) return
  const raw = line.slice(6).trim()
  if (!raw) return

  let data: { token?: string; error?: string }
  try {
    data = JSON.parse(raw) as { token?: string; error?: string }
  } catch {
    return
  }

  if (data.error) throw new Error(data.error)
  if (data.token) onToken(data.token)
}

/**
 * POST to the streaming analyze endpoint and dispatch tokens as they arrive.
 * Preserves the existing backend contract and abort/cancellation semantics.
 */
export async function streamAnalyze(
  payload: AnalyzePayload,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/analyze-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Server error ${res.status}`)
  }

  if (!res.body) {
    throw new Error('The server returned an empty streaming response.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    if (signal?.aborted) {
      await reader.cancel()
      const abortErr = new Error('Aborted')
      abortErr.name = 'AbortError'
      throw abortErr
    }
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      processSseLine(line, onToken)
    }
  }

  buffer += decoder.decode()
  for (const line of buffer.split('\n')) {
    processSseLine(line, onToken)
  }
}
