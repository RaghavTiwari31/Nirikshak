/**
 * ECharts, tree-shaken to the chart types Nirikshak uses, plus a shared base theme that
 * reads the CSS design tokens so charts match the rest of the UI in both themes.
 */
import { BarChart, GraphChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
])

export { echarts }

export const FONT = 'Inter Variable, system-ui, sans-serif'

/** Resolve design tokens at render time (canvas cannot read CSS variables itself). */
export function tokens() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    surface: v('--surface'),
    surface2: v('--surface-2'),
    ink: v('--ink'),
    muted: v('--muted'),
    line: v('--line'),
    entity: v('--viz-entity'),
    series2: v('--viz-series-2'),
    series3: v('--viz-series-3'),
    context: v('--viz-context'),
    median: v('--viz-median'),
    grid: v('--viz-grid'),
    axis: v('--viz-axis'),
    seqLow: v('--viz-seq-low'),
    seqHigh: v('--viz-seq-high'),
    warning: v('--sev-medium'),
    serious: v('--sev-high'),
    critical: v('--sev-critical'),
    low: v('--sev-low'),
    ok: v('--ok'),
    accent: v('--accent'),
    ink2: v('--ink-2'),
  }
}

export type Tokens = ReturnType<typeof tokens>

/** Shared tooltip look: a light card with a soft shadow, matching the app's tooltips. */
export function tooltipBase(t: Tokens) {
  return {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    padding: [12, 14],
    textStyle: { color: t.ink, fontSize: 13, fontFamily: FONT, lineHeight: 20 },
    extraCssText:
      'border-radius:14px;box-shadow:0 12px 32px -8px rgb(31 35 40 / 0.22),0 2px 6px rgb(31 35 40 / 0.06);',
  }
}

/** Recessive axes: hairline, muted labels, no ticks. */
export function axisBase(t: Tokens) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 12, fontFamily: FONT },
    splitLine: { lineStyle: { color: t.grid } },
  }
}

