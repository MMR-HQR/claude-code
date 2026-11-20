import { WonderDB, setDatabase } from '../../src/lib/db';
import { uuid } from '../../src/lib/ids';
import { addProfile, createFamily } from '../../src/lib/journal';

export function freshDb() {
  const d = new WonderDB(`test-${uuid()}`);
  setDatabase(d);
  return d;
}

export async function family(name = 'Family A') {
  const f = await createFamily(name);
  const p = await addProfile(f.id, 'Pip', '5-6');
  return { family: f, profile: p };
}

export const fakeAudio = (n = 2048, seed = 7) => new Uint8Array(n).map((_, i) => (i * seed + 13) & 255).buffer;
