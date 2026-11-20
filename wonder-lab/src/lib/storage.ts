/** Storage durability helpers. IndexedDB is never described as permanent. */
export async function storageStatus(): Promise<{ persisted: boolean | null; usage?: number; quota?: number }> {
  const s = navigator.storage;
  if (!s) return { persisted: null };
  const [persisted, est] = await Promise.all([s.persisted?.().catch(() => null) ?? null, s.estimate?.().catch(() => undefined)]);
  return { persisted, usage: est?.usage, quota: est?.quota };
}

export async function requestPersistence(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persist?.()) ?? null;
  } catch {
    return null;
  }
}

export function formatBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function downloadBytes(bytes: Uint8Array | ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([bytes instanceof Uint8Array ? bytes.slice() : bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
