import { useEffect, useState } from 'react';
import type { MediaAsset } from '../lib/db';
import { downloadBytes } from '../lib/storage';
import { formatDuration } from '../lib/media';
import { Icon } from './Icon';

/** Plays the ORIGINAL stored bytes via a local object URL (never a network URL). */
export function AudioClip({ asset, label, download = true }: { asset: MediaAsset; label: string; download?: boolean }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mimeType }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [asset]);
  return (
    <div className="clip">
      {url && <audio controls preload="metadata" src={url} aria-label={label} />}
      <span className="clip-meta">{formatDuration(asset.durationMs)} · {asset.ext}{asset.synthetic ? ' · synthetic tone' : ''}</span>
      {download && (
        <button type="button" className="icon-btn" onClick={() => downloadBytes(asset.bytes, `tinkadoo-${asset.id}.${asset.ext}`, asset.mimeType)} aria-label={`Download original recording: ${label}`} title="Download original">
          <Icon name="download" size={20} />
        </button>
      )}
    </div>
  );
}
