import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useScores } from '@/api/supervise'
import { EntityTable } from '@/components/EntityTable'
import { Page, PageHeader } from '@/components/supervise'
import { Card, CardHeader, inputClass } from '@/components/ui'
import { SECTOR_LABEL } from '@/lib/labels'

export function EntitiesPage() {
  const { data } = useScores()
  const [sector, setSector] = useState('')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.items ?? []).filter(
      (e) =>
        (!sector || e.sector === sector) && (!q || `${e.entity_code} ${e.entity_name}`.toLowerCase().includes(q)),
    )
  }, [data, sector, query])

  return (
    <Page>
      <PageHeader eyebrow="Supervise" title="Entities">
        Every entity in this assessment, most urgent first. Filter by attention level or sector, open an entity, or
        use the arrow at the end of a row for a quick look.
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader
          title="All Entities"
          subtitle={`Showing ${rows.length} of ${data?.items.length ?? 0}`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-56 max-w-full">
                <select className={inputClass} value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
                  <option value="">All sectors</option>
                  {Object.entries(SECTOR_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <label className="relative w-72 max-w-full">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
                <input
                  className={clsx(inputClass, 'pl-10')}
                  placeholder="Search by name or code"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
          }
        />
        <EntityTable items={rows} />
      </Card>
    </Page>
  )
}
