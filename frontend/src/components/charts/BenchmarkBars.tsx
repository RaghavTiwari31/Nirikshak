import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import type { Benchmark } from '@/api/supervise'
import { axisBase, echarts, FONT, tokens, tooltipBase } from '@/lib/echarts'

/**
 * Every entity's value on one metric, sorted. One series, one colour (peers in the
 * context grey); a chosen entity is highlighted; the peer median is a reference line.
 */
export function BenchmarkBars({
  data,
  highlight,
  format,
  bandOf,
}: {
  data: Benchmark
  highlight: string | null
  format: (v: number) => string
  /** Attention band (1–4) per entity; bars take the band's colour. */
  bandOf?: Record<string, number>
}) {
  const navigate = useNavigate()
  const points = data.points
  const option = useMemo(() => {
    const t = tokens()
    const ordered = [...points].reverse() // largest at the top
    const bandColor: Record<number, string> = { 1: t.low, 2: t.warning, 3: t.serious, 4: t.critical }
    const colorOf = (code: string) => {
      const b = bandOf?.[code]
      return b ? bandColor[b] : undefined
    }
    return {
      grid: { left: 110, right: 72, top: 32, bottom: 28 }, // top room for the median label
      tooltip: {
        ...tooltipBase(t),
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const pt = ordered[p.dataIndex]
          if (!pt) return ''
          return `<div style="font-weight:600">${pt.entity_code}${pt.rank ? ` · #${pt.rank}` : ''}</div>
            <div style="color:${t.muted}">${pt.entity_name}</div><div><b>${format(pt.value)}</b></div>`
        },
      },
      xAxis: {
        type: 'value',
        ...axisBase(t),
        axisLabel: { color: t.muted, fontSize: 12, fontFamily: FONT, formatter: (v: number) => format(v) },
      },
      yAxis: {
        type: 'category',
        data: ordered.map((p) => p.entity_code),
        ...axisBase(t),
        splitLine: { show: false },
        axisLabel: {
          fontSize: 12,
          fontFamily: FONT,
          color: (code?: string | number) => (code === highlight ? t.ink : t.muted),
          fontWeight: (code?: string | number) => (code === highlight ? 600 : 400),
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: '58%',
          data: ordered.map((p) => ({
            value: p.value,
            itemStyle: {
              color: colorOf(p.entity_code) ?? (p.entity_code === highlight ? t.entity : t.context),
              opacity: highlight && p.entity_code !== highlight ? 0.78 : 1,
              borderColor: p.entity_code === highlight ? t.ink : undefined,
              borderWidth: p.entity_code === highlight ? 2 : 0,
              borderRadius: [0, 4, 4, 0],
            },
            label:
              p.entity_code === highlight
                ? { show: true, position: 'right', formatter: format(p.value), color: t.ink, fontSize: 12, fontWeight: 600 }
                : { show: false },
          })),
          markLine:
            data.median === null
              ? undefined
              : {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: t.median, width: 1.5, type: 'dashed' },
                  label: { formatter: `typical ${format(data.median)}`, color: t.ink2, fontSize: 12, fontFamily: FONT },
                  data: [{ xAxis: data.median }],
                },
        },
      ],
    }
  }, [points, highlight, format, data.median, bandOf])

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: Math.max(340, points.length * 24 + 60), width: '100%' }}
      notMerge
      onEvents={{
        click: (p: { name?: string }) => {
          if (p.name) navigate(`/entities/${p.name}`)
        },
      }}
    />
  )
}
