import { Link } from 'react-router-dom';

export function Privacy() {
  return (
    <div className="privacy">
      <article className="card prose">
        <p className="eyebrow">Starter document · requires legal review before any real-family use</p>
        <h1>How Wonder Lab handles your family’s data</h1>
        <p><strong>This is a local-only prototype.</strong> In this version, everything — recordings, words, notes, profiles — is stored only in this browser on this device. Nothing is uploaded to Wonder Lab, House of Quiet Rage, or anyone else.</p>
        <h2>What is recorded</h2>
        <ul>
          <li>Your child’s voice, only after a grown-up starts a session and ticks the recording choice, and only while the big button shows “Listening”.</li>
          <li>Questions and words a grown-up types, and replies from Wonder Lab’s practice mode.</li>
          <li>Notes, topics and highlights you add.</li>
        </ul>
        <h2>What is not done</h2>
        <ul>
          <li>No live AI. Replies are pre-written practice examples. A child’s voice and words are not sent to any AI, speech-recognition, analytics or advertising service.</li>
          <li>No trackers, ads, social features, location, face recognition, voice cloning, scores or streaks.</li>
          <li>Spoken replies use the voice built into the device’s browser. Confirm on your device that it does not send text off the device.</li>
        </ul>
        <h2>Keeping and deleting</h2>
        <ul>
          <li>At the end of a session you choose to keep it in the journal or delete it.</li>
          <li>Browsers can clear stored data (for example when the device is low on space). Export an archive to keep a real copy.</li>
          <li>Archive › “Delete all data” removes everything Wonder Lab stored in this browser.</li>
        </ul>
        <h2>Before this changes</h2>
        <p>Any cloud storage or live AI would require separate, documented parental consent, a provider configuration suitable for children’s data, and legal review. See <code>docs/privacy-readiness.md</code>. None of those gates are signed off.</p>
        <p>Contact: <em>[operator contact to be added before any pilot]</em></p>
        <p><Link to="/">← Back</Link></p>
      </article>
    </div>
  );
}
