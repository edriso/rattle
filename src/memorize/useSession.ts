/* React binding for the framework-free session runtime. The runtime owns the
   state and publishes it; this only decides when a new drill is needed, and
   keeps one audio layer alive across drills so decoded recitation that has
   already been fetched is never fetched again. */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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
 * Whether two drills are the same drill, so a cursor into one means the same
 * place in the other. The steps have to match, and so do the segments they
 * index: two reciters can split different ayat of a passage into the same
 * number of phrases, which would leave the step boundaries identical and step
 * fourteen pointing at different words.
 */
const sameDrill = (a: SessionConfig, b: SessionConfig) =>
  a.steps.length === b.steps.length &&
  a.segments.length === b.segments.length &&
  a.steps.every(
    (step, i) =>
      step.kind === b.steps[i].kind &&
      step.from === b.steps[i].from &&
      step.to === b.steps[i].to &&
      step.reps === b.steps[i].reps,
  ) &&
  a.segments.every((segment, i) => segment.id === b.segments[i].id);

/**
 * Build a session for `config`, which the caller should memoise: a new object
 * is a new drill. The echo is passed apart because changing it must not cost
 * the learner their place. A session finishing is read from `state.phase`,
 * not signalled by a callback.
 *
 * A rebuild that does not change the drill's shape keeps the learner where
 * they stood. Changing the reciter mid-session is the case that matters and
 * the reason this exists: the steps are the same steps in a different voice,
 * and dropping somebody back on step one of forty for asking to be read to
 * more slowly is a loss of real work. A change that does alter the shape, the
 * joins or the passage or the grain, has no step to carry a cursor to and
 * starts over.
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

  /* Where the drill that was just torn down stood. Written in a cleanup and
     read in an effect, never during a render. */
  const previous = useRef<{
    config: SessionConfig;
    step: number;
    halted: boolean;
  } | null>(null);
  useEffect(() => {
    if (!session || !config) return;
    return () => {
      const { phase, cursor } = session.getSnapshot();
      previous.current = {
        config,
        step: cursor.step,
        /* Named rather than «not running», because a drill that had not begun
           is not a drill that was stopped: `idle` carries nothing across, so a
           rebuild there behaves like a first arrival and the screen's own
           check for a gesture decides, as it did before. */
        halted:
          phase === 'paused' ||
          phase === 'waiting' ||
          phase === 'error' ||
          phase === 'done',
      };
      session.dispose();
    };
  }, [session, config]);

  /* Before the screen's own effect starts the drill, because this hook is
     called above it and effects run in the order they were declared. `goTo`
     on a session that has not begun only moves the cursor. */
  useEffect(() => {
    const carried = previous.current;
    if (!session || !config || !carried) return;
    if (carried.step > 0 && sameDrill(carried.config, config))
      session.goTo(carried.step);
    /* A drill the learner had stopped stays stopped, and this holds whether or
       not the new one is the same drill: without it, choosing a reciter from
       the sheet sets him reciting over the open sheet, and the transport
       behind a modal is out of reach to stop him. */
    if (carried.halted) session.hold();
  }, [session, config]);

  useEffect(() => session?.setEcho(echo), [session, echo]);

  const state = useSyncExternalStore(
    session ? session.subscribe : noSubscribe,
    session ? session.getSnapshot : noSnapshot,
  );
  return { session, state };
}
