import { useMemo, useRef } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Clock,
  Repeat,
  Link2,
} from 'lucide-react';
import {
  arabic,
  ayatCount,
  daysCount,
  digits,
  minutesCount,
  surahs,
  timesCount,
  type Preferences,
} from '../data/quran';
import { findReciter } from '../data/audio';
import {
  echoLabel,
  grainLabel,
  grains,
  type EchoMode,
  type Grain,
} from '../memorize/session';
import { preparePassage, usePassageSource } from '../memorize/usePassage';
import { daysUntil, due, type ReviewItem } from '../memorize/review';

/** Minutes, rounded up, because a session never feels shorter than it is. */
const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** Past this, most people would rather trim the drill than sit through it. */
const LONG_SESSION = 30;

export function HomeView({
  prefs,
  update,
  items,
  onOpenPicker,
  onOpenSettings,
  onStart,
}: {
  prefs: Preferences;
  update: (v: Partial<Preferences>) => void;
  items: readonly ReviewItem[];
  onOpenPicker: () => void;
  onOpenSettings: () => void;
  onStart: (screen: 'session' | 'practice') => void;
}) {
  const surah = surahs[prefs.surah - 1];
  const reciter = findReciter(prefs.reciter);
  const { loaded, failed, retry } = usePassageSource(
    prefs.surah,
    prefs.reciter,
    prefs.grain,
  );
  /* Costing al-Baqarah whole takes milliseconds, and this screen re-renders on
     every keystroke in the ayah fields. */
  const passage = useMemo(
    () =>
      loaded
        ? preparePassage(
            loaded,
            prefs.ayah,
            prefs.to,
            prefs.grain,
            prefs.plan,
            prefs.echo,
            reciter.pace,
          )
        : null,
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
  const pending = due(items);
  const ayat = prefs.to - prefs.ayah + 1;
  /* Listening on its own is a way people use the app, not a setting turned
     off, so it sits here rather than in the sheet. Coming back to repeating
     restores the gap the learner had chosen, which is why it is kept. */
  const repeating = prefs.echo !== 'off';
  const lastGap = useRef<EchoMode>(repeating ? prefs.echo : 1);

  const setRange = (from: number, to: number) => {
    const start = Math.max(1, Math.min(surah.count, from));
    update({ ayah: start, to: Math.max(start, Math.min(surah.count, to)) });
  };

  return (
    <>
      <div className="intro">
        <h1>حفظ القرآن</h1>
        <p>اسمع، وردّد، واربط ما حفظت بما قبله.</p>
      </div>

      {pending.length > 0 && (
        <section className="review-card" aria-labelledby="due-heading">
          <h2 id="due-heading">
            مراجعة اليوم
            <span className="count">{arabic(pending.length)}</span>
          </h2>
          <ul>
            {pending.slice(0, 2).map((item) => {
              const late = -daysUntil(item.due);
              return (
                <li key={item.id}>
                  <button
                    onClick={() =>
                      update({
                        surah: item.surah,
                        ayah: item.from,
                        to: item.to,
                      })
                    }
                  >
                    <span>
                      سورة {surahs[item.surah - 1].name}
                      <small>
                        {' '}
                        {arabic(item.from)}–{arabic(item.to)}
                      </small>
                    </span>
                    <small className={late > 0 ? 'late' : undefined}>
                      {late > 0 ? `متأخرة ${daysCount(late)}` : 'اليوم'}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
          {pending.length > 2 && (
            <p className="field-note">والبقية تنتظر في خطة المراجعة.</p>
          )}
        </section>
      )}

      <section className="start-form" aria-label="اختر المقطع">
        <button
          className="surah-field"
          aria-label={`اختيار السورة، سورة ${surah.name}`}
          onClick={onOpenPicker}
        >
          <BookOpen size={21} />
          <span>
            <small>السورة</small>
            <strong>سورة {surah.name}</strong>
          </span>
          <ChevronDown size={18} />
        </button>

        <div className="range-fields">
          {/* Text rather than a number field: a number field silently throws
              away ٢٥٥, which is what an Arabic keyboard types. */}
          <div className="ayah-field">
            <label htmlFor="from-ayah">من الآية</label>
            <input
              id="from-ayah"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={arabic(prefs.ayah)}
              onChange={(e) =>
                setRange(Number(digits(e.target.value)) || 1, prefs.to)
              }
            />
          </div>
          <div className="ayah-field">
            <label htmlFor="to-ayah">إلى الآية</label>
            <input
              id="to-ayah"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={arabic(prefs.to)}
              onChange={(e) =>
                setRange(prefs.ayah, Number(digits(e.target.value)) || 1)
              }
            />
          </div>
        </div>

        <fieldset className="chip-row">
          <legend className="sr-only">طول المقطع</legend>
          {[3, 5, 10].map((n) => (
            <button
              key={n}
              className="chip"
              aria-pressed={ayat === n}
              onClick={() => setRange(prefs.ayah, prefs.ayah + n - 1)}
            >
              {ayatCount(n)}
            </button>
          ))}
          {prefs.ayah > 1 && (
            <button
              className="chip"
              onClick={() => setRange(prefs.ayah - 1, prefs.to)}
              title="ابدأ بالآية السابقة حتى يلتحم المقطع بما قبله"
            >
              <Link2 size={14} /> صِلْ بما قبلها
            </button>
          )}
        </fieldset>

        <fieldset className="grain-row">
          <legend className="setting-label">يُكرّر كل</legend>
          <div className="segmented grain-choice">
            {grains.map((grain: Grain) => (
              <label key={String(grain)} data-active={prefs.grain === grain}>
                <input
                  className="sr-only"
                  type="radio"
                  name="grain"
                  checked={prefs.grain === grain}
                  onChange={() => update({ grain })}
                />
                {grainLabel(grain)}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Only when it is chosen, because it is the one option whose meaning
            is not on its face: the others say their own size. */}
        {prefs.grain === 'phrase' && (
          <p className="field-note grain-note">
            تُقسَّم الآية الطويلة عند مواضع وقف القارئ، وتبقى القصيرة آيةً واحدة.
          </p>
        )}

        <fieldset className="grain-row">
          <legend className="setting-label">
            الترديد
            {typeof prefs.echo === 'number' && (
              <span className="muted"> · سكتة {echoLabel(prefs.echo)}</span>
            )}
          </legend>
          <div className="segmented">
            <label data-active={repeating}>
              <input
                className="sr-only"
                type="radio"
                name="echo-mode"
                checked={repeating}
                onChange={() => update({ echo: lastGap.current })}
              />
              أستمع وأُردّد
            </label>
            <label data-active={!repeating}>
              <input
                className="sr-only"
                type="radio"
                name="echo-mode"
                checked={!repeating}
                onChange={() => {
                  if (prefs.echo !== 'off') lastGap.current = prefs.echo;
                  update({ echo: 'off' });
                }}
              />
              أستمع فقط
            </label>
          </div>
        </fieldset>

        <output className="session-estimate">
          {failed ? (
            <>
              تعذّر تحميل النص.{' '}
              <button className="text-button" onClick={retry}>
                إعادة المحاولة
              </button>
            </>
          ) : passage ? (
            <>
              <span>
                <Clock size={15} /> نحو {minutesCount(minutes(passage.seconds))}
              </span>
              <span>
                <Repeat size={15} /> {timesCount(passage.plays)}
              </span>
            </>
          ) : (
            <span>جارٍ الحساب…</span>
          )}
        </output>

        {/* The estimate is a number; this is what to do about it. */}
        {passage && minutes(passage.seconds) > LONG_SESSION && (
          <p className="field-note long-session">
            جلسة طويلة. ضيّق المدى، أو{' '}
            <button className="text-button" onClick={onOpenSettings}>
              خفّف التكرار
            </button>
            .
          </p>
        )}

        <button
          className="primary-button"
          disabled={!passage || passage.steps.length === 0}
          onClick={() => onStart('session')}
        >
          ابدأ جلسة التلقين
          <ChevronLeft size={20} />
        </button>
        <button className="text-button" onClick={() => onStart('practice')}>
          أو راجِع بنفسك، آيةً آية
        </button>
        <p className="save-hint">يُحفظ موضعك تلقائيًا على هذا الجهاز</p>
      </section>
    </>
  );
}
