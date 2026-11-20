/**
 * Synthetic north-star script (blueprint §2A). Because this slice has NO speech-to-text
 * (sending child audio to an STT vendor is gated), in "practice script" mode each real
 * recording is paired with the next scripted line as its transcript, labelled
 * textSource='demo_script' everywhere so nobody mistakes it for recognised speech.
 */
export const CHEEK_EYE_SCRIPT = [
  'How do my eyes move?',
  'Why do people have two eyes?',
  'What if I had a third eye on my cheek?',
  'It blinks all by itself and it has no eyelashes!',
] as const;
