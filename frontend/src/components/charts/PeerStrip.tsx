import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useMemo } from 'react'
import { axisBase, echarts, FONT, tokens, tooltipBase } from '@/lib/echarts'

interface Peer {
  entity_code: string
  value: number
}

/**
 * Where this entity sits among its peers on one metric: every peer as a grey dot
 * (deterministically jittered), the entity highlighted and labelled, and the peer median
 * as a reference line. "Highlight one, grey the rest."
 */
export function PeerStrip({
  peers,
  entityCode,
  median,
  format,
  height = 130,
}: {
  peers: Peer[]
  entityCode: string
  median: number | null
  format: (v: number) => string
  height?: number
}) {
  const option = useMemo(() => {
    const t = tokens()
    const jitter = (code: string) => {
      let h = 0
      for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 997
      return (h / 997) * 0.8 - 0.4
    }
    const others = peers.filter((p) => p.entity_code !== entityCode)
    const self = peers.find((p) => p.entity_code === entityCode)
    // Keep the entity's label inside the plot: anchor it away from the nearer edge.
    const values = peers.map((p) => p.value)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const nearRight = self !== undefined && hi > lo && (self.value - lo) / (hi - lo) > 0.5
    return {
      grid: { left: 12, right: 24, top: 18, bottom: 28 },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'item',
        formatter: (p: { data: [number, number, string] }) => `${p.data[2]}: <b>${format(p.data[0])}</b>`,
      },
      xAxis: {
        type: 'value',
        scale: true,
        ...axisBase(t),
        splitLine: { show: false },
        axisLabel: { color: t.muted, fontSize: 10, formatter: (v: number) => format(v) },
      },
      yAxis: { type: 'value', min: -1, max: 1, show: false },
      series: [
        {
          type: 'scatter',
          symbolSize: 9,
          itemStyle: { color: t.context, borderColor: t.surface, borderWidth: 2 },
          data: others.map((p) => [p.value, jitter(p.entity_code), p.entity_code]),
          markLine:
            median === null
              ? undefined
              : {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: t.median, width: 1.5, type: 'solid' },
                  label: { show: false }, // the median value is shown in the figures above
                  data: [{ xAxis: median }],
                },
        },
        {
          type: 'scatter',
          symbolSize: 16,
          z: 3,
          itemStyle: { color: t.entity, borderColor: t.surface, borderWidth: 2 },
          label: {
            show: true,
            formatter: `${entityCode} · ${self ? format(self.value) : ''}`,
            position: 'top',
            align: nearRight ? 'right' : 'left',
            color: t.ink,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: FONT,
          },
          data: self ? [[self.value, 0, self.entity_code]] : [],
        },
      ],
    }
  }, [peers, entityCode, median, format])

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height, width: '100%' }} notMerge />
}
