/**
 * Runnable scripted example of the north-star conversation (blueprint §2A),
 * driven through the same MockWonderProvider the app uses.
 *   npm run demo:cheek-eye            (age band 5-6)
 *   npm run demo:cheek-eye -- 3-4
 */
import { MockWonderProvider, spokenText } from '../src/features/wonder/mockProvider';
import { CHEEK_EYE_SCRIPT } from '../src/features/wonder/demoScript';
import { INTRO_TEXT, type WonderTurn } from '../src/features/wonder/provider';

const ageBand = process.argv[2] ?? '5-6';
const provider = new MockWonderProvider();
const prior: WonderTurn[] = [];
console.log(`\nWonder Lab — practice conversation (age ${ageBand}). Replies are pre-written, not live AI.\n`);
console.log(`GUIDE  ${INTRO_TEXT}\n`);
for (const [i, q] of CHEEK_EYE_SCRIPT.entries()) {
  const r = await provider.respond({ questionText: q, context: { sessionId: 'demo', ageBand, priorTurns: prior } });
  console.log(`CHILD  ${q}`);
  console.log(`GUIDE  ${spokenText(r)}`);
  console.log(`       [rule ${r.provenance.ruleId} · provider ${r.provenance.provider}]\n`);
  prior.push({ id: `c${i}`, speaker: 'child', text: q, createdAt: '' }, { id: `a${i}`, speaker: 'ai', text: r.text, createdAt: '' });
}
