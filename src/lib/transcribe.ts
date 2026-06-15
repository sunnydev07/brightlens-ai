import axios from 'axios'
import { API_BASE_URL } from './constants'

/** Extract a human-readable error message from an axios/unknown error. */
export function describeRequestError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined
    return data?.error || data?.message || err.message || fallback
  }
  return err instanceof Error ? err.message : fallback
}

/**
 * Send an audio blob to the speech endpoint and return the transcript.
 * Preserves the existing backend contract (`POST /speech`, field `audio`).
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (audioBlob.size === 0) return ''
  const formData = new FormData()
  formData.append('audio', audioBlob, 'speech.webm')
  const res = await axios.post(`${API_BASE_URL}/speech`, formData)
  return String((res.data as { text?: string })?.text || '').trim()
}
