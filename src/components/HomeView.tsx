import { useMemo, useRef, useState } from 'react';
import {
  AudioLines,
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
import { cutsPhrases, findReciter } from '../data/audio';
import {
  echoLabel,
  grainLabel,
  grains,
  type EchoMode,
  type Grain,
} from '../memorize/session';
import { preparePassage, usePassageSource } from '../memorize/usePassage';
import { daysUntil, due, type ReviewItem } from '../memorize/review';
import type { SchedulePlan } from '../memorize/schedule';
import { Repetitions } from './Repetitions';

/** Minutes, rounded up, because a session never feels shorter than it is. */
const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** Past this, most people would rather trim the drill than sit through it. */
const LONG_SESSION = 30;

/** What is left to choose from for a mushaf with no published word timings. */
const ayahGrains = grains.filter((grain) => grain !== 'phrase');

/**
 * One end of the passage.
 *
 * While it is being typed into, the field shows what was typed; the moment it
 * is left, it shows the number the passage actually holds. It has to hold that
 * draft, for two reasons that are really one. The field used to refuse to go
 * blank, so a reader who wanted ٦ had to select the ١ and type over it. And
 * the passage clamps every keystroke, so a field showing the clamped value
 * fought the typing: clearing «إلى الآية» over ٩ and typing ١ then ٢ read the
 * ١ as an inverted range, snapped it to ٥, and appended the ٢ to *that*,
 * leaving the reader on ayah ٥٢ having asked for ١٢.
 *
 * Text rather than a number field, because a number field silently throws away
 * ٢٥٥, which is what an Arabic keyboard types.
 */
function AyahField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="ayah-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? arabic(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          const typed = digits(event.target.value);
          if (typed) onChange(Number(typed));
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

export function HomeView({
  prefs,
  update,
  items,
  onOpenPicker,
  onOpenReciter,
  onStart,
}: {
  prefs: Preferences;
  update: (v: Partial<Preferences>) => void;
  items: readonly ReviewItem[];
  onOpenPicker: () => void;
  onOpenReciter: () => void;
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
  const phrases = cutsPhrases(prefs.reciter);
  /* Listening on its own is a way people use the app, not a setting turned
     off, so it sits here rather than in the sheet. Coming back to repeating
     restores the gap the learner had chosen, which is why it is kept. */
  const repeating = prefs.echo !== 'off';
  const lastGap = useRef<EchoMode>(repeating ? prefs.echo : 1);
  const setPlan = (patch: Partial<SchedulePlan>) =>
    update({ plan: { ...prefs.plan, ...patch } });

  /* Both ends are clamped to the surah, and the far one gives way rather than
     leaving a range that ends before it starts. The fields hold their own
     draft while they are being typed into, so the clamp is never what the
     next keystroke lands on. */
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
          <AyahField
            id="from-ayah"
            label="من الآية"
            value={prefs.ayah}
            onChange={(from) => setRange(from, prefs.to)}
          />
          <AyahField
            id="to-ayah"
            label="إلى الآية"
            value={prefs.to}
            onChange={(to) => setRange(prefs.ayah, to)}
          />
        </div>

        {/* The label is on the screen and not only in the accessible tree:
            these set how many ayat the passage covers, and a reader took them
            for repetition counts, which are two rows further down. */}
        <fieldset className="chip-row">
          <legend className="setting-label">طول المدى</legend>
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
            {/* «جملة» is offered only for a mushaf whose word timings have
                been published, because cutting inside an ayah is what needs
                them. Offering it otherwise would promise a cut the app cannot
                make. */}
            {(phrases ? grains : ayahGrains).map((grain: Grain) => (
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
        {!phrases && (
          <p className="field-note grain-note">
            لم يُنشَر تزمين الكلمات لتلاوة {reciter.name}، فأقلّ ما يُكرَّر آية كاملة.
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

        <Repetitions plan={prefs.plan} onChange={setPlan} />

        {/* What the drill will cost, and beside it the one other thing that
            decides it: a deliberate reciter takes half again as long as a
            swift one over the same passage. The output is named, because a
            reader hearing «نحو ٣ دقائق» needs to know what it is costing. */}
        <div className="estimate-row">
          <output className="session-estimate" aria-label="تقدير الجلسة">
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
                  <Clock size={15} /> نحو{' '}
                  {minutesCount(minutes(passage.seconds))}
                </span>
                <span>
                  <Repeat size={15} /> {timesCount(passage.plays)}
                </span>
              </>
            ) : (
              <span>جارٍ الحساب…</span>
            )}
          </output>
          {/* The short name, because this is one line of a phone shared with
              the estimate. The pace band is not repeated here: it is what the
              estimate beside it is already saying, in minutes. */}
          <button
            className="reciter-pick"
            aria-label={`القارئ، ${reciter.name}`}
            onClick={onOpenReciter}
          >
            <AudioLines size={15} />
            <span>{reciter.short}</span>
            <ChevronDown size={15} />
          </button>
        </div>

        {/* The estimate is a number; this is what to do about it. */}
        {passage && minutes(passage.seconds) > LONG_SESSION && (
          <p className="field-note long-session">
            جلسة طويلة. ضيّق المدى، أو خفّف مرات التكرار.
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
