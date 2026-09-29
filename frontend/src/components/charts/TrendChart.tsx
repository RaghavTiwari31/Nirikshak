import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useMemo } from 'react'
import { axisBase, echarts, FONT, tokens, tooltipBase } from '@/lib/echarts'

export interface TrendLine {
  name: string
  values: (number | null)[]
  role: 'focus-1' | 'focus-2' | 'focus-3' | 'median' | 'context'
}

/**
 * One metric over time on ONE axis. Focus series take the first three categorical slots
 * (validated all-pairs); the peer median is a neutral reference; every other entity is a
 * faint context line. A crosshair tooltip reads all focused values at a month.
 */
export function TrendChart({
  periods,
  lines,
  format,
  height = 260,
  compact = false,
}: {
  periods: string[]
  lines: TrendLine[]
  format: (v: number) => string
  height?: number
  compact?: boolean
}) {
  const option = useMemo(() => {
    const t = tokens()
    const color = { 'focus-1': t.entity, 'focus-2': t.series2, 'focus-3': t.series3, median: t.median, context: t.context }
    const labels = periods.map((p) =>
      new Date(p).toLocaleDateString('en-IN', { month: 'short', year: compact ? undefined : '2-digit' }),
    )
    const ordered = [...lines].sort((a, b) => (a.role === 'context' ? -1 : b.role === 'context' ? 1 : 0))
    return {
      grid: { left: compact ? 48 : 56, right: compact ? 12 : 100, top: 18, bottom: 30 },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t.axis } },
        formatter: (ps: { seriesName: string; value: number | null; color: string; axisValueLabel: string }[]) => {
          const shown = ps.filter((p) => p.value !== null && !p.seriesName.startsWith('ctx:'))
          if (!shown.length) return ''
          return (
            `<div style="color:${t.muted};margin-bottom:4px">${ps[0]?.axisValueLabel ?? ''}</div>` +
            shown
              .map(
                (p) =>
                  `<div><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${p.color};margin-right:6px"></span>${p.seriesName}: <b>${format(p.value as number)}</b></div>`,
              )
              .join('')
          )
        },
      },
      xAxis: { type: 'category', data: labels, boundaryGap: false, ...axisBase(t), splitLine: { show: false } },
      yAxis: {
        type: 'value',
        ...axisBase(t),
        axisLine: { show: false },
        axisLabel: { color: t.muted, fontSize: 12, fontFamily: FONT, formatter: (v: number) => format(v) },
        splitNumber: compact ? 3 : 5,
      },
      series: ordered.map((l) => {
        const isFocus = l.role.startsWith('focus')
        return {
          name: l.role === 'context' ? `ctx:${l.name}` : l.name,
          type: 'line',
          data: l.values,
          connectNulls: false,
          showSymbol: isFocus && !compact,
          symbolSize: 8,
          silent: l.role === 'context',
          z: isFocus ? 3 : l.role === 'median' ? 2 : 1,
          lineStyle: {
            width: l.role === 'context' ? 1 : 2,
            type: l.role === 'median' ? ('dashed' as const) : ('solid' as const),
            color: color[l.role],
            opacity: l.role === 'context' ? 0.35 : 1,
          },
          itemStyle: { color: color[l.role], borderColor: t.surface, borderWidth: 2 },
          endLabel:
            isFocus && !compact
              ? { show: true, formatter: l.name, color: t.ink, fontSize: 12, fontWeight: 500, fontFamily: FONT }
              : undefined,
          labelLayout: isFocus ? { moveOverlap: 'shiftY' } : undefined, // end labels never collide
          emphasis: { disabled: l.role === 'context' },
        }
      }),
    }
  }, [periods, lines, format, compact])

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} notMerge />
}
