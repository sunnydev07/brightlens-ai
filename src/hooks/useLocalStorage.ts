import { useCallback, useEffect, useRef, useState } from 'react'

type Updater<T> = T | ((prev: T) => T)

/**
 * Persist React state to localStorage with an optional validator/migrator.
 * The `parse` function receives the raw parsed JSON and must return a valid
 * value, enabling versioned/defensive reads.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  parse?: (raw: unknown) => T,
): [T, (value: Updater<T>) => void] {
  const parseRef = useRef(parse)
  parseRef.current = parse

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) return initialValue
      const raw: unknown = JSON.parse(stored)
      return parseRef.current ? parseRef.current(raw) : (raw as T)
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage may be unavailable (private mode / quota). Fail silently.
    }
  }, [key, value])

  const set = useCallback((next: Updater<T>) => {
    setValue((prev) =>
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next,
    )
  }, [])

  return [value, set]
}
