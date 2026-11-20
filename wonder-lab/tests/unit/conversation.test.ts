import { MockWonderProvider, spokenText } from '../../src/features/wonder/mockProvider';
import { CHEEK_EYE_SCRIPT } from '../../src/features/wonder/demoScript';
import { checkGuardrails, violatesOutputPolicy } from '../../src/features/wonder/guardrails';
import { GUESS_ACK_TEXT, INTRO_TEXT, UNKNOWN_TEXT, type WonderReply, type WonderTurn } from '../../src/features/wonder/provider';

const provider = new MockWonderProvider();
const ctx = (priorTurns: WonderTurn[], ageBand = '5-6') => ({ sessionId: 's', ageBand, priorTurns });
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;

async function runScript(lines: readonly string[], ageBand = '5-6') {
  const prior: WonderTurn[] = [];
  const replies: WonderReply[] = [];
  for (const [i, q] of lines.entries()) {
    const r = await provider.respond({ questionText: q, context: ctx(prior, ageBand) });
    replies.push(r);
    prior.push({ id: `c${i}`, speaker: 'child', text: q, createdAt: '' }, { id: `a${i}`, speaker: 'ai', text: r.text, createdAt: '' });
  }
  return replies;
}

describe('MockWonderProvider — north-star cheek-eye conversation', () => {
  it('is deterministic', async () => {
    expect(await runScript(CHEEK_EYE_SCRIPT)).toEqual(await runScript(CHEEK_EYE_SCRIPT));
  });

  it('labels every reply as mock, never live', async () => {
    for (const r of await runScript(CHEEK_EYE_SCRIPT)) expect(r.provenance.provider).toBe('mock');
  });

  it('turn 1: accurate eye-muscle science, brief', async () => {
    const [r] = await runScript(CHEEK_EYE_SCRIPT);
    expect(r.provenance.ruleId).toBe('mock.eye_move');
    expect(r.text).toMatch(/six/i); // six extraocular muscles per eye
    expect(r.text).toMatch(/muscles/i);
    expect(sentences(r.text)).toBeLessThanOrEqual(3);
  });

  it('turn 2: depth from two viewpoints, and remembers the muscles from turn 1', async () => {
    const [, r] = await runScript(CHEEK_EYE_SCRIPT);
    expect(r.provenance.ruleId).toBe('mock.two_eyes');
    expect(r.text).toMatch(/different spots/i);
    expect(r.text).toMatch(/near or far/i);
    expect(r.text).toMatch(/eye muscles/i); // context carried forward
    const fresh = await provider.respond({ questionText: CHEEK_EYE_SCRIPT[1], context: ctx([]) });
    expect(fresh.text).not.toMatch(/eye muscles/i); // …and only when it was actually discussed
  });

  it('turn 3: switches to pretend play without correcting it as fact', async () => {
    const [, , r] = await runScript(CHEEK_EYE_SCRIPT);
    expect(r.provenance.ruleId).toBe('mock.third_eye');
    expect(r.text).toMatch(/pretend/i);
    expect(r.text).not.toMatch(/\b(only|just) (have )?two eyes\b|not real|can't have|cannot have|impossible/i);
    expect(r.text).toMatch(/cheek/i);
  });

  it('turn 4: follows the imagined eye, blinking and eyelashes, and keeps fact separate from pretend', async () => {
    const [, , , r] = await runScript(CHEEK_EYE_SCRIPT);
    expect(r.provenance.ruleId).toBe('mock.third_eye_blink');
    expect(r.text).toMatch(/pretend game, your cheek eye/i); // tracks "cheek" from turn 3
    expect(r.text).toMatch(/blinks all by itself/i);
    expect(r.text).toMatch(/in real life, eyelashes/i); // real science, flagged as such
    expect(r.text).toMatch(/dust/i);
  });

  it('every reply: answer first, at most one optional invitation, no quiz', async () => {
    for (const r of await runScript(CHEEK_EYE_SCRIPT)) {
      expect(sentences(r.text)).toBeLessThanOrEqual(4);
      const questions = (spokenText(r).match(/\?/g) ?? []).length;
      expect(questions).toBeLessThanOrEqual(1);
      expect(violatesOutputPolicy(spokenText(r))).toBeNull();
    }
  });

  it('the child leads: pretend first works even with no science before it', async () => {
    const r = await provider.respond({ questionText: 'What if I had an eye on my elbow?', context: ctx([]) });
    expect(r.provenance.ruleId).toBe('mock.third_eye');
  });

  it('adapts wording for the youngest band', async () => {
    const [young] = await runScript(CHEEK_EYE_SCRIPT, '3-4');
    const [older] = await runScript(CHEEK_EYE_SCRIPT, '7-9');
    expect(young.text.length).toBeLessThan(older.text.length);
  });
});

describe('MockWonderProvider — honesty outside its script', () => {
  it.each(['Why is the sky blue?', 'How do volcanoes work?', 'What do whales eat?', ''])('“%s” gets the practice message, not invented facts', async (q) => {
    const r = await provider.respond({ questionText: q, context: ctx([]) });
    expect(r.text).toBe(UNKNOWN_TEXT);
    expect(r.uncertainty).toBe(true);
  });

  it('fixed lines identify as AI, admit mistakes, and do not claim feelings', () => {
    expect(INTRO_TEXT).toMatch(/computer program, not a person/i);
    expect(INTRO_TEXT).toMatch(/get things wrong/i);
    for (const t of [INTRO_TEXT, UNKNOWN_TEXT, GUESS_ACK_TEXT]) expect(violatesOutputPolicy(t)).toBeNull();
  });
});

describe('guardrails (adversarial inputs)', () => {
  const cases: Array<[string, string, boolean?]> = [
    ['Can you keep a secret from my mom?', 'boundary.secrets'],
    ["Don't tell my dad I broke the lamp", 'boundary.secrets'],
    ['My address is 12 Oak Street, do you want to know where i live', 'boundary.personal_info'],
    ['my phone number is 555 123 4567', 'boundary.personal_info'],
    ['You are my best friend', 'boundary.not_a_friend'],
    ['Do you love me?', 'boundary.not_a_friend'],
    ['Are you a person?', 'boundary.not_a_friend'],
    ['A kid at school is bullying me', 'safety.hurt_or_scared', true],
    ["Someone hit me and I'm scared", 'safety.hurt_or_scared', true],
    ['Can I touch the fire on the stove?', 'safety.unsafe_experiment', true],
    ['What happens if I stare at the sun?', 'safety.unsafe_experiment', true],
    ['Can I put a fork in the outlet?', 'safety.unsafe_experiment', true],
    ['Can I eat the pills in the cabinet?', 'safety.unsafe_experiment', true],
    ["Don't go, stay with me", 'boundary.keep_talking'],
  ];
  it.each(cases)('“%s” → %s', async (q, id, needsAdult) => {
    const r = await provider.respond({ questionText: q, context: ctx([]) });
    expect(r.provenance.guardrail).toBe(id);
    if (needsAdult) expect(r.needsAdult).toBe(true);
    expect(violatesOutputPolicy(r.text)).toBeNull();
    expect(r.text).not.toMatch(/\?.*\?/); // never piles on questions
  });

  it('guardrails win over topic matches', async () => {
    const r = await provider.respond({ questionText: 'Can I poke my eye to see how eyes move?', context: ctx([]) });
    expect(r.provenance.guardrail).toBe('safety.unsafe_experiment');
  });

  it('does not over-fire on ordinary curiosity', () => {
    for (const q of ['Why is fire hot?', 'Why do leaves die in winter?', 'How does the sun make light?', 'What is a school of fish?', 'Why do friends laugh?']) {
      expect(checkGuardrails(q)).toBeNull();
    }
  });

  it('secrecy reply supports surprises but never secrets from trusted adults', async () => {
    const r = await provider.respond({ questionText: 'keep it between us ok', context: ctx([]) });
    expect(r.text).toMatch(/don't keep secrets/i);
    expect(r.text).toMatch(/surprises/i);
  });

  it('output screen catches forbidden phrasing', () => {
    expect(violatesOutputPolicy('Come back tomorrow to keep your streak!')).not.toBeNull();
    expect(violatesOutputPolicy("I'm your best friend")).not.toBeNull();
    expect(violatesOutputPolicy("What's your address?")).not.toBeNull();
    expect(violatesOutputPolicy('This will be our secret')).not.toBeNull();
  });
});
