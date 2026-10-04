import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronLeft, Play, Square } from 'lucide-react';
import {
  audioMirrors,
  ayahAudioUrl,
  cutsPhrases,
  findReciter,
  paceLabel,
  reciters,
  type Reciter,
} from '../data/audio';
import { Panel } from './Panel';
import { AyahList, SurahSearch, useAyahChoices } from './PassageFields';
import {
  surahs,
  arabic,
  ayatCount,
  daysCount,
  type Preferences,
} from '../data/quran';
import { echoLabel, echoModes, type EchoMode } from '../memorize/session';
import { MAX_INTERVAL } from '../memorize/review';
import type { SchedulePlan } from '../memorize/schedule';
import { Stepper } from './Stepper';

export function Picker({
  onClose,
  prefs,
  onSelect,
}: {
  onClose: () => void;
  prefs: Preferences;
  onSelect: (surah: number, from: number, to: number) => void;
}) {
  const [id, setId] = useState(prefs.surah);
  /* Held as plain digits and shown in Arabic-Indic ones, so a field can be
     emptied while it is being retyped and still be checked as a number. */
  const [from, setFrom] = useState(String(prefs.ayah));
  const [to, setTo] = useState(String(prefs.to));
  const selected = surahs[id - 1];
  const choices = useAyahChoices(id);
  const inRange = (value: string) =>
    Number.isInteger(Number(value)) &&
    Number(value) >= 1 &&
    Number(value) <= selected.count;
  const valid = inRange(from) && inRange(to) && Number(to) >= Number(from);

  return (
    <Panel
      onClose={onClose}
      title="اختر المقطع"
      description="اختر السورة وأول آية وآخر آية."
    >
      <label className="setting-label" htmlFor="surah-search">
        السورة
      </label>
      <SurahSearch
        id="surah-search"
        className="surah-search"
        value={id}
        onChange={(s) => {
          setId(s.id);
          setFrom('1');
          setTo(String(Math.min(s.count, 5)));
        }}
      />
      <div className="picker-meta">
        السورة {arabic(id)} من ١١٤ <span>{ayatCount(selected.count)}</span>
      </div>
      <div className="range-fields">
        <AyahList
          id="picker-from"
          label="من الآية"
          value={from}
          items={choices}
          invalid={!inRange(from)}
          describedBy={valid ? undefined : 'picker-error'}
          onChange={(digits_) => {
            setFrom(digits_);
            // A passage cannot end before it starts, so the far end gives way
            // rather than leaving the reader with an error to clear.
            if (digits_ && Number(to) < Number(digits_)) setTo(digits_);
          }}
        />
        <AyahList
          id="picker-to"
          label="إلى الآية"
          value={to}
          items={choices}
          invalid={!inRange(to)}
          describedBy={valid ? undefined : 'picker-error'}
          onChange={setTo}
        />
      </div>
      {!valid && (
        <p className="error-text" id="picker-error" role="alert">
          اختر آيتين بين ١ و{arabic(selected.count)}، والأولى قبل الأخيرة.
        </p>
      )}
      <button
        className="primary-button sheet-action"
        disabled={!valid}
        onClick={() => onSelect(id, Number(from), Number(to))}
      >
        تأكيد المقطع
        <ChevronLeft size={20} />
      </button>
    </Panel>
  );
}

/** The reciters in the bands `paceLabel` names, slowest first, which is the
    order `reciters` already keeps. */
const paceBands = reciters.reduce<{ label: string; members: Reciter[] }[]>(
  (bands, reciter) => {
    const label = paceLabel(reciter.pace);
    const last = bands.at(-1);
    if (last?.label === label) last.members.push(reciter);
    else bands.push({ label, members: [reciter] });
    return bands;
  },
  [],
);

/**
 * One recording at a time, played to let a reader hear a voice before
 * choosing it. A plain media element rather than the session's audio graph:
 * nothing is cut or decoded, it only has to start on a tap and stop on the
 * next one, and a media element needs no CORS header to do that.
 */
