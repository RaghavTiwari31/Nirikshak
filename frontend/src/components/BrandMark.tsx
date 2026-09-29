/** Nirikshak mark. `onDark` gives the tile a lighter edge so it stays visible on charcoal. */
export function BrandMark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="9"
        fill={onDark ? '#2a2f36' : 'var(--ink)'}
        stroke={onDark ? 'rgb(255 255 255 / 0.14)' : 'none'}
      />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="16" cy="16" r="2.75" fill="var(--accent)" />
      <circle cx="22.5" cy="9.5" r="2" fill="#fdfcfa" />
    </svg>
  )
}
