/**
 * SERVER-ONLY. Fail-closed gate for any live AI / STT / TTS provider (blueprint §8, §8A, Gate C).
 * This file must never be imported by browser code (lint + test enforce that src/ does not import server/).
 *
 * There is intentionally NO live provider implementation here. A real adapter must be written
 * against the chosen vendor's current, documented SDK after Gate C sign-off — not guessed.
 */
export interface LiveGateEnv {
  LIVE_AI_ENABLED?: string;
  PROVIDER_PRIVACY_APPROVED?: string;
  LIVE_AI_PROVIDER?: string;
  AI_PROVIDER_API_KEY?: string;
}
export interface ConsentState { providerProcessingGranted: boolean; revoked: boolean; policyVersion?: string }

export type GateDecision = { allowed: true; provider: string } | { allowed: false; reasons: string[] };

/** Approved provider identifiers. Empty until a provider passes Gate C. */
export const APPROVED_PROVIDERS: readonly string[] = [];

export function evaluateLiveGate(env: LiveGateEnv, consent: ConsentState | null): GateDecision {
  const reasons: string[] = [];
  if (env.LIVE_AI_ENABLED !== 'true') reasons.push('LIVE_AI_ENABLED is not "true"');
  if (env.PROVIDER_PRIVACY_APPROVED !== 'true') reasons.push('PROVIDER_PRIVACY_APPROVED is not "true"');
  const provider = (env.LIVE_AI_PROVIDER ?? 'none').trim();
  if (!provider || provider === 'none') reasons.push('LIVE_AI_PROVIDER is not set');
  else if (!APPROVED_PROVIDERS.includes(provider)) reasons.push(`provider "${provider}" has not passed Gate C`);
  if (!env.AI_PROVIDER_API_KEY) reasons.push('AI_PROVIDER_API_KEY missing');
  if (!consent) reasons.push('no provider-processing consent record');
  else {
    if (!consent.providerProcessingGranted) reasons.push('provider-processing consent not granted');
    if (consent.revoked) reasons.push('provider-processing consent revoked');
  }
  return reasons.length ? { allowed: false, reasons } : { allowed: true, provider };
}