function usePreview(surah: number, ayah: number) {
  const playing = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<{
    id: string;
    phase: 'loading' | 'playing';
  } | null>(null);

  const stop = () => {
    playing.current?.pause();
    playing.current = null;
    setState(null);
  };
  // Closing the panel must not leave a voice reciting behind it.
  useEffect(() => () => playing.current?.pause(), []);

  const toggle = (id: string) => {
    const again = state?.id === id;
    stop();
    if (again) return;
    const url = ayahAudioUrl(surah, ayah, id);
    const sources = [url, ...audioMirrors(url)];
    const element = new Audio();
    let tried = 0;
    // Each handler checks it still belongs to the recording being played,
    // since a stopped one can still report an error it was already loading.
    const current = () => playing.current === element;
    const finish = () => {
      if (current()) stop();
    };
    const start = () => {
      try {
        void Promise.resolve(element.play()).catch((error: unknown) => {
          // Changing the source aborts the play before it; that is not a
          // failure. Anything else is, and leaves nothing to wait for.
          if ((error as Error)?.name !== 'AbortError') finish();
        });
      } catch {
        finish();
      }
    };
    element.addEventListener('playing', () => {
      if (current()) setState({ id, phase: 'playing' });
    });
    element.addEventListener('ended', finish);
    element.addEventListener('error', () => {
      if (!current()) return;
      tried += 1;
      if (tried >= sources.length) return finish();
      element.src = sources[tried];
      start();
    });
    element.src = sources[0];
    playing.current = element;
    setState({ id, phase: 'loading' });
    start();
  };

  return { state, toggle };
}

/**
 * The reciters, each one a tap away.
 *
 * This used to be a select inside the settings sheet, so choosing a voice
 * from the start screen meant a panel full of other settings and then a menu
 * opening on top of it: two layers, the second a list of bare names. Here
 * the voices are the panel. They are grouped by how deliberately they
 * recite, because that is what decides a sitting's length and what a learner
 * taking on new material is choosing between, and each can be heard before it
 * is chosen. Choosing one closes the panel, as choosing from any picker does.
 */
