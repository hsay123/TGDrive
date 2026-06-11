import { useState, useEffect, useRef } from 'react'
import type { VFSFile } from '../types'

export function useSearch(query: string) {
  const [results, setResults] = useState<VFSFile[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (query.length <= 1) {
      setResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    timerRef.current = setTimeout(async () => {
      try {
        const result = await window.televault.files.search(query)
        if (result.success && result.data) {
          setResults(result.data)
        } else {
          setResults([])
        }
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [query])

  return { results, isSearching }
}
