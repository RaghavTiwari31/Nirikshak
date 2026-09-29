import { useEffect, useMemo, useState } from 'react'

export const PAGE_SIZE = 10

/** Client-side paging: the current slice plus controls. Resets to page 1 when the list changes size. */
export function usePage<T>(items: T[], size = PAGE_SIZE, resetKey?: unknown) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / size))
  useEffect(() => setPage(1), [items.length, resetKey])
  const current = Math.min(page, pages)
  const slice = useMemo(() => items.slice((current - 1) * size, current * size), [items, current, size])
  return { page: current, pages, setPage, slice, total: items.length, size }
}
