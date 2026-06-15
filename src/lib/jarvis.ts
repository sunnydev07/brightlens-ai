import type { JarvisCard } from './types'

function messageFromResult(value: unknown): { message: string; isError: boolean } {
  if (!value || typeof value !== 'object') return { message: '', isError: false }
  const detail = value as { message?: unknown; error?: unknown; text?: unknown }
  if (typeof detail.message === 'string') return { message: detail.message, isError: false }
  if (typeof detail.error === 'string') return { message: detail.error, isError: true }
  if (typeof detail.text === 'string') {
    return {
      message: detail.text ? `Clipboard: ${detail.text}` : 'The clipboard is empty.',
      isError: false,
    }
  }
  return { message: '', isError: false }
}

function prettyToolName(tool: string | undefined): string {
  if (!tool) return 'Desktop action'
  return tool
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/**
 * Convert a raw Mini-Jarvis command result into structured cards for the UI.
 * Each card exposes a tool name, status, message, optional error and
 * expandable technical details.
 */
export function toJarvisCards(result: MiniJarvisCommandResult): JarvisCard[] {
  if (!result.results?.length) {
    return [
      {
        tool: 'Desktop action',
        status: result.ok ? 'success' : 'error',
        message: result.message || (result.ok ? 'Done.' : 'No result details were returned.'),
        error: result.ok ? undefined : result.message,
      },
    ]
  }

  return result.results.map((entry) => {
    const tool = prettyToolName(entry.tool)
    const details =
      entry.result !== undefined ? safeStringify(entry.result) : safeStringify(entry)

    if (entry.cancelled) {
      return { tool, status: 'cancelled', message: 'Action cancelled.', details }
    }
    if (entry.error) {
      return { tool, status: 'error', message: entry.error, error: entry.error, details }
    }

    const { message, isError } = messageFromResult(entry.result)
    return {
      tool,
      status: isError ? 'error' : 'success',
      message: message || (entry.ok === false ? 'Action failed.' : 'Done.'),
      error: isError ? message : undefined,
      details,
    }
  })
}

/** Overall heading describing a command result. */
export function jarvisHeading(result: MiniJarvisCommandResult): string {
  return result.ok ? 'Done' : "Couldn't complete that action"
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}

/** Plain-text rendering of a Jarvis result for Markdown export. */
export function formatMiniJarvisResult(result: MiniJarvisCommandResult): string {
  const heading = result.ok ? 'Done.' : "I couldn't complete that action."
  if (result.results?.length) {
    const messages = result.results
      .map((entry) => {
        if (entry.error) return entry.error
        if (entry.cancelled) return 'Action cancelled.'
        return messageFromResult(entry.result).message
      })
      .filter(Boolean)
    if (messages.length) return `${heading}\n\n${messages.join('\n')}`
    return `${heading}\n\n\`\`\`json\n${JSON.stringify(result.results, null, 2)}\n\`\`\``
  }
  return `${heading}\n\n${result.message || 'No result details were returned.'}`
}
