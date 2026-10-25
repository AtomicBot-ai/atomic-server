/** The approved Atomic mark uses the same stroke width and rounded caps on every ray. */
export function AtomicMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
      {[0, 45, 90, 135].map((angle) => (
        <rect
          key={angle}
          x="-54"
          y="-11"
          width="108"
          height="22"
          rx="11"
          fill="currentColor"
          transform={`rotate(${angle})`}
        />
      ))}
    </svg>
  )
}
