import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useMemo } from 'react'
import type { EntityCoverage } from '@/api/supervise'
import { axisBase, echarts, FONT, tokens, tooltipBase } from '@/lib/echarts'
import { ASSET_LABEL } from '@/lib/labels'

/** Coverage bins, shared with the colour key: 0 as expected · 1 partial · 2 low · 3 none (hole). */
function bin(c: EntityCoverage['cells'][number]): number {
  if (c.missing || (c.ratio ?? 1) === 0) return 3
  const r = c.ratio ?? 1
  if (r >= 0.8) return 0
  if (r >= 0.4) return 1
  return 2
}

/**
 * Expected-vs-observed evidence for one entity: kinds of alert × kinds of machine. Each cell
 * is coloured by its coverage bin (blue as expected · gold partial · orange low · wine none)
 * and prints its percentage, so the colour is never the only carrier; holes also carry ✕.
 */
export function CoverageHeatmap({ data }: { data: EntityCoverage }) {
  const option = useMemo(() => {
    const t = tokens()
    const css = getComputedStyle(document.documentElement)
    const colors = ['--health-good', '--health-fair', '--health-poor', '--health-bad'].map((v) =>
      css.getPropertyValue(v).trim(),
    )
    const x = data.asset_types
    const y = [...data.categories].reverse()
    const labelOf = Object.fromEntries(data.cells.map((c) => [c.category, c.category_label]))
    const cells = data.cells
      .filter((c) => c.expected >= 1 || c.observed > 0)
      .map((c) => {
        const b = bin(c)
        const pct = Math.round(Math.min(c.ratio ?? 1, 9.99) * 100)
        return {
          value: [x.indexOf(c.asset_type), y.indexOf(c.category), b],
          cell: c,
          itemStyle: { color: colors[b], borderColor: t.surface, borderWidth: 3, borderRadius: 6 },
          label: {
            show: true,
            formatter: c.missing ? '✕' : pct > 999 ? '999%+' : `${pct}%`,
            color: b === 1 ? t.ink : '#ffffff',
            fontSize: c.missing ? 14 : 11,
            fontWeight: 600,
            fontFamily: FONT,
          },
        }
      })
    return {
      grid: { left: 210, right: 16, top: 8, bottom: 60 },
      tooltip: {
        ...tooltipBase(t),
        formatter: (p: { data: { cell: EntityCoverage['cells'][number] } }) => {
          const c = p.data.cell
          const status = c.missing
            ? `<div style="color:${t.critical};font-weight:600;margin-top:6px">Hole: none reported where others would expect some</div>`
            : ''
          return `<div style="font-weight:600">${c.category_label}</div>
            <div style="color:${t.muted};margin-bottom:6px">on ${ASSET_LABEL[c.asset_type] ?? c.asset_type}</div>
            <div>Reported <b>${c.observed}</b> · others would expect about <b>${c.expected.toFixed(0)}</b></div>${status}`
        },
      },
      xAxis: {
        type: 'category',
        data: x.map((a) => ASSET_LABEL[a] ?? a),
        ...axisBase(t),
        axisLabel: { color: t.ink2, fontSize: 12, fontFamily: FONT, interval: 0, rotate: 28 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: y.map((k) => labelOf[k] ?? k),
        ...axisBase(t),
        axisLabel: { color: t.ink2, fontSize: 12, fontFamily: FONT },
        splitLine: { show: false },
        // Faint row stripes make rows easy to follow across blank (not applicable) cells.
        splitArea: { show: true, areaStyle: { color: ['transparent', t.surface2] } },
      },
      // ECharts heatmaps need a visualMap; this one maps the four bins to their colours (hidden:
      // the page shows the colour key).
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 2,
        pieces: colors.map((color, i) => ({ value: i, color })),
      },
      series: [{ type: 'heatmap', data: cells, emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 2 } } }],
    }
  }, [data])

  const height = Math.max(340, data.categories.length * 36 + 90)
  return <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} notMerge />
}
