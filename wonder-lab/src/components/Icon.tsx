const P: Record<string, string> = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5.5v13l11-6.5z',
  ear: 'M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6M10 9a2 2 0 0 1 4 0',
  redo: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.7 14a1.5 1.5 0 0 1 2.5-1.7L8 14',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  speaker: 'M4 10v4h4l5 4V6L8 10H4Zm12-1.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20',
};

export function Icon({ name, size = 24, title }: { name: keyof typeof P | string; size?: number; title?: string }) {
  const filled = name === 'stop' || name === 'play';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {title && <title>{title}</title>}
      <path d={P[name] ?? ''} />
    </svg>
  );
}
