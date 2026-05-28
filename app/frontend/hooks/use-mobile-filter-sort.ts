import * as React from "react"

/**
 * Shared state + handlers for the mobile filter / sort sheets used by every
 * admin upload page. Keeps the per-page wiring to a single call so the list of
 * filter keys lives in ONE place (the `filterKeys` argument) instead of being
 * hand-maintained in onReset, onApply, and activeFilterCount on every page.
 *
 * Usage:
 *
 *   const {
 *     filterOpen, setFilterOpen,
 *     sortOpen,   setSortOpen,
 *     activeFilterCount,
 *     applyFilters, resetFilters,
 *   } = useMobileFilterSort(filters, navigate, ["region", "year", "month", "status", "search"])
 *
 *   <MobileFilterSheet
 *     open={filterOpen} onOpenChange={setFilterOpen}
 *     initial={{ region: filters.region ?? "", … }}
 *     onApply={applyFilters}
 *     onReset={resetFilters}
 *   >…</MobileFilterSheet>
 */
export function useMobileFilterSort<F extends Record<string, string | undefined | null>>(
  filters: F,
  navigate: (overrides: Record<string, string | number | null>) => void,
  filterKeys: ReadonlyArray<keyof F>,
) {
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [sortOpen,   setSortOpen]   = React.useState(false)

  const activeFilterCount = filterKeys.reduce((n, k) => {
    return filters[k] ? n + 1 : n
  }, 0)

  const applyFilters = React.useCallback(
    (draft: Record<string, string>) => {
      const overrides: Record<string, string | number | null> = { page: null }
      for (const k of filterKeys) {
        const key = k as string
        overrides[key] = draft[key] || null
      }
      navigate(overrides)
      setFilterOpen(false)
    },
    [filterKeys, navigate],
  )

  const resetFilters = React.useCallback(() => {
    const overrides: Record<string, string | number | null> = { page: null }
    for (const k of filterKeys) {
      overrides[k as string] = null
    }
    navigate(overrides)
    setFilterOpen(false)
  }, [filterKeys, navigate])

  return {
    filterOpen,
    setFilterOpen,
    sortOpen,
    setSortOpen,
    activeFilterCount,
    applyFilters,
    resetFilters,
  }
}
