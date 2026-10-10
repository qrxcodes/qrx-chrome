/** The QRX mark: three finder squares and a blue X. Strokes follow the text colour so it works in dark mode. */
export function Mark({ title = 'QRX' }: { title?: string }) {
  return (
    <svg viewBox="0 0 17 17" role="img" aria-label={title}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="0.75" y="0.75" width="5.5" height="5.5" rx="1.6" />
        <rect x="10.75" y="0.75" width="5.5" height="5.5" rx="1.6" />
        <rect x="0.75" y="10.75" width="5.5" height="5.5" rx="1.6" />
      </g>
      <g fill="currentColor">
        <rect x="2.25" y="2.25" width="2.5" height="2.5" rx="0.6" />
        <rect x="12.25" y="2.25" width="2.5" height="2.5" rx="0.6" />
        <rect x="2.25" y="12.25" width="2.5" height="2.5" rx="0.6" />
      </g>
      <path
        d="M11.4 11.4L15.6 15.6M15.6 11.4L11.4 15.6"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
