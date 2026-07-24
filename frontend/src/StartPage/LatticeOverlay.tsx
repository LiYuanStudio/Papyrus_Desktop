const LatticeOverlay = ({ opacity = 0.06 }: { opacity?: number }) => (
  <svg
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      opacity,
      pointerEvents: 'none',
    }}
    xmlns='http://www.w3.org/2000/svg'
    preserveAspectRatio='xMidYMid slice'
  >
    <defs>
      <pattern id='lattice' x='0' y='0' width='40' height='40' patternUnits='userSpaceOnUse'>
        <rect x='0' y='0' width='40' height='40' fill='none' stroke='currentColor' strokeWidth='1' />
        <line x1='20' y1='0' x2='20' y2='40' stroke='currentColor' strokeWidth='0.5' />
        <line x1='0' y1='20' x2='40' y2='20' stroke='currentColor' strokeWidth='0.5' />
      </pattern>
    </defs>
    <rect width='100%' height='100%' fill='url(#lattice)' />
  </svg>
);

export default LatticeOverlay;