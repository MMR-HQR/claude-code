/** Provider contracts (blueprint §8). Live implementations live server-side only. */
export type WonderTurn = { id: string; speaker: 'child' | 'parent' | 'ai'; text?: string; audioAssetId?: string; createdAt: string };
export type WonderContext = { sessionId: string; ageBand: string; familyValues?: string[]; priorTurns: WonderTurn[] };
export type WonderReply = {
  text: string;
  suggestedExperiment?: string;
  needsAdult?: boolean;
  uncertainty?: boolean;
  /** Up to two optional "explore next" ideas, shown as tappable cards. Never spoken as a push to continue. */
  explore?: string[];
  /** Always present so the UI and archive can say truthfully where a reply came from. */
  provenance: { provider: 'mock' | 'live'; ruleId: string; guardrail?: string };
};

export interface ConversationProvider {
  readonly id: 'mock' | 'live';
  respond(input: { questionText: string; context: WonderContext }): Promise<WonderReply>;
}
export interface TranscriptionProvider {
  transcribe(audio: Uint8Array, mimeType: string): Promise<{ text: string; confidence?: number }>;
}
export interface SpeechProvider {
  readonly available: boolean;
  speak(text: string): Promise<'spoken' | 'unavailable' | 'cancelled'>;
  cancel(): void;
}

export const INTRO_TEXT =
  "Hi, I'm TT! I'm a computer program, not a person, and sometimes I get things wrong. Tap the big button and tell me what you're wondering about.";

export const UNKNOWN_TEXT = "This is a practice conversation. Let's ask your grown-up to explore that one together.";

export const GUESS_ACK_TEXT = "That's your own idea. Your grown-up can listen to it later, and you can keep wondering whenever you like.";
