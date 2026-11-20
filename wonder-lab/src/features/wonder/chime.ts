/** Two soft tones for state changes (start/stop listening). Silent if audio is unavailable. */
let ctx: AudioContext | null = null;
export function chime(kind: 'start' | 'stop') {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    const now = ctx.currentTime;
    const notes = kind === 'start' ? [523.25, 783.99] : [783.99, 523.25];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.09);
      g.gain.linearRampToValueAtTime(0.08, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.35);
      o.connect(g).connect(ctx!.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.4);
    });
  } catch { /* decorative only */ }
}
