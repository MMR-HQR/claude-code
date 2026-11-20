import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type MediaAsset, type Profile, type Turn, type WonderSession } from '../lib/db';
import { appendTurn, discardDraftRecording, getLiveSession, saveDraftRecording, setSessionStatus, touchSession, reviewTurn } from '../lib/journal';
import { AudioRecorder, RecorderError, type RecorderErrorCode } from '../lib/recorder';
import { formatDuration } from '../lib/media';
import { MockWonderProvider, spokenText } from '../features/wonder/mockProvider';
import { CHEEK_EYE_SCRIPT } from '../features/wonder/demoScript';
import { GUESS_ACK_TEXT, INTRO_TEXT, type WonderTurn } from '../features/wonder/provider';
import { speech } from '../features/wonder/speech';
import { chime } from '../features/wonder/chime';
import { Icon } from '../components/Icon';
import { PinGate } from '../components/PinGate';

type Phase = 'loading' | 'idle' | 'requesting' | 'listening' | 'review' | 'awaiting_adult' | 'thinking' | 'speaking' | 'error' | 'locked';
type RecKind = 'question' | 'guess';

const provider = new MockWonderProvider();
const AI_LABEL = 'Wonder Lab (practice)';

const ERROR_COPY: Record<RecorderErrorCode, { child: string; adult: string }> = {
  denied: { child: 'The microphone is asleep.', adult: 'Microphone permission is off. On iPad: Settings › Apps › Safari › Microphone → Ask or Allow (or the “aA” menu › Website Settings). Then tap Try again.' },
  insecure: { child: 'The microphone can’t wake up here.', adult: 'Microphones only work on a secure page (https:// or localhost). Open Wonder Lab from its https address.' },
  unsupported: { child: 'This screen can’t record.', adult: 'This browser has no audio recording support. Use Safari on iPadOS or a current Chrome.' },
  no_mic: { child: 'No microphone found.', adult: 'No microphone was detected. Check that one is connected and not disabled.' },
  busy: { child: 'The microphone is busy.', adult: 'Another app may be using the microphone (a call, Voice Memos). Close it and try again.' },
  empty: { child: 'I didn’t hear anything.', adult: 'The recording was empty. Try again a little closer to the iPad.' },
  unknown: { child: 'Something went wobbly.', adult: 'The recording could not start. Try again; if it keeps happening, reload the page.' },
};

