import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, ChevronLeft } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { findReciter, paceLabel, reciters } from '../data/audio';
import { cachedSurah, loadSurah, openVerse } from '../data/text';
import {
  surahs,
  arabic,
  ayatCount,
  digits,
  normalize,
  type Preferences,
} from '../data/quran';
import { echoLabel, echoModes, type EchoMode } from '../memorize/session';
import { MAX_INTERVAL } from '../memorize/review';
import type { SchedulePlan } from '../memorize/schedule';
import { Stepper } from './Stepper';

function Panel({
  open,
  onClose,
  title,
  description,
  landOn,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** Where the cursor goes, when it is not the panel's own name. */
  landOn?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  /* Opening a panel puts the cursor on its title, not on the close button:
     landing on «إغلاق» reads as though leaving were the thing to do, and a
     screen reader hears the panel's name instead of "close". */
  const heading = useRef<HTMLDivElement>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="left"
        className="rattil-sheet"
        showCloseButton={false}
        initialFocus={landOn ?? heading}
        dir="rtl"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading" ref={heading} tabIndex={-1}>
          <SheetTitle>{title}</SheetTitle>
          <SheetClose className="icon-button" aria-label="إغلاق">
            <X size={21} />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** An ayah of the chosen surah: its number, and enough of its opening to be
    recognised by somebody who knows the verse and not the number. */
type AyahChoice = {
  ayah: number;
  head: string;
  /** The whole verse, folded for searching, so a half-remembered phrase from
      the middle of it finds the ayah too. */
  search: string;
};

/** Words of the opening shown in the list. Seven is what fits one line on a
    phone; the rest is what the search looks through. */
const HEAD_WORDS = 7;

const opening = (text: string) => {
  const words = text.split(' ').filter(Boolean);
  return words.length > HEAD_WORDS
    ? `${words.slice(0, HEAD_WORDS).join(' ')}…`
    : words.join(' ');
};

/**
 * The chosen surah's verses, or null until they arrive. Nothing waits on them:
 * the ayah fields work as number fields meanwhile, and a surah whose text
 * cannot be loaded simply never shows its openings.
 */
function useVerses(surah: number) {
  const [result, setResult] = useState<{
    id: number;
    verses?: readonly string[];
  }>(() => ({ id: surah, verses: cachedSurah(surah) }));
  /* Read through the module cache during render rather than reaching for it in
     the effect, so a surah already in memory has its openings on first paint. */
  const verses =
    cachedSurah(surah) ?? (result.id === surah ? result.verses : undefined);
  useEffect(() => {
    if (verses) return;
    let active = true;
    void loadSurah(surah).then(
      (text) => {
        if (active) setResult({ id: surah, verses: text });
      },
      () => {
        if (active) setResult({ id: surah });
      },
    );
    return () => {
      active = false;
    };
  }, [surah, verses]);
  return verses;
}

/**
 * One end of the passage, chosen by number or by the verse itself. Typing a
 * number takes it, as the plain field it replaces did; anybody who knows the
 * ayah and not its number reads down the list or searches its words instead.
 * The value is held as plain digits so the field can be empty while it is
 * being retyped and still be checked as a number.
 */
function AyahList({
  id,
  label,
  value,
  items,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  items: readonly AyahChoice[];
  invalid: boolean;
  describedBy?: string;
  onChange: (digits: string) => void;
}) {
  const shown = value ? arabic(Number(value)) : '';
  /* What is typed matters only while the list is open. Closed, the field shows
     the number the passage actually holds, so a close never has to restore
     anything and can never restore something stale: choosing an ayah closes
     the list in the same breath, and a handler holding the old number would
     put it straight back. */
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const chosen = items[Number(value) - 1] ?? null;

  return (
    <div className="ayah-field">
      <label htmlFor={id}>{label}</label>
      <Combobox
        items={items}
        value={chosen}
        inputValue={open ? typed : shown}
        onInputValueChange={(text) => {
          setTyped(text);
          const numerals = digits(text);
          // Typing a number takes it; emptying the field takes nothing, which
          // is what puts the range in error rather than guessing at one.
          if (numerals || !text.trim()) onChange(numerals);
        }}
        autoHighlight
        onOpenChange={(next, details) => {
          setOpen(next);
          /* Opening on a tap starts the search on an empty field, so nobody
             deletes ٢٥٥ before looking for ٢٦١. Opening because the reader has
             begun typing must keep what they typed. */
          if (next && details.reason !== 'input-change') setTyped('');
        }}
        itemToStringLabel={(item) => arabic(item.ayah)}
        isItemEqualToValue={(a, b) => a.ayah === b.ayah}
        filter={(item, text) => {
          const typed = digits(text);
          if (typed) return String(item.ayah).startsWith(typed);
          const words = normalize(text.trim());
          return !words || item.search.includes(words);
        }}
        onValueChange={(item) => {
          if (item) onChange(String(item.ayah));
        }}
      >
        {/* No trigger button: the generated one is a tab stop with no
            accessible name, and typing or arrowing opens the list anyway. */}
        {/* No `inputMode="numeric"`: this field takes the words of a verse as
            well as its number, and a numeric keypad on a phone has no way to
            reach letters. `digits()` reads the numerals either keyboard
            produces. */}
        <ComboboxInput
          id={id}
          className="ayah-search"
          placeholder="الرقم أو أول الآية…"
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          showTrigger={false}
        />
        <ComboboxContent dir="rtl" className="ayah-options">
          <ComboboxEmpty>لا توجد آية بهذا الرقم أو النص</ComboboxEmpty>
          <ComboboxList>
            {(item: AyahChoice) => (
              <ComboboxItem key={item.ayah} value={item}>
                <span className="ayah-option-number">{arabic(item.ayah)}</span>
                <span className="ayah-option-head">{item.head}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

export function Picker({
  open,
  onClose,
  prefs,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  onSelect: (surah: number, from: number, to: number) => void;
}) {
  const [id, setId] = useState(prefs.surah);
  /* The field is a search box that happens to show the current surah. Opening
     it empties it, so a reader after آل عمران types straight away instead of
     clearing البقرة first; closing it without choosing puts the name back.
     The ref, not `selected`, is what a close reads: picking a surah closes the
     list in the same breath, and a handler would still see the old one. */
  const [query, setQuery] = useState(() => surahs[prefs.surah - 1].name);
  const chosen = useRef(prefs.surah);
  /* Held as plain digits and shown in Arabic-Indic ones, so a field can be
     emptied while it is being retyped and still be checked as a number. */
  const [from, setFrom] = useState(String(prefs.ayah));
  const [to, setTo] = useState(String(prefs.to));
  const selected = surahs[id - 1];
  /* Every ayah of the chosen surah, so either field can be read down rather
     than typed into. Costing al-Baqarah whole is a couple of milliseconds and
     happens once per surah, not per keystroke. */
  const verses = useVerses(id);
  const choices = useMemo(
    () =>
      Array.from({ length: selected.count }, (_, i) => {
        const raw = verses?.[i];
        const text = raw ? openVerse(id, i + 1, raw).text : '';
        return {
          ayah: i + 1,
          head: opening(text),
          search: normalize(text),
        };
      }),
    [id, selected.count, verses],
  );
  const inRange = (value: string) =>
    Number.isInteger(Number(value)) &&
    Number(value) >= 1 &&
    Number(value) <= selected.count;
  const valid = inRange(from) && inRange(to) && Number(to) >= Number(from);

  return (
    <Panel
      open={open}
      onClose={onClose}
      title="اختر المقطع"
      description="اختر السورة وأول آية وآخر آية."
    >
      <label className="setting-label" htmlFor="surah-search">
        السورة
      </label>
      <Combobox
        items={surahs}
        value={selected}
        inputValue={query}
        onInputValueChange={setQuery}
        // Typing a name and pressing Enter should take it.
        autoHighlight
        onOpenChange={(opening) =>
          setQuery(opening ? '' : surahs[chosen.current - 1].name)
        }
        itemToStringLabel={(s) => s.name}
        isItemEqualToValue={(a, b) => a.id === b.id}
        filter={(item, text) => normalize(item.name).includes(normalize(text))}
        onValueChange={(s) => {
          if (!s) return;
          chosen.current = s.id;
          setId(s.id);
          setFrom('1');
          setTo(String(Math.min(s.count, 5)));
        }}
      >
        {/* No trigger button: the generated one is a tab stop with no
            accessible name, and typing or arrowing opens the list anyway. */}
        <ComboboxInput
          id="surah-search"
          placeholder="ابحث عن سورة…"
          className="surah-search"
          showTrigger={false}
        />
        <ComboboxContent dir="rtl" className="surah-options">
          <ComboboxEmpty>لا توجد سورة بهذا الاسم</ComboboxEmpty>
          <ComboboxList>
            {(s) => (
              <ComboboxItem key={s.id} value={s}>
                <span>سورة {s.name}</span>
                <small>{ayatCount(s.count)}</small>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
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

export function SettingsSheet({
  open,
  onClose,
  prefs,
  update,
  landOn = 'title',
}: {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  update: (v: Partial<Preferences>) => void;
  /** What the panel was opened to reach. The start screen's reciter button
      opens this same panel, and a reader who tapped a reciter should not have
      to find him again. */
  landOn?: 'title' | 'reciter';
}) {
  const reciter = findReciter(prefs.reciter);
  const reciterTrigger = useRef<HTMLButtonElement>(null);
  // The two screens name the same keys differently, and only one records.
  const inSession = prefs.screen === 'session';
  const setPlan = (patch: Partial<SchedulePlan>) =>
    update({ plan: { ...prefs.plan, ...patch } });

  return (
    <Panel
      open={open}
      onClose={onClose}
      title="الإعدادات"
      description="القارئ، وطريقة التكرار، والمظهر."
      landOn={landOn === 'reciter' ? reciterTrigger : undefined}
    >
      <section className="setting-section">
        <div className="setting-label" id="reciter-label">
          القارئ
        </div>
        <Select
          value={prefs.reciter}
          onValueChange={(v) => {
            if (v) update({ reciter: v });
          }}
        >
          <SelectTrigger
            ref={reciterTrigger}
            className="setting-select"
            aria-labelledby="reciter-label"
          >
            <SelectValue>{reciter.name}</SelectValue>
          </SelectTrigger>
          <SelectContent dir="rtl">
            {reciters.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                <span>{r.name}</span>
                <small className="muted"> · {paceLabel(r.pace)}</small>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="field-note">
          الأداء {paceLabel(reciter.pace)}. التلاوات من everyayah.com.
        </p>
      </section>

      <section className="setting-section">
        <div className="setting-label" id="echo-label">
          سكتة الترديد
        </div>
        <Select
          value={String(prefs.echo)}
          onValueChange={(v) => {
            if (!v) return;
            const echo = (
              v === 'off' || v === 'manual' ? v : Number(v)
            ) as EchoMode;
            update({ echo });
          }}
        >
          <SelectTrigger
            className="setting-select"
            aria-labelledby="echo-label"
          >
            <SelectValue>{echoLabel(prefs.echo)}</SelectValue>
          </SelectTrigger>
          <SelectContent dir="rtl">
            {echoModes.map((mode) => (
              <SelectItem key={String(mode)} value={String(mode)}>
                {echoLabel(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="field-note">
          تُقاس السكتة بطول المقطع نفسه، فتطول مع الآية الطويلة. واختر «استماع
          فقط» إن أردت تكرار السماع بلا ترديد.
        </p>
      </section>

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
          {inSession && ' وتغييرها الآن تبدأ الجلسة من أوّلها.'}
        </p>
      </section>

      <section className="setting-section">
        <div className="setting-label" id="count-label">
          الآيات في المراجعة الحرة
        </div>
        <Select
          value={String(prefs.perView)}
          onValueChange={(v) => {
            if (v) update({ perView: Number(v) });
          }}
        >
          <SelectTrigger
            className="setting-select"
            aria-labelledby="count-label"
          >
            <SelectValue>{ayatCount(prefs.perView)}</SelectValue>
          </SelectTrigger>
          <SelectContent dir="rtl">
            {[1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {ayatCount(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

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
          في المراجعة الحرة، تنتقل التلاوة مع الآية بلا حاجة إلى زر التشغيل في كل
          مرة.
        </p>
      </fieldset>

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
          {arabic(MAX_INTERVAL)} يومًا دون أن يعود.
        </p>
        <p>لا تُحفَظ التسجيلات ولا تُرسَل. تُحذَف عند تغيير الآية.</p>
        <p>
          النص القرآني من{' '}
          <a href="https://tanzil.net" target="_blank" rel="noreferrer">
            مشروع تنزيل
          </a>
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
