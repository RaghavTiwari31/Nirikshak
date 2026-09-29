import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useMemo } from 'react'
import { axisBase, echarts, FONT, tokens, tooltipBase } from '@/lib/echarts'

export interface YieldData {
  k: number[]
  tool: number[]
  oracle: number[]
  random_mean: number[]
  random_p05: number[]
  random_p95: number[]
}

/**
 * Detection yield: share of weakened entities found after examining k entities, in
 * the tool's order vs no informed order (random, simulated: mean + 5–95% band) vs a perfect
 * oracle. One axis, one unit (% found). The 80% target is a reference line.
 */
export function YieldChart({ data, target = 0.8, height = 340 }: { data: YieldData; target?: number; height?: number }) {
  const option = useMemo(() => {
    const t = tokens()
    const pct = (v: number) => `${Math.round(v * 100)}%`
    return {
      grid: { left: 52, right: 24, top: 16, bottom: 44 }, // legend is HTML, above the chart
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t.axis } },
        formatter: (ps: { seriesName: string; value: number; color: string; axisValue: number }[]) => {
          const k = ps[0]?.axisValue ?? 0
          const rows = ps
            .filter((p) => !p.seriesName.startsWith('band'))
            .map(
              (p) =>
                `<div><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${p.color};margin-right:6px"></span>${p.seriesName}: <b>${pct(p.value)}</b></div>`,
            )
            .join('')
          return `<div style="color:${t.muted};margin-bottom:4px">After examining ${k} entities</div>${rows}`
        },
      },
      xAxis: {
        type: 'category',
        data: data.k,
        boundaryGap: false,
        name: 'entities reviewed',
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { color: t.muted, fontSize: 12, fontFamily: FONT },
        ...axisBase(t),
        splitLine: { show: false },
        axisLabel: { color: t.muted, fontSize: 12, fontFamily: FONT, interval: 4 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        ...axisBase(t),
        axisLine: { show: false },
        axisLabel: { color: t.muted, fontSize: 12, fontFamily: FONT, formatter: pct },
      },
      series: [
        // 5–95% band of random orderings, drawn as a stacked area (lower edge invisible).
        {
          name: 'band-low',
          type: 'line',
          data: data.random_p05,
          stack: 'band',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          silent: true,
        },
        {
          name: 'band-width',
          type: 'line',
          data: data.random_p95.map((v, i) => v - (data.random_p05[i] ?? 0)),
          stack: 'band',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { color: t.context, opacity: 0.28 },
          silent: true,
        },
        {
          name: 'Random order',
          type: 'line',
          data: data.random_mean,
          symbol: 'none',
          lineStyle: { color: t.median, width: 2 },
          itemStyle: { color: t.median },
        },
        {
          name: 'Best possible order',
          type: 'line',
          data: data.oracle,
          symbol: 'none',
          lineStyle: { color: t.context, width: 1 },
          itemStyle: { color: t.context },
        },
        {
          name: 'Tool’s order',
          type: 'line',
          data: data.tool,
          symbol: 'none',
          z: 5,
          lineStyle: { color: t.entity, width: 2.5 },
          itemStyle: { color: t.entity },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: t.axis, width: 1, type: 'solid' },
            label: { formatter: `${pct(target)} of problems found`, color: t.ink2, fontSize: 12, fontFamily: FONT, position: 'insideStartTop' },
            data: [{ yAxis: target }],
          },
        },
      ],
    }
  }, [data, target])

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} notMerge />
}