export function WonderRoom() {
  const { sessionId = '' } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<WonderSession>();
  const [profile, setProfile] = useState<Profile>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [caption, setCaption] = useState<string>('');
  const [captionKind, setCaptionKind] = useState<'ai' | 'parent' | 'none'>('none');
  const [elapsed, setElapsed] = useState(0);
  const [errCode, setErrCode] = useState<RecorderErrorCode | null>(null);
  const [paused, setPaused] = useState(false);
  const [pinFor, setPinFor] = useState<'resume' | 'leave' | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [takeover, setTakeover] = useState(false);
  const [adultText, setAdultText] = useState('');
  const [soundOff, setSoundOff] = useState(false);
  const [draftUrl, setDraftUrl] = useState<string>();
  const [saveError, setSaveError] = useState<string | null>(null);

  const recorder = useRef<AudioRecorder | null>(null);
  const draft = useRef<MediaAsset | null>(null);
  const recKind = useRef<RecKind>('question');
  const ringRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number>(0);
  const lastAi = useRef<Turn | null>(null);
  const draftAudio = useRef<HTMLAudioElement | null>(null);

  const reloadTurns = useCallback(async (memoryId: string) => {
    const t = await db.turns.where('memoryId').equals(memoryId).sortBy('turnIndex');
    setTurns(t);
    return t;
  }, []);

  const lock = useCallback(() => {
    recorder.current?.cancel();
    speech.cancel();
    setPhase('locked');
  }, []);

  const say = useCallback(async (text: string, kind: 'ai' | 'parent' = 'ai') => {
    setCaption(text);
    setCaptionKind(kind);
    setPhase('speaking');
    const r = await speech.speak(text);
    if (r === 'unavailable') setSoundOff(true);
    setPhase((p) => (p === 'speaking' ? 'idle' : p));
  }, []);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getLiveSession(sessionId);
      if (cancelled) return;
      if (!s) return setPhase('locked');
      setSession(s);
      setProfile(await db.profiles.get(s.profileId));
      if (s.status === 'ended' || s.status === 'expired') return setPhase('locked');
      if (s.status === 'paused') setPaused(true);
      const t = await reloadTurns(s.memoryId);
      lastAi.current = [...t].reverse().find((x) => x.speaker === 'ai') ?? null;
      // Recover a recording that was captured but never sent (reload, crash, backgrounding).
      const orphan = (await db.media.where('memoryId').equals(s.memoryId).toArray()).find((m) => m.state === 'draft' && !m.turnId && m.kind === 'child_audio');
      if (orphan) {
        draft.current = orphan;
        setDraftUrl(URL.createObjectURL(new Blob([orphan.bytes], { type: orphan.mimeType })));
        return setPhase('review');
      }
      if (t.length === 0) {
        const intro = await appendTurn({ memoryId: s.memoryId, speaker: 'ai', speakerLabel: AI_LABEL, kind: 'intro', originalText: INTRO_TEXT, textSource: 'mock_provider', meta: { provider: 'mock' } });
        setTurns([intro]);
        if (!cancelled && s.status === 'active') void say(INTRO_TEXT);
        else setPhase('idle');
      } else {
        if (lastAi.current?.originalText) { setCaption(lastAi.current.originalText); setCaptionKind('ai'); }
        setPhase('idle');
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, reloadTurns, say]);

  // ---------------------------------------------------------------- lifecycle guards
  useEffect(() => {
    const iv = setInterval(async () => {
      const s = await getLiveSession(sessionId);
      if (!s || s.status === 'ended' || s.status === 'expired') lock();
    }, 15_000);
    return () => clearInterval(iv);
  }, [sessionId, lock]);

  useEffect(() => () => {
    recorder.current?.cancel();
    speech.cancel();
    cancelAnimationFrame(raf.current);
  }, []);

  useEffect(() => () => { if (draftUrl) URL.revokeObjectURL(draftUrl); }, [draftUrl]);

  // ---------------------------------------------------------------- recording
  const meter = useCallback(() => {
    const r = recorder.current;
    if (!r) return;
    ringRef.current?.style.setProperty('--level', r.level().toFixed(3));
    setElapsed(r.elapsedMs());
    raf.current = requestAnimationFrame(meter);
  }, []);

  async function startRecording(kind: RecKind) {
    if (!session || paused) return;
    speech.cancel();
    void touchSession(session.id);
    recKind.current = kind;
    setErrCode(null);
    setSaveError(null);
    setPhase('requesting');
    const r = new AudioRecorder();
    recorder.current = r;
    r.onAutoStop = () => void stopRecording();
    try {
      await r.start();
      chime('start');
      setElapsed(0);
      setPhase('listening');
      raf.current = requestAnimationFrame(meter);
    } catch (e) {
      recorder.current = null;
      setErrCode(e instanceof RecorderError ? e.code : 'unknown');
      setPhase('error');
    }
  }

  async function stopRecording() {
    const r = recorder.current;
    if (!r || !session) return;
    recorder.current = null;
    cancelAnimationFrame(raf.current);
    try {
      const audio = await r.stop();
      chime('stop');
      // Commit to IndexedDB BEFORE anything else happens.
      const asset = await saveDraftRecording({ familyId: session.familyId, profileId: session.profileId, memoryId: session.memoryId }, audio);
      draft.current = asset;
      setDraftUrl(URL.createObjectURL(new Blob([asset.bytes], { type: asset.mimeType })));
      setPhase('review');
    } catch (e) {
      if (e instanceof RecorderError) { setErrCode(e.code); setPhase('error'); }
      else { setSaveError((e as Error).message); setErrCode('unknown'); setPhase('error'); }
    }
  }

  // Backgrounding / screen lock mid-recording: keep what we have.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return;
      if (recorder.current) void stopRecording();
      speech.cancel();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  function hearDraft() {
    if (!draftUrl) return;
    draftAudio.current?.pause();
    const a = new Audio(draftUrl);
    draftAudio.current = a;
    void a.play().catch(() => undefined);
  }

  async function dropDraft() {
    draftAudio.current?.pause();
    if (draft.current) await discardDraftRecording(draft.current.id);
    draft.current = null;
    setDraftUrl(undefined);
  }

  async function doOver() {
    await dropDraft();
    await startRecording(recKind.current);
  }

  async function dontSave() {
    await dropDraft();
    setPhase('idle');
  }

  function priorContext(t: Turn[]): WonderTurn[] {
    return t.filter((x) => x.kind !== 'intro').map((x) => ({ id: x.id, speaker: x.speaker, text: x.originalText ?? undefined, createdAt: x.createdAt }));
  }

  async function send() {
    if (!session) return;
    draftAudio.current?.pause();
    void touchSession(session.id);
    if (recKind.current === 'guess') {
      const child = await appendTurn({ memoryId: session.memoryId, speaker: 'child', speakerLabel: profile?.displayName ?? 'Explorer', kind: 'guess', originalText: null, textSource: 'none', audioAssetId: draft.current?.id });
      draft.current = null;
      const ai = await appendTurn({ memoryId: session.memoryId, speaker: 'ai', speakerLabel: AI_LABEL, kind: 'answer', originalText: GUESS_ACK_TEXT, textSource: 'mock_provider', replyToTurnId: child.id, meta: { provider: 'mock' } });
      lastAi.current = ai;
      await reloadTurns(session.memoryId);
      return say(GUESS_ACK_TEXT);
    }
    if (session.questionSource === 'parent_typed') {
      setAdultText('');
      return setPhase('awaiting_adult');
    }
    const asked = turns.filter((t) => t.speaker === 'child' && t.kind === 'question').length;
    const line = CHEEK_EYE_SCRIPT[asked] ?? null;
    await answerQuestion(line, line ? 'demo_script' : 'none', line ? asked + 1 : undefined);
  }

  async function answerQuestion(text: string | null, source: 'demo_script' | 'parent_typed' | 'none', scriptStep?: number, parentWillAnswer = false) {
    if (!session) return;
    const child = await appendTurn({
      memoryId: session.memoryId, speaker: 'child', speakerLabel: profile?.displayName ?? 'Explorer', kind: 'question',
      originalText: text, textSource: source, audioAssetId: draft.current?.id, meta: scriptStep ? { scriptStep } : undefined,
    });
    draft.current = null;
    setDraftUrl(undefined);
    const all = await reloadTurns(session.memoryId);
    if (parentWillAnswer) { setPhase('idle'); setTakeover(true); return; }
    setPhase('thinking');
    setCaption('');
    const started = Date.now();
    const reply = await provider.respond({ questionText: text ?? '', context: { sessionId: session.id, ageBand: profile?.ageBand ?? '5-6', priorTurns: priorContext(all.filter((t) => t.id !== child.id)) } });
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
    const spoken = spokenText(reply);
    const ai = await appendTurn({
      memoryId: session.memoryId, speaker: 'ai', speakerLabel: AI_LABEL, kind: 'answer', originalText: spoken, textSource: 'mock_provider', replyToTurnId: child.id,
      meta: { provider: 'mock', uncertainty: reply.uncertainty, needsAdult: reply.needsAdult, suggestedExperiment: reply.suggestedExperiment, guardrail: reply.provenance.guardrail },
    });
    lastAi.current = ai;
    await reloadTurns(session.memoryId);
    await say(spoken);
  }

  // ---------------------------------------------------------------- grown-up controls
  async function pause() {
    if (!session) return;
    if (recorder.current) await stopRecording();
    speech.cancel();
    await setSessionStatus(session.id, 'paused');
    setPaused(true);
  }

  async function resumeAfterPin() {
    if (!session) return;
    await setSessionStatus(session.id, 'active');
    setPinFor(null);
    setPaused(false);
  }

  async function endSession() {
    if (!session) return;
    if (recorder.current) await stopRecording();
    speech.cancel();
    await setSessionStatus(session.id, 'ended');
    setConfirmEnd(false);
    setPaused(false);
    setPhase('locked');
  }

  async function notRight() {
    if (lastAi.current) await reviewTurn(lastAi.current.id, 'rejected');
    speech.cancel();
    setTakeover(true);
  }

  // ---------------------------------------------------------------- render
  if (phase === 'locked') {
    return (
      <div className="wonder-room locked-room">
        <div className="sky" aria-hidden />
        {pinFor === 'leave' ? (
          <PinGate tone="dark" title="Grown-up unlock" subtitle="Enter your PIN to review this session" onUnlock={() => nav(session ? `/parent/journal/${session.memoryId}` : '/parent', { replace: true })} onCancel={() => setPinFor(null)} />
        ) : (
          <div className="locked-msg">
            <div className="moon" aria-hidden />
            <h1>Wondering time is finished.</h1>
            <button className="adult-chip" onClick={() => setPinFor('leave')}><Icon name="lock" size={18} /> Grown-up</button>
          </div>
        )}
      </div>
    );
  }

  const childTurns = turns.filter((t) => t.speaker === 'child');
  const hasAsked = childTurns.length > 0;
  const big = (() => {
    switch (phase) {
      case 'listening': return { label: 'Done', icon: 'stop', aria: 'Stop recording', on: () => void stopRecording(), disabled: false };
      case 'requesting': return { label: 'Getting ready', icon: 'mic', aria: 'Getting the microphone ready', on: () => undefined, disabled: true };
      case 'thinking': return { label: 'Thinking', icon: 'bulb', aria: 'Wonder Lab is thinking', on: () => undefined, disabled: true };
      case 'loading': return { label: '', icon: 'mic', aria: 'Loading', on: () => undefined, disabled: true };
      default: return { label: hasAsked ? 'Keep wondering' : 'Ask!', icon: 'mic', aria: hasAsked ? 'Keep wondering: ask another question' : 'Ask a question', on: () => void startRecording('question'), disabled: paused };
    }
  })();
  const showBig = phase !== 'review' && phase !== 'error' && phase !== 'awaiting_adult';

  return (
    <div className={`wonder-room phase-${phase}`} data-phase={phase}>
      <div className="sky" aria-hidden />

      <header className="adult-strip" aria-label="Grown-up controls">
        <span className="practice-chip" title="Replies are pre-written examples. No live AI. Nothing leaves this device.">Practice mode · not live AI</span>
        <div className="adult-actions">
          {phase === 'idle' && lastAi.current && lastAi.current.kind === 'answer' && (
            <button className="adult-chip" onClick={notRight}>Not right</button>
          )}
          <button className="adult-chip" onClick={() => { speech.cancel(); setTakeover(true); }}><Icon name="hand" size={18} /> I’ll answer</button>
          <button className="adult-chip" onClick={pause}><Icon name="pause" size={18} /> Pause</button>
          <button className="adult-chip" onClick={() => setConfirmEnd(true)}><Icon name="x" size={18} /> End</button>
        </div>
      </header>

      <main className="stage">
        <p className="state-word" aria-live="polite">
          {phase === 'listening' && <>Listening… <span className="timer">{formatDuration(elapsed)}</span></>}
          {phase === 'thinking' && 'Thinking…'}
          {phase === 'speaking' && 'Talking'}
          {phase === 'review' && 'Your question is saved here'}
          {phase === 'idle' && !hasAsked && 'Tap and ask anything'}
          {phase === 'requesting' && 'Waking the microphone…'}
        </p>

        {showBig && (
          <div className="orb-wrap">
            <div ref={ringRef} className="orb-ring" aria-hidden />
            <button className="wonder-button" onClick={big.on} disabled={big.disabled} aria-label={big.aria} data-testid="wonder-button">
              <Icon name={big.icon} size={64} />
              <span>{big.label}</span>
            </button>
          </div>
        )}

        {phase === 'listening' && <p className="rec-indicator" role="status"><span className="rec-dot" aria-hidden /> Recording your voice</p>}

        {phase === 'review' && (
          <div className="review-panel" role="group" aria-label="Your recording">
            <button className="round-btn" onClick={hearDraft} aria-label="Hear my question"><Icon name="ear" size={40} /><span>Hear it</span></button>
            <button className="round-btn" onClick={doOver} aria-label="Do over"><Icon name="redo" size={40} /><span>Do over</span></button>
            <button className="round-btn" onClick={dontSave} aria-label="Don't save"><Icon name="trash" size={40} /><span>Don’t save</span></button>
            <button className="round-btn go" onClick={send} aria-label="Send my question" data-testid="send"><Icon name="check" size={48} /><span>Send</span></button>
          </div>
        )}

        {phase === 'error' && errCode && (
          <div className="error-panel" role="alert">
            <div className="sleepy-mic" aria-hidden><Icon name="mic" size={56} /></div>
            <h2>{ERROR_COPY[errCode].child}</h2>
            <p>Let’s ask a grown-up to help.</p>
            <details className="adult-help">
              <summary>Grown-up help</summary>
              <p>{ERROR_COPY[errCode].adult}</p>
              {saveError && <p>Details: {saveError}</p>}
              <button className="adult-chip" onClick={() => { setAdultText(''); setPhase('awaiting_adult'); }}>Type their question instead</button>
            </details>
            <button className="round-btn go" onClick={() => void startRecording(recKind.current)}><Icon name="redo" size={36} /><span>Try again</span></button>
          </div>
        )}

        {(phase === 'speaking' || (phase === 'idle' && caption)) && (
          <div className={`caption caption-${captionKind}`} aria-live="polite" data-testid="caption">
            <p>{caption}</p>
          </div>
        )}

        {phase === 'speaking' && (
          <div className="mini-row">
            <button className="round-btn small" onClick={() => speech.cancel()} aria-label="Stop talking"><Icon name="stop" size={28} /><span>Stop</span></button>
          </div>
        )}
        {phase === 'idle' && hasAsked && (
          <div className="mini-row">
            {caption && <button className="round-btn small" onClick={() => void say(caption, captionKind === 'parent' ? 'parent' : 'ai')} aria-label="Hear again"><Icon name="speaker" size={28} /><span>Hear again</span></button>}
            <button className="round-btn small" onClick={() => void startRecording('guess')} aria-label="My guess"><Icon name="bulb" size={28} /><span>My guess</span></button>
          </div>
        )}
        {soundOff && phase !== 'speaking' && <p className="fine on-dark">Sound isn’t available here. A grown-up can read the words aloud.</p>}
      </main>

      {phase === 'awaiting_adult' && (
        <div className="adult-sheet" role="dialog" aria-label="Grown-up: type their question">
          <h2>Grown-up: what did {profile?.displayName ?? 'they'} ask?</h2>
          <p className="fine">Type their words as closely as you can. This is saved as “typed by a grown-up”, next to the original recording.</p>
          <form onSubmit={(e) => { e.preventDefault(); void answerQuestion(adultText.trim() || null, adultText.trim() ? 'parent_typed' : 'none'); }}>
            <input autoFocus value={adultText} onChange={(e) => setAdultText(e.target.value)} placeholder="e.g. How do my eyes move?" aria-label="Their question" />
            <div className="btn-row">
              <button className="primary-btn">Use this</button>
              <button type="button" className="secondary-btn" onClick={() => void answerQuestion(adultText.trim() || null, adultText.trim() ? 'parent_typed' : 'none', undefined, true)}>I’ll answer myself</button>
              <button type="button" className="ghost-btn" onClick={() => void answerQuestion(null, 'none')}>Skip</button>
            </div>
          </form>
        </div>
      )}

      {takeover && session && (
        <TakeoverSheet session={session} replyTo={childTurns.at(-1)?.id} onClose={async (saved) => {
          setTakeover(false);
          await reloadTurns(session.memoryId);
          if (saved) { setCaption(saved); setCaptionKind('parent'); }
          setPhase('idle');
        }} />
      )}

      {confirmEnd && (
        <div className="adult-sheet" role="dialog" aria-label="End session">
          <h2>End this session?</h2>
          <p className="fine">The screen will lock. You’ll choose whether to keep it in the journal after entering your PIN.</p>
          <div className="btn-row">
            <button className="primary-btn" onClick={endSession}>End session</button>
            <button className="ghost-btn" onClick={() => setConfirmEnd(false)}>Keep going</button>
          </div>
        </div>
      )}

      {paused && (
        <div className="pause-overlay" role="dialog" aria-label="Paused">
          {pinFor === 'resume' ? (
            <PinGate tone="dark" mode="verify" title="Resume wondering" subtitle="Grown-up PIN" onUnlock={resumeAfterPin} onCancel={() => setPinFor(null)} />
          ) : (
            <div className="locked-msg">
              <Icon name="pause" size={56} />
              <h1>Paused</h1>
              <p>A grown-up will be right back.</p>
              <div className="btn-row center">
                <button className="adult-chip" onClick={() => setPinFor('resume')}><Icon name="lock" size={18} /> Grown-up: resume</button>
                <button className="adult-chip" onClick={endSession}>End session</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TakeoverSheet({ session, replyTo, onClose }: { session: WonderSession; replyTo?: string; onClose: (savedText?: string) => void }) {
  const [text, setText] = useState('');
  const [rec, setRec] = useState<'idle' | 'recording' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const r = useRef<AudioRecorder | null>(null);
  const asset = useRef<MediaAsset | null>(null);

  useEffect(() => () => r.current?.cancel(), []);

  async function toggleRecord() {
    setErr(null);
    if (rec === 'recording' && r.current) {
      try {
        const audio = await r.current.stop();
        asset.current = await saveDraftRecording({ familyId: session.familyId, profileId: session.profileId, memoryId: session.memoryId }, audio, 'parent_audio');
        setRec('done');
      } catch (e) { setErr((e as Error).message); setRec('idle'); }
      r.current = null;
      return;
    }
    const nr = new AudioRecorder();
    try { await nr.start(); r.current = nr; setRec('recording'); } catch (e) { setErr(e instanceof RecorderError ? ERROR_COPY[e.code].adult : (e as Error).message); }
  }

  async function save() {
    if (!text.trim() && !asset.current) return setErr('Type or record your answer first.');
    await appendTurn({ memoryId: session.memoryId, speaker: 'parent', speakerLabel: 'Grown-up', kind: 'parent_answer', originalText: text.trim() || null, textSource: text.trim() ? 'parent_typed' : 'none', replyToTurnId: replyTo, audioAssetId: asset.current?.id });
    onClose(text.trim() || 'A grown-up answered out loud.');
  }

  async function cancel() {
    r.current?.cancel();
    if (asset.current) await discardDraftRecording(asset.current.id);
    onClose();
  }

  return (
    <div className="adult-sheet" role="dialog" aria-label="Grown-up answer">
      <h2>Your answer</h2>
      <p className="fine">Say it out loud to them. Optionally record it or jot it down so it’s kept with the conversation.</p>
      <div className="btn-row">
        <button className={`secondary-btn ${rec === 'recording' ? 'recording' : ''}`} onClick={toggleRecord}>
          <Icon name={rec === 'recording' ? 'stop' : 'mic'} size={18} /> {rec === 'recording' ? 'Stop recording' : rec === 'done' ? 'Recorded ✓ — record again' : 'Record my answer'}
        </button>
      </div>
      <label className="sr-only" htmlFor="takeover-text">Typed answer</label>
      <textarea id="takeover-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Optional: type what you told them" />
      {err && <p className="error" role="alert">{err}</p>}
      <div className="btn-row">
        <button className="primary-btn" onClick={save} disabled={rec === 'recording'}>Save my answer</button>
        <button className="ghost-btn" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}
