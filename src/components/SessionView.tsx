import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Pause,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import { arabic, clockLabel, surahs, type Preferences } from '../data/quran';
import { findReciter } from '../data/audio';
import { usePracticeNavigation } from '../usePracticeNavigation';
import { useSession } from '../memorize/useSession';
import { buildPassage, usePassageSource } from '../memorize/usePassage';
import type { StepKind } from '../memorize/schedule';
import type { Grade } from '../memorize/review';
import { GradeSheet } from './GradeSheet';

/** Keep the ayah being recited in view when a joined run is taller than the
    space it has. Assigned as a ref callback, so it fires on every change. */
const scrollIntoView = (node: HTMLElement | null) => {
  node?.scrollIntoView?.({ block: 'nearest' });
};

const kindLabel: Record<StepKind, string> = {
  single: 'تلقين',
  link: 'وصل',
  recite: 'سرد',
};

export function SessionView({
  prefs,
  navigationEnabled = true,
  onExit,
  onGraded,
}: {
  prefs: Preferences;
  navigationEnabled?: boolean;
  onExit: () => void;
  onGraded: (grade: Grade) => void;
}) {
  const surah = surahs[prefs.surah - 1];
  const reciter = findReciter(prefs.reciter);
  const { loaded, failed, retry } = usePassageSource(
    prefs.surah,
    prefs.reciter,
    prefs.grain,
  );
  /* The echo is deliberately absent here. A new passage builds a new session,
     and a learner who changes the silence from the sheet mid-drill must keep
     their place: `useSession` hands the change to the running session. */
  const passage = useMemo(
    () =>
      loaded &&
      buildPassage(loaded, prefs.ayah, prefs.to, prefs.grain, prefs.plan),
    [loaded, prefs.ayah, prefs.to, prefs.grain, prefs.plan],
  );
  const config = useMemo(
    () =>
      passage && passage.steps.length
        ? {
            segments: passage.segments,
            steps: passage.steps,
            reciter: prefs.reciter,
            pace: reciter.pace,
          }
        : null,
    [passage, prefs.reciter, reciter.pace],
  );
  const { session, state } = useSession(config, prefs.echo);
  /* Reaching this screen by tapping "start" is the learner asking for the
     drill, so it begins on its own. Reaching it by reopening the app is not:
     no browser will leave a suspended audio context without a gesture, and
     waiting on one that never comes would look like a session that hangs. So
     the drill starts only where the page has already been interacted with,
     and the play button is the way in everywhere else. */
  const autoStarted = useRef<unknown>(null);
  useEffect(() => {
    if (!session || autoStarted.current === session) return;
    /* And never while a panel is open over the screen. `useSession` carries a
       stopped drill across a rebuild, but a change of grain is in this
       screen's key, so choosing the one reciter with no published timings
       while «جملة» is set remounts the screen and the carry goes with it.
       Without this, that one choice sets the new voice reciting from behind
       the sheet, where the transport is under a modal and Space is unbound.
       The flag is set only once the decision is actually taken, so closing
       the panel is what lets the drill begin. */
    if (!navigationEnabled) return;
    autoStarted.current = session;
    if (navigator.userActivation?.hasBeenActive === false) return;
    void session.start();
  }, [session, navigationEnabled]);

  // Finishing opens the grading sheet on its own, and closing it keeps it shut.
  const [sheet, setSheet] = useState<'open' | 'closed' | null>(null);
  const grading =
    sheet === 'open' || (sheet === null && state?.phase === 'done');

  const gestures = usePracticeNavigation({
    enabled: navigationEnabled && !grading && !!session,
    /* Forward during a timed silence means «I have finished repeating, go
       on», not «skip the rest of this step»: the silence is the learner's
       turn and ending it early is the only forward move that phase has. It
       is also what the button carrying this shortcut does. «أنا أتحكّم»
       keeps forward as the next step, because there continuing is already on
       the main button under Space. */
    next: () =>
      state?.phase === 'echoing' ? session?.continue() : session?.next(),
    previous: () => session?.previous(),
    toggleAudio: () => toggle(),
    repeat: () => {
      if (state) session?.goTo(state.cursor.step);
    },
  });

  if (failed || (passage && passage.steps.length === 0))
    return (
      <div className="placeholder" role="alert">
        <p>{failed ? 'تعذّر تحميل النص.' : 'لا يوجد ما يُكرَّر في هذا المدى.'}</p>
        <button className="reveal-button" onClick={failed ? retry : onExit}>
          {failed ? 'إعادة المحاولة' : 'عُد إلى اختيار المقطع'}
        </button>
      </div>
    );

  if (!passage || !state || !session)
    return (
      <div className="placeholder" aria-live="polite">
        <p>جارٍ تحضير الجلسة…</p>
      </div>
    );

  const step = passage.steps[state.cursor.step];
  const run = passage.segments.slice(step.from, step.to + 1);
  /* The drill is running through the learner's own turn as much as through
     the recitation: the silence is timed, the clock is moving, and the whole
     thing carries on by itself when it ends. So the turn counts as running,
     and the main button stops it. «أنا أتحكّم» is the exception, because
     there the drill really is halted until the learner says otherwise. */
  const running =
    state.phase === 'reciting' ||
    state.phase === 'preparing' ||
    state.phase === 'echoing';
  const holding = state.phase === 'waiting';
  /* The learner's turn, timed: the one phase with a forward move of its own
     that is not the next step. */
  const inGap = state.phase === 'echoing';
  /* The drill's first repetition. Walking back is how a learner arrives here,
     so the button that does it must not turn `disabled` under their finger. */
  const atStart = state.cursor.step === 0 && state.cursor.rep === 0;
  const total = passage.steps.length;

  function toggle() {
    if (!session || !state) return;
    if (holding) session.continue();
    else if (running) session.pause();
    else if (state.phase === 'idle') void session.start();
    // A finished drill plays again from its first step.
    else if (state.phase === 'done') session.goTo(0);
    else void session.resume();
  }

  return (
    <>
      <h1 className="sr-only">
        جلسة تلقين، سورة {surah.name}، الآيات {arabic(prefs.ayah)} إلى{' '}
        {arabic(prefs.to)}
      </h1>

      <div className="session-head">
        <progress
          className="progress-track"
          aria-label="تقدّم الجلسة"
          max={total}
          value={state.cursor.step + 1}
        />
        <div className="session-meta">
          <output className="step-name">
            <span className={`step-tag step-${step.kind}`}>
              {kindLabel[step.kind]}
            </span>
            الخطوة {arabic(state.cursor.step + 1)} من {arabic(total)}
            {step.reps > 1 && (
              <span className="muted">
                {' '}
                · التكرار {arabic(state.cursor.rep + 1)} من {arabic(step.reps)}
              </span>
            )}
          </output>
          {/* A timer, so the label names it and the digits stay its value:
              `aria-label` on a bare span is not allowed to carry either. */}
          <span
            className="remaining"
            dir="ltr"
            role="timer"
            aria-label="الوقت المتبقي"
          >
            {clockLabel(state.remaining)}
          </span>
        </div>
      </div>

      {/* Focusable, because the frame scrolls and a keyboard has to reach it. */}
      <section
        className="verse-space session-verses"
        aria-label="نص المقطع"
        tabIndex={0}
        {...gestures}
      >
        <div className="verses">
          {run.map((segment, index) => {
            const isNew = step.from + index === step.to;
            const sounding = state.sounding === step.from + index;
            return (
              <p
                key={segment.id}
                ref={sounding ? scrollIntoView : undefined}
                className="quran-text"
                data-role={isNew ? 'new' : 'linked'}
                data-sounding={sounding || undefined}
              >
                {segment.text}{' '}
                {segment.phrase === null && (
                  <span className="ayah-number">
                    <span className="sr-only">الآية </span>
                    {arabic(segment.ayahTo)}
                  </span>
                )}
              </p>
            );
          })}
        </div>
      </section>

      <div className="practice-controls">
        {/* Only what changes is announced; the reciter's name is not news. */}
        <output className="session-phase" aria-live="polite">
          {state.error ? (
            <span className="error-text">{state.error}</span>
          ) : state.phase === 'preparing' ? (
            `جارٍ تحميل التلاوة… ${arabic(Math.round(state.loaded * 100))}٪`
          ) : state.phase === 'echoing' ? (
            <span className="echoing">
              ردّد الآن
              <span className="echo-count" dir="ltr" aria-hidden="true">
                {arabic(Math.ceil(state.echoLeft))}
              </span>
            </span>
          ) : state.phase === 'waiting' ? (
            <span className="echoing">ردّد، ثم تابِع</span>
          ) : state.phase === 'paused' ? (
            'متوقّفة'
          ) : (
            ''
          )}
        </output>
        <p className="reciter-caption" aria-hidden="true">
          <span className="status-dot" />
          {reciter.name}
        </p>

        <div className="play-controls">
          <button
            className="icon-button"
            aria-label="الخطوة السابقة"
            aria-keyshortcuts="ArrowRight"
            title="السابق (→)"
            aria-disabled={atStart}
            onClick={() => !atStart && session.previous()}
          >
            <ChevronRight />
          </button>
          <button
            className="icon-button"
            aria-label="أعِد هذه الخطوة"
            aria-keyshortcuts="ArrowDown"
            title="أعِد هذه الخطوة (↓)"
            onClick={() => session.goTo(state.cursor.step)}
          >
            <RotateCcw size={19} />
          </button>
          <button
            className="play-main"
            aria-label={holding ? 'تابِع الآن' : running ? 'إيقاف مؤقّت' : 'تشغيل'}
            aria-keyshortcuts="Space ArrowUp"
            title="تشغيل أو إيقاف (مسافة أو ↑)"
            onClick={toggle}
          >
            {running ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" />
            )}
          </button>
          {/* Ending the turn early, in the slot that used to hold nothing
              but the row's balance. It stays drawn once the turn is over, and
              goes `aria-disabled` rather than away, for the reason the whole
              app uses `aria-disabled`: a control that vanishes the moment it
              is pressed drops the keyboard on the floor, and pressing this
              one is exactly what makes it unavailable. Keeping it also stops
              the transport shifting under a thumb.

              «أنا أتحكّم» is the exception, and it has to be: there the main
              button is «تابِع الآن» itself, and two buttons a finger apart
              with one name is worse for a screen reader than a slot that
              goes back to being empty. */}
          {holding ? (
            <span className="play-balance" aria-hidden="true" />
          ) : (
            <button
              className="icon-button skip-echo"
              aria-label="تابِع الآن"
              aria-keyshortcuts={inGap ? 'ArrowLeft Enter' : undefined}
              // Named the same way whatever the phase, but the keys are only
              // claimed while it holds them: outside the turn they belong to
              // «الخطوة التالية» beside it.
              title={inGap ? 'تابِع الآن (← أو إدخال)' : 'تابِع الآن'}
              aria-disabled={!inGap}
              onClick={() => inGap && session.continue()}
            >
              <ChevronsLeft size={22} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label="الخطوة التالية"
            aria-keyshortcuts={inGap ? undefined : 'ArrowLeft Enter'}
            title={inGap ? 'الخطوة التالية' : 'التالي (← أو إدخال)'}
            onClick={() => session.next()}
          >
            <ChevronLeft />
          </button>
        </div>

        {/* Grading pauses the drill: the sheet covers the screen, and a live
            region announcing behind it talks over the questions. */}
        <button
          className="text-button"
          onClick={() => {
            session.pause();
            setSheet('open');
          }}
        >
          <Check size={16} /> أنهِ الجلسة
        </button>
      </div>

      {grading && (
        <GradeSheet
          surah={surah.name}
          from={prefs.ayah}
          to={prefs.to}
          finished={state.phase === 'done'}
          onClose={() => setSheet('closed')}
          onGrade={(grade) => {
            session.pause();
            onGraded(grade);
          }}
          onLeave={() => {
            session.pause();
            onExit();
          }}
        />
      )}
    </>
  );
}
