import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePracticeNavigation } from '../usePracticeNavigation';
import { useRangeAudio } from '../useRangeAudio';
import {
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Repeat2,
  Play,
  Pause,
  Check,
} from 'lucide-react';
import { surahs, arabic, type Preferences } from '../data/quran';
import { ayahAudioUrl, findReciter } from '../data/audio';
import { QuranVerses } from './QuranVerses';
import { Recorder, type RecorderControls } from './Recorder';
export function AyahView({
  prefs,
  update,
  navigationEnabled = true,
}: {
  prefs: Preferences;
  navigationEnabled?: boolean;
  update: (v: Partial<Preferences>) => void;
}) {
  const surah = surahs[prefs.surah - 1];
  const last = Math.min(surah.count, prefs.ayah + prefs.perView - 1);
  const position = `${prefs.surah}:${prefs.ayah}:${prefs.perView}`;
  /* Hiding belongs to the ayah in front of the learner: moving on shows the
     new one. The loop toggle belongs to the learner and stays put. */
  const [hiddenAt, setHiddenAt] = useState<string | null>(null);
  const hidden = hiddenAt === position;
  const [repeat, setRepeat] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const recording = useRef<RecorderControls>(null);
  const toggleReciter = () => {
    if (recording.current?.isCapturing()) return;
    recording.current?.pausePlayback();
    void toggle();
  };
  const sources = useMemo(
    () =>
      Array.from({ length: last - prefs.ayah + 1 }, (_, i) =>
        ayahAudioUrl(prefs.surah, prefs.ayah + i, prefs.reciter),
      ),
    [prefs.surah, prefs.ayah, last, prefs.reciter],
  );
  const { playing, notice, toggle, pause } = useRangeAudio(
    sources,
    repeat,
    prefs.keepPlaying,
  );
  const move = (direction: number) => {
    if (
      (direction > 0 && last === surah.count) ||
      (direction < 0 && prefs.ayah === 1)
    )
      return;
    const focusId = document.activeElement?.id;
    flushSync(() =>
      update({
        ayah:
          direction > 0 ? last + 1 : Math.max(1, prefs.ayah - prefs.perView),
      }),
    );
    const control = focusId ? document.getElementById(focusId) : null;
    const target =
      control && !control.matches(':disabled')
        ? control
        : document.getElementById('current-verse');
    target?.focus({ preventScroll: true });
  };
  const gestures = usePracticeNavigation({
    enabled: navigationEnabled,
    next: () => move(1),
    previous: () => move(-1),
    toggleAudio: toggleReciter,
    repeat: () => setRepeat(!repeat),
    toggleRecording: () => recording.current?.toggleRecording(),
    toggleRecordingPlayback: () => recording.current?.togglePlayback(),
  });
  return (
    <>
      <h1 className="sr-only">
        سورة {surah.name}، الآية {arabic(prefs.ayah)}
      </h1>
      <section
        id="current-verse"
        // Focusable, because the frame scrolls and a keyboard has to reach it.
        tabIndex={0}
        className="verse-space"
        aria-label={`سورة ${surah.name}، الآية ${arabic(prefs.ayah)}`}
        {...gestures}
      >
        {hidden ? (
          <div className="hidden-prompt">
            <EyeOff size={27} />
            <p>اقرأ من حفظك</p>
          </div>
        ) : (
          <QuranVerses surah={prefs.surah} first={prefs.ayah} last={last} />
        )}
      </section>
      <button
        className="reveal-button"
        aria-pressed={hidden}
        onClick={() => setHiddenAt(hidden ? null : position)}
      >
        {hidden ? <Eye size={17} /> : <EyeOff size={17} />}{' '}
        {hidden ? 'إظهار الآية' : 'إخفاء الآية'}
      </button>
      <div className="practice-controls">
        <div className="reciter-caption">
          <span className="status-dot" />
          {findReciter(prefs.reciter).name}
        </div>
        <div className="play-controls">
          <button
            className="icon-button"
            id="previous-ayah"
            aria-label="الآيات السابقة"
            aria-keyshortcuts="ArrowRight"
            title="السابق (→)"
            disabled={prefs.ayah === 1}
            onClick={() => move(-1)}
          >
            <ChevronRight />
          </button>
          <button
            className={`icon-button ${repeat ? 'active' : ''}`}
            aria-label="تكرار التلاوة"
            aria-pressed={repeat}
            aria-keyshortcuts="ArrowDown"
            title="تكرار التلاوة (↓)"
            onClick={() => setRepeat(!repeat)}
          >
            <Repeat2 size={21} />
          </button>
          <button
            className="play-main"
            id="reciter-play"
            aria-label={playing ? 'إيقاف التلاوة مؤقّتًا' : 'تشغيل التلاوة'}
            aria-keyshortcuts="Space ArrowUp"
            title="تشغيل أو إيقاف (مسافة أو ↑)"
            disabled={capturing}
            onClick={toggleReciter}
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
            id="next-ayah"
            aria-label="الآيات التالية"
            aria-keyshortcuts="ArrowLeft Enter"
            title="التالي (← أو إدخال)"
            disabled={last === surah.count}
            onClick={() => move(1)}
          >
            <ChevronLeft />
          </button>
        </div>
        {notice && <output className="field-note">{notice}</output>}
        <Recorder
          ref={recording}
          onCaptureChange={setCapturing}
          position={position}
          onBeforeAudio={pause}
        />
      </div>
      <div className="session-progress">
        <progress
          className="progress-track"
          aria-label="موضعك في السورة"
          max={surah.count}
          value={last}
        />
        <div>
          <span>
            {last === surah.count ? (
              <>
                <Check size={14} /> نهاية السورة
              </>
            ) : (
              `سورة ${surah.name}`
            )}
          </span>
          <span dir="ltr">
            {arabic(last)} / {arabic(surah.count)}
          </span>
        </div>
      </div>
    </>
  );
}
