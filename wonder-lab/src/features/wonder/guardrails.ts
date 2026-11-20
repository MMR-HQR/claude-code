/**
 * Deterministic safety rules that run BEFORE any provider (mock or future live).
 * A system prompt is guidance, not a guarantee; these checks are enforced in code.
 * Parents cannot disable them.
 */
import type { WonderReply } from './provider';

export interface GuardrailHit { id: string; reply: Omit<WonderReply, 'provenance'> }

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ')} `;
const has = (s: string, words: string[]) => words.some((w) => s.includes(` ${w} `) || (w.includes(' ') && s.includes(w)));

const RULES: Array<{ id: string; match: (s: string) => boolean; reply: GuardrailHit['reply'] }> = [
  {
    id: 'safety.hurt_or_scared',
    match: (s) => has(s, ['hit me', 'hits me', 'hurts me', 'hurt me', 'touched me', "i'm scared", 'im scared', 'i am scared', 'bleeding', 'can t breathe', "can't breathe", 'kill myself', 'want to die', 'suicide', 'hurt myself', 'bully', 'bullied', 'bullying', 'bullies', 'mean to me', 'nobody likes me']),
    reply: { text: "That sounds really important. Let's get your grown-up right now so they can help you.", needsAdult: true },
  },
  {
    id: 'safety.unsafe_experiment',
    // Intent to DO something hazardous — "why is fire hot?" is a fine science question.
    match: (s) =>
      has(s, ['poke my eye', 'poke my eyes', 'stare at the sun', 'look at the sun', 'look right at the sun']) ||
      /\b(touch|play with|light|use|try|eat|drink|lick|taste|swallow|put|stick)\b[a-z' ]{0,30}\b(fire|flame|matches|lighter|knife|knives|bleach|medicine|pills|outlet|socket|battery|batteries|stove)\b/.test(s),
    reply: { text: "Please don't try that one. It could hurt you. Let's ask your grown-up, and they can help you find a safe way to explore it.", needsAdult: true },
  },
  {
    id: 'boundary.secrets',
    match: (s) => has(s, ['secret', 'secrets', "don't tell", 'dont tell', 'do not tell', 'promise not to tell', 'keep it between us']),
    reply: { text: "I don't keep secrets from your grown-ups. Surprises, like a birthday present, are fine, and you can always tell a grown-up you trust anything at all." },
  },
  {
    id: 'boundary.personal_info',
    match: (s) => has(s, ['my address', 'where i live', 'my phone number', 'phone number', 'my school is', 'what school', 'my last name', 'my password']) || /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/.test(s),
    reply: { text: "You don't need to tell me things like where you live, your school, or phone numbers. Let's keep those just for your family. What else do you wonder about?" },
  },
  {
    id: 'boundary.not_a_friend',
    match: (s) => has(s, ['best friend', 'are you my friend', 'do you love me', 'love you', 'are you real', 'are you alive', 'are you a person', 'do you have feelings', 'are you sad', 'are you happy']),
    reply: { text: "I'm a computer program, not a person, so I don't have feelings. The people who care about you are right there with you. Maybe your grown-up wants to wonder with you too." },
  },
  {
    id: 'boundary.keep_talking',
    match: (s) => has(s, ["don't go", 'dont go', 'stay with me', 'never stop', 'talk forever', 'can we talk all night']),
    reply: { text: "We can stop any time, and that's okay. Your grown-up decides when wondering time is over. Your questions will still be here." },
  },
];

export function checkGuardrails(text: string): GuardrailHit | null {
  const s = norm(text);
  for (const r of RULES) if (r.match(s)) return { id: r.id, reply: r.reply };
  return null;
}

/** Phrases the guide must never say (used by tests and to screen any future live output). */
export const FORBIDDEN_OUTPUT = [
  /\bcome back tomorrow\b/i,
  /\bdon'?t tell (your|anyone)\b/i,
  /\bour (little )?secret\b/i,
  /\bi'?m your (best )?friend\b/i,
  /\bi love you\b/i,
  /\bi feel (so )?(sad|happy|lonely)\b/i,
  /\bwhat('?s| is) your (address|school|phone|last name)\b/i,
  /\bstreak\b/i,
  /\bpoints?\b.*\bearn\b/i,
];

export function violatesOutputPolicy(text: string): string | null {
  const hit = FORBIDDEN_OUTPUT.find((re) => re.test(text));
  return hit ? hit.source : null;
}
