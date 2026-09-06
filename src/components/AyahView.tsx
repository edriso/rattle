import { useState } from 'react';
import {
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Repeat2,
  Play,
  BookOpen,
  Check,
} from 'lucide-react';
import {
  quranProvider,
  surahs,
  arabic,
  reciters,
  type Preferences,
} from '../data/quran';
import { Recorder } from './Recorder';
export function AyahView({
  prefs,
  update,
}: {
  prefs: Preferences;
  update: (v: Partial<Preferences>) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [notice, setNotice] = useState('');
  const surah = surahs[prefs.surah - 1];
  const last = Math.min(surah.count, prefs.ayah + prefs.perView - 1);
  const move = (direction: number) =>
    update({
      ayah: Math.max(
        1,
        Math.min(surah.count, prefs.ayah + direction * prefs.perView),
      ),
    });
  return (
    <>
      <h1 className="sr-only">
        سورة {surah.name}، الآية {arabic(prefs.ayah)}
      </h1>
      <section className="verse-space" aria-label="موضع الحفظ">
        {hidden ? (
          <div className="hidden-prompt">
            <EyeOff size={27} />
            <p>اقرأ من حفظك</p>
          </div>
        ) : prefs.mode === 'page' ? (
          <div className="placeholder">
            <BookOpen size={32} />
            <p>صفحة المصحف</p>
            <span>صور المصحف قريبًا.</span>
          </div>
        ) : (
          <div className="verses" key={`${prefs.surah}-${prefs.ayah}`}>
            {Array.from({ length: last - prefs.ayah + 1 }, (_, i) => {
              const n = prefs.ayah + i;
              const text = quranProvider.getAyah(prefs.surah, n);
              return text ? (
                <p className="quran-text" key={n}>
                  {text}{' '}
                  <span
                    className="ayah-number"
                    aria-label={`الآية ${arabic(n)}`}
                  >
                    {arabic(n)}
                  </span>
                </p>
              ) : (
                <div className="placeholder" key={n}>
                  <p>الآية {arabic(n)}</p>
                  <span>النص غير متاح حاليًا.</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <button
        className="reveal-button"
        aria-pressed={hidden}
        onClick={() => setHidden(!hidden)}
      >
        {hidden ? <Eye size={17} /> : <EyeOff size={17} />}{' '}
        {hidden ? 'إظهار الآية' : 'إخفاء الآية'}
      </button>
      <div className="practice-controls">
        <div className="reciter-caption">
          <span className="status-dot" />
          {reciters.find((r) => r.id === prefs.reciter)?.name}
          <span className="preview-badge">قريبًا</span>
        </div>
        <div className="play-controls">
          <button
            className="icon-button"
            aria-label="الآيات السابقة"
            disabled={prefs.ayah === 1}
            onClick={() => move(-1)}
          >
            <ChevronRight />
          </button>
          <button
            className={`icon-button ${repeat ? 'active' : ''}`}
            aria-label="تكرار التلاوة"
            aria-pressed={repeat}
            onClick={() => setRepeat(!repeat)}
          >
            <Repeat2 size={21} />
          </button>
          <button
            className="play-main"
            aria-label="تشغيل التلاوة"
            onClick={() => setNotice('التلاوة غير متاحة حاليًا.')}
          >
            <Play size={24} fill="currentColor" />
          </button>
          <span className="play-balance" aria-hidden="true" />
          <button
            className="icon-button"
            aria-label="الآيات التالية"
            disabled={last === surah.count}
            onClick={() => move(1)}
          >
            <ChevronLeft />
          </button>
        </div>
        {notice && <output className="field-note">{notice}</output>}
        <Recorder position={`${prefs.surah}:${prefs.ayah}:${prefs.perView}`} />
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
          <span>
            {arabic(last)} / {arabic(surah.count)}
          </span>
        </div>
      </div>
    </>
  );
}
