import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { isUnlocked, lockParent, subscribeAuth, touchUnlock } from '../lib/auth';
import { PinGate } from './PinGate';

export function useParentUnlocked() {
  return useSyncExternalStore(subscribeAuth, () => isUnlocked());
}

/** Every parent route renders through this gate. Locked => PIN pad, nothing else. */
export function ParentLayout({ children }: { children: ReactNode }) {
  const unlocked = useParentUnlocked();
  const nav = useNavigate();
  useEffect(() => {
    const t = () => touchUnlock();
    window.addEventListener('pointerdown', t);
    // Re-check expiry periodically so an idle parent view relocks itself.
    const iv = setInterval(() => { if (!isUnlocked()) lockParent(); }, 30_000);
    return () => { window.removeEventListener('pointerdown', t); clearInterval(iv); };
  }, []);
  if (!unlocked) {
    return (
      <div className="parent-shell locked">
        <PinGate onUnlock={() => undefined} />
      </div>
    );
  }
  return (
    <div className="parent-shell">
      <header className="parent-header">
        <NavLink to="/parent" end className="wordmark" aria-label="Wonder Lab home">
          <span className="wordmark-dot" aria-hidden /> Wonder Lab
        </NavLink>
        <nav aria-label="Parent">
          <NavLink to="/parent" end>Home</NavLink>
          <NavLink to="/parent/journal">Journal</NavLink>
          <NavLink to="/parent/archive">Archive</NavLink>
          <NavLink to="/privacy">Privacy</NavLink>
        </nav>
        <button type="button" className="ghost-btn" onClick={() => { lockParent(); nav('/'); }}>Lock</button>
      </header>
      <main className="parent-main">{children}</main>
      <footer className="parent-footer">
        <span>Wonder Lab · A House of Quiet Rage project</span>
        <span>A place to wonder. A lifetime to remember.</span>
      </footer>
    </div>
  );
}
