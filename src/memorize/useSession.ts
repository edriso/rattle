/* React binding for the framework-free session runtime. The runtime owns the
   state and publishes it; this only decides when a new drill is needed, and
   keeps one audio layer alive across drills so decoded recitation that has
   already been fetched is never fetched again. */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { audioMirrors } from '../data/audio';
import { ClipPlayer } from './player';
import { Session, type SessionState } from './runtime';
import type { EchoMode, PlayableSegment } from './session';
import type { Step } from './schedule';

export type SessionConfig = {
  segments: readonly PlayableSegment[];
  steps: readonly Step[];
  reciter: string;
  pace: number;
};

const noSubscribe = () => () => {};
const noSnapshot = (): SessionState | null => null;

/**
 * Build a session for `config`, which the caller should memoise: a new object
 * is a new drill, started over from its first step. The echo is passed apart
 * because changing it must not cost the learner their place. A session
 * finishing is read from `state.phase`, not signalled by a callback.
 */
export function useSession(config: SessionConfig | null, echo: EchoMode) {
  const [audio] = useState(() => new ClipPlayer(audioMirrors));
  useEffect(() => () => void audio.dispose(), [audio]);

  // A session is built without an echo and given one straight away, so that
  // changing the echo later adjusts the drill in place instead of restarting.
  const session = useMemo(
    () => (config ? new Session({ ...config, echo: 'off', audio }) : null),
    [config, audio],
  );
  useEffect(() => () => session?.dispose(), [session]);
  useEffect(() => session?.setEcho(echo), [session, echo]);

  const state = useSyncExternalStore(
    session ? session.subscribe : noSubscribe,
    session ? session.getSnapshot : noSnapshot,
  );
  return { session, state };
}
