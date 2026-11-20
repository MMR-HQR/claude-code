/**
 * MockWonderProvider — deterministic, pre-written practice replies.
 * It never pretends to be a live model: every reply carries provenance 'mock',
 * and anything outside its tiny scripted domain gets the honest practice message.
 * Context-aware: it reads prior turns to follow a thread (e.g. a pretend cheek eye).
 */
import { checkGuardrails } from './guardrails';
import { type ConversationProvider, type WonderContext, type WonderReply, UNKNOWN_TEXT } from './provider';

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ')} `;
const any = (s: string, words: string[]) => words.some((w) => s.includes(` ${w} `) || (w.includes(' ') && s.includes(w)));

type Topic = 'eye_move' | 'two_eyes' | 'third_eye' | 'third_eye_blink' | 'eyelashes' | 'blink';

function contextTopics(ctx: WonderContext): Set<Topic> {
  const seen = new Set<Topic>();
  for (const t of ctx.priorTurns) {
    if (t.speaker !== 'child' || !t.text) continue;
    const topic = classify(norm(t.text), seen);
    if (topic) seen.add(topic);
  }
  return seen;
}

function classify(s: string, seen: Set<Topic>): Topic | null {
  const thirdEyeContext = seen.has('third_eye') || seen.has('third_eye_blink');
  const imaginaryEye = any(s, ['third eye', '3rd eye', 'extra eye', 'another eye', 'new eye', 'eye on my cheek', 'cheek eye']) || (any(s, ['cheek', 'elbow', 'knee', 'hand']) && any(s, ['eye', 'eyes']));
  const blink = any(s, ['blink', 'blinks', 'blinking']);
  const lashes = any(s, ['eyelash', 'eyelashes', 'lashes']);
  const ownIdea = any(s, ['by itself', 'on its own', 'its own', 'no eyelashes', "doesn't have", 'doesnt have', 'without', 'all by itself']);

  if ((thirdEyeContext || imaginaryEye) && (blink || ownIdea || lashes)) return 'third_eye_blink';
  if (imaginaryEye) return 'third_eye';
  if (lashes) return 'eyelashes';
  if (blink) return 'blink';
  if (any(s, ['two eyes', '2 eyes', 'both eyes', 'two of them', 'one eye'])) return 'two_eyes';
  if (any(s, ['eye', 'eyes', 'eyeball', 'eyeballs']) && any(s, ['move', 'moves', 'moving', 'look around', 'turn', 'roll', 'muscle', 'muscles'])) return 'eye_move';
  return null;
}

function replyFor(topic: Topic, seen: Set<Topic>, ageBand: string): Omit<WonderReply, 'provenance'> {
  const young = ageBand === '3-4';
  switch (topic) {
    case 'eye_move':
      return young
        ? { text: 'Each eye has six tiny muscles, like little strings. They pull to make your eye look up, down, and side to side.', suggestedExperiment: 'Follow my finger with just your eyes, and keep your head still.' }
        : { text: 'Each eye has six small muscles attached to it, a bit like strings on a puppet. They pull in teams to turn your eye up, down, and side to side, very fast.', suggestedExperiment: 'Want to try? Keep your head still and follow a finger with only your eyes. Those muscles are doing the work.' };
    case 'two_eyes': {
      const tie = seen.has('eye_move') ? ' Those eye muscles help both eyes point at the same thing so the pictures line up.' : '';
      return {
        text: `Your two eyes see from slightly different spots, and your brain puts the two pictures together. That helps you tell how near or far things are.${tie}`,
        suggestedExperiment: 'You could try closing one eye and touching two fingertips together. Is it trickier?',
      };
    }
    case 'third_eye':
      return {
        text: "Ooh, that's a pretend idea, and a fun one to imagine. A cheek eye would see from lower down, so maybe it could peek under the table while your other two eyes look up at the sky.",
        suggestedExperiment: 'What would your cheek eye like to look at?',
      };
    case 'third_eye_blink': {
      const where = seen.has('third_eye') ? 'your cheek eye' : 'your extra eye';
      return {
        text: `In our pretend game, ${where} blinks all by itself, whenever it decides to. In real life, eyelashes help keep dust out of eyes, so an eye with no eyelashes might need to blink extra to stay clean. Maybe that's why it blinks on its own!`,
      };
    }
    case 'eyelashes':
      return { text: 'Eyelashes are like a tiny fence. They help catch dust and bits in the air before they get into your eyes.', suggestedExperiment: 'Next time you look in a mirror, see if you can spot how they curl.' };
    case 'blink':
      return { text: 'Blinking spreads tears across your eyes to keep them wet and clean. Most of the time you do it without even thinking about it.' };
  }
}

export class MockWonderProvider implements ConversationProvider {
  readonly id = 'mock' as const;

  async respond({ questionText, context }: { questionText: string; context: WonderContext }): Promise<WonderReply> {
    const text = (questionText ?? '').trim();
    if (!text) return { text: UNKNOWN_TEXT, uncertainty: true, provenance: { provider: 'mock', ruleId: 'mock.no_text' } };

    const guard = checkGuardrails(text);
    if (guard) return { ...guard.reply, provenance: { provider: 'mock', ruleId: guard.id, guardrail: guard.id } };

    const seen = contextTopics(context);
    const topic = classify(norm(text), seen);
    if (!topic) return { text: UNKNOWN_TEXT, uncertainty: true, provenance: { provider: 'mock', ruleId: 'mock.unknown' } };
    return { ...replyFor(topic, seen, context.ageBand), provenance: { provider: 'mock', ruleId: `mock.${topic}` } };
  }
}

/** Spoken form: answer first, then at most ONE optional invitation. */
export function spokenText(r: Pick<WonderReply, 'text' | 'suggestedExperiment'>): string {
  return r.suggestedExperiment ? `${r.text} ${r.suggestedExperiment}` : r.text;
}
