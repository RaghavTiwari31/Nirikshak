import ReactEChartsCore from 'echarts-for-react/lib/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ScoreOut } from '@/api/supervise'
import { echarts, FONT, tokens, tooltipBase } from '@/lib/echarts'
import { SECTOR_LABEL } from '@/lib/labels'
import { BAND_LABEL, saiBand } from '@/lib/severity'

const HUB_RADIUS = 0.3
const BASE = HUB_RADIUS + 0.12 // where a zero-attention entity sits
const SPAN = 0.6 // extra distance for an attention score of 100
const ARC = (Math.PI / 3) * 0.74 // angular span each sector's entities share
const EXTENT = 1.04

const radiusFor = (sai: number) => BASE + SPAN * (sai / 100)

function ring(r: number, steps = 120): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / steps
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

/**
 * Entity constellation, laid out deterministically (stable across renders): sector hubs sit
 * on an inner ring; each entity sits on its sector's arc at a distance from the centre set
 * by its attention score. Dashed guide rings mark scores of 25, 50 and 75 (the Watch,
 * Attention and Priority thresholds), so distance can be read directly. Colour and a band word in the tooltip
 * repeat the band; the ranked list beside the chart is its table twin.
 */
export function Constellation({ items, height = 600 }: { items: ScoreOut[]; height?: number }) {
  const navigate = useNavigate()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const option = useMemo(() => {
    const t = tokens()
    const bandColor = {
      1: t.low,
      2: t.warning,
      3: t.serious,
      4: t.critical,
    } as const
    const sectors = [...new Set(items.map((i) => i.sector))].sort()
    const angleOf = (j: number) => (2 * Math.PI * j) / sectors.length - Math.PI / 2
    // Square plot so rings stay circular, leaving room either side for entity labels.
    const plot = Math.max(260, Math.min(height - 40, (width || 800) - 190))

    const hubs = sectors.map((s, j) => {
      const a = angleOf(j)
      return {
        id: `sector:${s}`,
        name: SECTOR_LABEL[s] ?? s,
        value: [Math.cos(a) * HUB_RADIUS, Math.sin(a) * HUB_RADIUS],
        symbolSize: 8,
        itemStyle: { color: t.surface, borderColor: t.ink2, borderWidth: 1.5 },
        label: {
          show: true,
          color: t.ink2,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: FONT,
          position: 'bottom' as const,
          distance: 7,
          backgroundColor: t.surface,
          padding: [2, 5],
          borderRadius: 4,
        },
        tooltip: { show: false },
      }
    })

    const entities = sectors.flatMap((s, j) => {
      const members = items.filter((i) => i.sector === s).sort((a, b) => a.entity_code.localeCompare(b.entity_code))
      return members.map((e, k) => {
        const a = angleOf(j) + ((k + 0.5) / members.length - 0.5) * ARC
        const r = radiusFor(e.sai)
        const x = Math.cos(a) * r
        const band = saiBand(e.sai)
        return {
          id: e.entity_code,
          name: e.entity_code,
          value: [x, Math.sin(a) * r],
          symbolSize: 10 + e.sai * 0.2,
          itemStyle: {
            color: bandColor[band],
            borderColor: t.surface,
            borderWidth: 2.5,
          },
          label: {
            show: e.sai >= 50,
            color: t.ink,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: FONT,
            position: (x >= 0 ? 'right' : 'left') as 'right' | 'left',
            distance: 6,
          },
          entity: e,
        }
      })
    })

    const guides = [25, 50, 75].map((sai) => ({
      type: 'line' as const,
      silent: true,
      symbol: 'none',
      z: 0,
      data: ring(radiusFor(sai)),
      lineStyle: { color: t.axis, width: 1, type: [4, 5] as number[] },
    }))

    return {
      grid: { top: 24, bottom: 24, left: 'center', width: plot, height: plot },
      xAxis: { type: 'value', min: -EXTENT, max: EXTENT, show: false },
      yAxis: {
        type: 'value',
        min: -EXTENT,
        max: EXTENT,
        show: false,
        inverse: true,
      },
      tooltip: {
        ...tooltipBase(t),
        formatter: (p: { data?: { entity?: ScoreOut } }) => {
          const e = p.data?.entity
          if (!e) return ''
          const drivers = e.drivers
            .slice(0, 3)
            .map((d) => `<div style="color:${t.ink2};margin-top:2px">• ${d.title}</div>`)
            .join('')
          return `<div style="font-weight:600;font-size:14px">${e.entity_name}</div>
            <div style="color:${t.muted};margin-bottom:8px">${e.entity_code} · ranked #${e.rank}</div>
            <div>Attention score <b>${e.sai.toFixed(0)}</b> · ${BAND_LABEL[saiBand(e.sai)]}</div>
            <div style="color:${t.muted};margin:6px 0 2px">${e.findings} finding(s), led by:</div>${drivers}
            <div style="color:${t.muted};margin-top:8px;font-size:12px">Click to open the entity</div>`
        },
      },
      series: [
        ...guides,
        {
          type: 'graph',
          coordinateSystem: 'cartesian2d',
          z: 2,
          data: [...hubs, ...entities],
          links: items.map((e) => ({
            source: e.entity_code,
            target: `sector:${e.sector}`,
            lineStyle: { color: t.line, opacity: 0.9, width: 1 },
          })),
          emphasis: {
            focus: 'adjacency',
            scale: 1.15,
            lineStyle: { width: 1.5, color: t.muted },
          },
          blur: { itemStyle: { opacity: 0.25 }, lineStyle: { opacity: 0.1 } },
          labelLayout: { hideOverlap: true },
        },
      ],
    }
  }, [items, height, width])
  const chartHeight = Math.max(300, Math.min(height, (width || 800) - 150))

  return (
    <div ref={box}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: chartHeight, width: '100%' }}
        notMerge
        onEvents={{
          click: (p: { data?: { entity?: ScoreOut } }) => {
            if (p.data?.entity) navigate(`/entities/${p.data.entity.entity_code}`)
          },
        }}
        aria-label="Entity map: sectors on an inner ring; entities sit further out the higher their attention score"
      />
    </div>
  )
}
