import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import { arabic, surahs, type Preferences } from '../data/quran';
import { findReciter } from '../data/audio';
import { usePracticeNavigation } from '../usePracticeNavigation';
import { useSession } from '../memorize/useSession';
import { preparePassage, usePassageSource } from '../memorize/usePassage';
import type { StepKind } from '../memorize/schedule';
import type { Grade } from '../memorize/review';
import { GradeSheet } from './GradeSheet';

const clock = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${arabic(minutes)}:${arabic(total % 60).padStart(2, '٠')}`;
};

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
  const passage = useMemo(
    () =>
      loaded &&
      preparePassage(
        loaded,
        prefs.ayah,
        prefs.to,
        prefs.grain,
        prefs.plan,
        prefs.echo,
        reciter.pace,
      ),
    [
      loaded,
      prefs.ayah,
      prefs.to,
      prefs.grain,
      prefs.plan,
      prefs.echo,
      reciter.pace,
    ],
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
    autoStarted.current = session;
    if (navigator.userActivation?.hasBeenActive === false) return;
    void session.start();
  }, [session]);

  // Finishing opens the grading sheet on its own, and closing it keeps it shut.
  const [sheet, setSheet] = useState<'open' | 'closed' | null>(null);
  const grading =
    sheet === 'open' || (sheet === null && state?.phase === 'done');

  const gestures = usePracticeNavigation({
    enabled: navigationEnabled && !grading && !!session,
    next: () => session?.next(),
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
          {failed ? 'إعادة المحاولة' : 'عُد لاختيار المقطع'}
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
  const playing = state.phase === 'reciting' || state.phase === 'preparing';
  const total = passage.steps.length;

  function toggle() {
    if (!session || !state) return;
    if (state.phase === 'echoing' || state.phase === 'waiting')
      session.continue();
    else if (playing) session.pause();
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
          <span className="remaining" dir="ltr" aria-label="الوقت المتبقي">
            {clock(state.remaining)}
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
                  <span
                    className="ayah-number"
                    aria-label={`الآية ${arabic(segment.ayahTo)}`}
                  >
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
            disabled={state.cursor.step === 0 && state.cursor.rep === 0}
            onClick={() => session.previous()}
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
            aria-label={
              state.phase === 'echoing' || state.phase === 'waiting'
                ? 'تابِع الآن'
                : playing
                  ? 'إيقاف مؤقت'
                  : 'تشغيل'
            }
            aria-keyshortcuts="Space ArrowUp"
            title="تشغيل أو إيقاف (مسافة أو ↑)"
            onClick={toggle}
          >
            {playing ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" />
            )}
          </button>
          <span className="play-balance" aria-hidden="true" />
          <button
            className="icon-button"
            aria-label="الخطوة التالية"
            aria-keyshortcuts="ArrowLeft Enter"
            title="التالي (← أو إدخال)"
            onClick={() => session.next()}
          >
            <ChevronLeft />
          </button>
        </div>

        <button className="text-button" onClick={() => setSheet('open')}>
          <Check size={16} /> أنهِ الجلسة
        </button>
      </div>

      {grading && (
        <GradeSheet
          open={grading}
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
