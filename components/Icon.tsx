const P: Record<string, string> = {
  check: 'M20 6 9 17l-5-5',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  play: 'M6 4l14 8-14 8V4z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  file: 'M14 2H6v20h12V8l-4-6z M14 2v6h6 M9 13h6 M9 17h6',
  box: 'M21 16V8l-9-5-9 5v8l9 5 9-5z M3.3 7l8.7 5 8.7-5 M12 22V12',
  bulb: 'M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
  alert: 'M12 3 2 20h20L12 3z M12 10v5 M12 18h.01',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01',
  present: 'M2 3h20v13H2z M12 16v5 M8 21h8',
  x: 'M18 6 6 18 M6 6l12 12',
  term: 'M4 17l6-6-6-6 M12 19h8',
  server: 'M3 4h18v6H3z M3 14h18v6H3z M7 7h.01 M7 17h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};

export default function Icon({ name, className = 'h-4 w-4' }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name] ?? ''} />
    </svg>
  );
}