export function ReciterPicker({
  prefs,
  onSelect,
  onClose,
  onBack,
  preview,
}: {
  prefs: Preferences;
  onSelect: (reciter: string) => void;
  onClose: () => void;
  /** Present when the picker was opened from the settings. */
  onBack?: () => void;
  /**
   * Whether a voice can be sampled here. Not over a drill or free review:
   * their own recitation would be sounding under it, and the panel is modal,
   * so the transport that could stop it is out of reach.
   */
  preview: boolean;
}) {
  const { state, toggle } = usePreview(prefs.surah, prefs.ayah);
  const groups = useId();
  const surah = surahs[prefs.surah - 1];

  return (
    <Panel
      onClose={onClose}
      onBack={onBack}
      backLabel="رجوع إلى الإعدادات"
      title="اختر القارئ"
      description="اختر من يتلو عليك. القارئ المتأنّي أعون على حفظ الجديد."
    >
      {preview && (
        <p className="field-note reciter-hint">
          اضغط زرّ التشغيل بجانب القارئ لتسمعه يتلو الآية {arabic(prefs.ayah)} من
          سورة {surah.name}.
        </p>
      )}
      {paceBands.map((band, i) => (
        <section className="reciter-band" key={band.label}>
          <h3 className="reciter-band-label" id={`${groups}-${i}`}>
            أداء {band.label}
          </h3>
          <ul aria-labelledby={`${groups}-${i}`}>
            {band.members.map((r) => {
              const chosen = r.id === prefs.reciter;
              const sampling = state?.id === r.id ? state.phase : undefined;
              return (
                <li key={r.id} className="reciter-row" data-chosen={chosen}>
                  {/* A button that says whether it is the chosen one, rather
                      than a radio: arrowing through a radio group selects as
                      it goes, and selecting closes this panel. */}
                  <button
                    className="reciter-choice"
                    aria-pressed={chosen}
                    onClick={() => onSelect(r.id)}
                  >
                    <span className="reciter-choice-text">
                      <span>{r.name}</span>
                      {/* Said only where it is true: the exception is what
                          the reader needs to know, not the rule. The space
                          is for the accessible name, which would otherwise
                          run the name and the note into one word. */}
                      {!cutsPhrases(r.id) && (
                        <>
                          {' '}
                          <small>يُكرَّر بالآية كاملة، بلا تقسيم بالجملة</small>
                        </>
                      )}
                    </span>
                    {chosen && <Check size={19} aria-hidden="true" />}
                  </button>
                  {preview && (
                    <button
                      className="icon-button reciter-sample"
                      aria-label={`استمع إلى ${r.name}`}
                      aria-pressed={sampling !== undefined}
                      data-phase={sampling}
                      onClick={() => toggle(r.id)}
                    >
                      {sampling ? <Square size={15} /> : <Play size={17} />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Panel>
  );
}

export function SettingsSheet({
  onClose,
  prefs,
  update,
  onOpenReciter,
  landOn = 'title',
}: {
  onClose: () => void;
  prefs: Preferences;
  update: (v: Partial<Preferences>) => void;
  onOpenReciter: () => void;
  /** What the panel was opened to reach. Coming back from the reciters, the
      cursor goes to the row that opened them rather than to the top. */
  landOn?: 'title' | 'reciter';
}) {
  const reciter = findReciter(prefs.reciter);
  const reciterRow = useRef<HTMLButtonElement>(null);
  // The two screens name the same keys differently, and only one records.
  const inSession = prefs.screen === 'session';
  const setPlan = (patch: Partial<SchedulePlan>) =>
    update({ plan: { ...prefs.plan, ...patch } });

  return (
    <Panel
      onClose={onClose}
      title="الإعدادات"
      description="القارئ، وطريقة الترديد، والمراجعة الحرة، والمظهر."
      landOn={landOn === 'reciter' ? reciterRow : undefined}
    >
      {/* Every choice here is drawn, none behind a menu: a menu opening
          inside a panel is a second layer to find one's way out of, and none
          of these lists is long enough to need one. */}
      <h3 className="setting-group">التلاوة والترديد</h3>
      <section className="setting-section">
        <button
          ref={reciterRow}
          className="choice-row"
          aria-haspopup="dialog"
          onClick={onOpenReciter}
        >
          {/* The spaces are for the accessible name: three lines drawn as a
              grid are three words run together without them. */}
          <span>
            <small>القارئ</small> <strong>{reciter.name}</strong>{' '}
            <small>الأداء {paceLabel(reciter.pace)}</small>
          </span>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        {/* The only case where changing the reciter costs the learner their
            place: at «جملة» a reciter with no timing for an ayah leaves it
            whole, which is a different set of segments and so a different
            drill. At «آية» and above it never happens, so it is not said
            there. */}
        {inSession && prefs.grain === 'phrase' && (
          <p className="field-note">
            في التقسيم بالجملة قد يختلف تقسيم قارئٍ عن قارئ، فتبدأ الجلسة حينها
            من أوّلها.
          </p>
        )}
      </section>

      <fieldset className="setting-section">
        <legend>سكتة الترديد</legend>
        <div className="segmented option-grid">
          {echoModes.map((mode: EchoMode) => (
            <label key={String(mode)} data-active={prefs.echo === mode}>
              <input
                className="sr-only"
                type="radio"
                name="echo"
                checked={prefs.echo === mode}
                onChange={() => update({ echo: mode })}
              />
              {echoLabel(mode)}
            </label>
          ))}
        </div>
        <p className="field-note">
          تُقاس السكتة بطول المقطع نفسه، فتطول مع الآية الطويلة. وفي «أنا أتحكّم»
          تنتظرك الجلسة حتى تطلب المتابعة.
        </p>
      </fieldset>

      {/* How many times each step repeats is on the start screen, next to the
          estimate those numbers move. This one is not a length but the shape
          of the method, and its default of two is the method as taught. */}
      <section className="setting-section">
        <Stepper
          label="مقاطع الوصل"
          hint="كم مقطعًا سابقًا يُضَمّ"
          name="عدد مقاطع الوصل"
          value={prefs.plan.linkBack}
          min={0}
          max={5}
          zeroLabel="الكل"
          onChange={(linkBack) => setPlan({ linkBack })}
        />
        <p className="field-note">
          ضمّ كل المقاطع السابقة يجعل الجلسة تطول بسرعة كبيرة كلما زاد المدى.
          وأمّا مرات التكرار ففي الصفحة الأولى.
          {/* Everything else here is safe to change mid-drill: the silence is
              handed to the running session, and the reciter carries the
              learner's place with him. This one decides what every step after
              the first one is, so there is no place to carry, and saying so
              is better than a progress bar that jumps back unexplained. */}
          {inSession && ' وإن غيّرت عدد مقاطع الوصل الآن بدأت الجلسة من أوّلها.'}
        </p>
      </section>

      <h3 className="setting-group">المراجعة الحرة</h3>
      <fieldset className="setting-section">
        <legend>الآيات المعروضة معًا</legend>
        <div className="segmented">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} data-active={prefs.perView === n}>
              <input
                className="sr-only"
                type="radio"
                name="per-view"
                aria-label={ayatCount(n)}
                checked={prefs.perView === n}
                onChange={() => update({ perView: n })}
              />
              {arabic(n)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Not autoplay: nothing here starts a recitation. It keeps one that is
          already sounding from stopping at every move, which is what a reader
          listening through a passage expects. */}
      <fieldset className="setting-section">
        <legend>عند تغيير الآية</legend>
        <div className="segmented">
          {(
            [
              [true, 'تستمرّ التلاوة'],
              [false, 'تتوقّف'],
            ] as const
          ).map(([keepPlaying, label]) => (
            <label key={label} data-active={prefs.keepPlaying === keepPlaying}>
              <input
                className="sr-only"
                type="radio"
                name="keep-playing"
                checked={prefs.keepPlaying === keepPlaying}
                onChange={() => update({ keepPlaying })}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="field-note">
          تنتقل التلاوة مع الآية بلا حاجة إلى زر التشغيل في كل مرة.
        </p>
      </fieldset>

      <h3 className="setting-group">الواجهة</h3>
      <fieldset className="setting-section">
        <legend>المظهر</legend>
        <div className="segmented">
          {(
            [
              ['light', 'فاتح'],
              ['dark', 'داكن'],
              ['system', 'تلقائي'],
            ] as const
          ).map(([appearance, label]) => (
            <label
              key={appearance}
              data-active={prefs.appearance === appearance}
            >
              <input
                className="sr-only"
                type="radio"
                name="appearance"
                checked={prefs.appearance === appearance}
                onChange={() => update({ appearance })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="setting-section">
        <legend>اللون</legend>
        <div className="swatches">
          {(
            [
              ['gold', 'ذهبي'],
              ['sage', 'زيتوني'],
              ['blue', 'أزرق'],
              ['rose', 'وردي'],
            ] as const
          ).map(([theme, label]) => (
            <label className="swatch-label" key={theme}>
              <input
                className="sr-only"
                type="radio"
                name="theme"
                checked={prefs.theme === theme}
                onChange={() => update({ theme })}
              />
              <span className={`swatch swatch-${theme}`}>
                {prefs.theme === theme && <Check size={20} />}
              </span>
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Facts about the app rather than things to set, so they close the
          panel as a footer instead of trailing off the last setting. */}
      <section className="sheet-about" aria-label="عن التطبيق">
        <p>
          تُجدوَل المراجعة على هذا الجهاز، ولا يمرّ على أي مقطع أكثر من{' '}
          {daysCount(MAX_INTERVAL)} دون أن يعود.
        </p>
        <p>يُحفَظ موضعك وإعداداتك على هذا الجهاز وحده، ولا يُرسَل منها شيء.</p>
        <p>لا تُحفَظ التسجيلات ولا تُرسَل. تُحذَف عند تغيير الآية.</p>
        <p>
          النص القرآني من{' '}
          <a href="https://tanzil.net" target="_blank" rel="noreferrer">
            مشروع تنزيل
          </a>
          ، والتلاوات من everyayah.com.
        </p>
      </section>
      <details className="shortcut-help">
        <summary>اختصارات لوحة المفاتيح</summary>
        <dl>
          <div>
            <dt>{inSession ? 'الخطوة التالية' : 'الآيات التالية'}</dt>
            <dd>
              <kbd>←</kbd> أو <kbd>إدخال</kbd>
            </dd>
          </div>
          <div>
            <dt>{inSession ? 'الخطوة السابقة' : 'الآيات السابقة'}</dt>
            <dd>
              <kbd>→</kbd>
            </dd>
          </div>
          <div>
            <dt>تشغيل التلاوة وإيقافها</dt>
            <dd>
              <kbd>مسافة</kbd> أو <kbd>↑</kbd>
            </dd>
          </div>
          <div>
            <dt>{inSession ? 'إعادة الخطوة' : 'تكرار التلاوة'}</dt>
            <dd>
              <kbd>↓</kbd>
            </dd>
          </div>
          {!inSession && (
            <>
              <div>
                <dt>بدء التسجيل وإنهاؤه</dt>
                <dd>
                  <kbd>رفع + إدخال</kbd>
                </dd>
              </div>
              <div>
                <dt>تشغيل تسجيلك وإيقافه</dt>
                <dd>
                  <kbd>رفع + مسافة</kbd>
                </dd>
              </div>
            </>
          )}
        </dl>
        <p>
          رفع هو مفتاح Shift. عند تحديد زر، يعمل مفتاحا الإدخال والمسافة على
          تفعيله، فاستعمل الأسهم حينئذٍ. وإذا زاد النص على ما يسعه إطاره مرّره
          السهمان، ويبقى التمرير على <kbd>Page Up</kbd> و<kbd>Page Down</kbd> في
          كل حال.
        </p>
      </details>
    </Panel>
  );
}
