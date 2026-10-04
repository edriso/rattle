import { useEffect, useMemo, useRef, useState } from 'react';
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

/* The fields carry the combobox and the positioning it brings, which would
   add more than half again to the script the first paint waits on. They are
   fetched the moment this screen renders, and until they land the screen
   draws the same boxes holding the same values, so nothing moves when they
   arrive.

   A chunk can fail to arrive: a flaky connection, or a deploy that renamed
   it under a tab opened before. Through `lazy` with nothing to catch it,
   React unmounts the whole screen, so this loads the module itself and keeps
   the boxes up when it fails. The way on is a reload, not another `import()`:
   a browser may remember the failed one, and after a deploy the old name is
   gone for good, while a reload asks for the current names. Nothing is lost
   to it, since the position and settings are already saved. Once loaded the
   module is kept for the life of the page, so coming back to this screen
   draws the fields straight away. */
type Fields = typeof import('./PassageFields');
let loadedFields: Fields | null = null;

function usePassageFields() {
  const [fields, setFields] = useState(loadedFields);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (fields) return;
    let live = true;
    import('./PassageFields').then(
      (module) => {
        loadedFields = module;
        if (live) setFields(module);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [fields]);
  return { fields, failed };
}

/** The passage fields as they look before they can be used: the same boxes
    holding the same values, laid out exactly where the inputs will be. */
function PassagePlaceholder({
  surah,
  from,
  to,
  onRetry,
}: {
  surah: string;
  from: number;
  to: number;
  onRetry?: () => void;
}) {
  return (
    <div aria-busy={!onRetry}>
      <div className="surah-field surah-box">
        <BookOpen size={21} aria-hidden="true" />
        <span className="surah-box-label">السورة</span>
        <span className="surah-box-static">{surah}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </div>
      <div className="range-fields">
        {(
          [
            ['من الآية', from],
            ['إلى الآية', to],
          ] as const
        ).map(([label, n]) => (
          <div className="ayah-field" key={label}>
            <span>{label}</span>
            <span className="ayah-static">{arabic(n)}</span>
          </div>
        ))}
      </div>
      {onRetry && (
        <p className="field-note" role="alert">
          تعذّر تحميل حقول الاختيار.{' '}
          <button className="text-button inline-retry" onClick={onRetry}>
            إعادة المحاولة
          </button>
        </p>
      )}
    </div>
  );
}

/** Minutes, rounded up, because a session never feels shorter than it is. */
const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** Past this, most people would rather trim the drill than sit through it. */
const LONG_SESSION = 30;

/** What is left to choose from for a mushaf with no published word timings. */
const ayahGrains = grains.filter((grain) => grain !== 'phrase');

export function HomeView({
  prefs,
  update,
  items,
  onOpenReciter,
  onStart,
}: {
  prefs: Preferences;
  update: (v: Partial<Preferences>) => void;
  items: readonly ReviewItem[];
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
  const { fields, failed: fieldsFailed } = usePassageFields();
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
                      {late > 0 ? `متأخّرة ${daysCount(late)}` : 'اليوم'}
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

      <section aria-label="اختر المقطع">
        {/* The real fields, not a button that opens them. The surah box used
            to open the passage sheet, which repeated the ayah fields below it
            and asked for a confirm; a reader tapping what looks like the
            surah box expects to search right there. */}
        {fields ? (
          <fields.StartPassage
            surah={prefs.surah}
            from={prefs.ayah}
            to={prefs.to}
            onSurah={(next) =>
              /* A new surah starts at its first ayah and keeps the length
                 the reader had chosen, so «طول المدى» stays as it was. */
              update({
                surah: next.id,
                ayah: 1,
                to: Math.min(next.count, ayat),
              })
            }
            onRange={setRange}
          />
        ) : (
          <PassagePlaceholder
            surah={surah.name}
            from={prefs.ayah}
            to={prefs.to}
            onRetry={fieldsFailed ? () => location.reload() : undefined}
          />
        )}

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
          <legend className="setting-label">مقدار المقطع</legend>
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
            تُقسَّم الآية الطويلة عند مواضع وقف القارئ، وتبقى القصيرة آيةً واحدةً.
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
            {/* «أنا أتحكّم» is named without «سكتة» in front of it, because it
                is not a length: it is the drill waiting to be told to go on.
                It used to be the one mode this screen did not name, and it is
                the one whose meaning a learner most needs before they begin,
                since the drill stops after the first segment and waits. */}
            {prefs.echo !== 'off' && (
              <span className="muted">
                {' · '}
                {typeof prefs.echo === 'number'
                  ? `سكتة ${echoLabel(prefs.echo)}`
                  : echoLabel(prefs.echo)}
              </span>
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
            decides it: the most deliberate mushaf here takes over three times
            as long as the swiftest over the same passage, 0.659 seconds per
            letter against 0.201. The output is named, because a reader
            hearing «نحو ٣ دقائق» needs to know what it is costing. */}
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
            aria-haspopup="dialog"
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
          أو راجِع بنفسك، آيةً آيةً
        </button>
        <p className="save-hint">يُحفَظ موضعك تلقائيًا على هذا الجهاز</p>
      </section>
    </>
  );
}
