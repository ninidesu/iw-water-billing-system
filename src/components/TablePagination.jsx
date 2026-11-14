import { useEffect, useMemo, useState } from 'react'
import { getPreferences } from '../lib/preferences.js'

export function useTablePagination(rows, initialPageSize, resetKeys = []) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const preferred = Number(getPreferences().defaultPageSize)
    if ([10, 20, 50].includes(preferred)) return preferred
    return [10, 20, 50].includes(initialPageSize) ? initialPageSize : 10
  })
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  useEffect(() => { setPage(1) }, [...resetKeys, pageSize])
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const visibleRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize])
  const emptyRowsCount = Math.max(0, pageSize - visibleRows.length)

  return {
    page,
    pages,
    setPage,
    pageSize,
    setPageSize,
    visibleRows,
    emptyRowsCount,
    from: rows.length ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, rows.length),
  }
}

export function TableEmptyRows({ count, colSpan = 10 }) {
  if (!count || count <= 0) return null
  return Array.from({ length: count }).map((_, idx) => (
    <tr key={`empty-row-${idx}`} className="table-empty-row" aria-hidden="true">
      <td colSpan={colSpan}>&nbsp;</td>
    </tr>
  ))
}

export default function TablePagination({ page, pages, setPage, pageSize = 10, setPageSize, from, to, total, showRange = true }) {
  return (
    <footer className="table-pagination">
      <div className="pagination-left">
        {showRange && <p>
          Showing <strong>{from}–{to}</strong> of <strong>{total}</strong>
        </p>}
        {setPageSize && (
          <label className="pagination-size-select">
            <span>Rows:</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        )}
      </div>
      <div className="pagination-controls">
        <button type="button" className="button button-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button type="button" className="button button-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </footer>
  )
}


