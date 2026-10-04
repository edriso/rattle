import { useEffect, useMemo, useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { BookOpen, ChevronDown } from 'lucide-react';
import { openVerse } from '../data/text';
import { useSurah } from '../useSurah';
import { arabic, ayatCount, digits, normalize, surahs } from '../data/quran';

/**
 * The fields that choose a passage: the surah, and either end of it by number
 * or by the words of the verse. Shared by the start screen, where they sit
 * on the page and every choice takes effect at once, and by the sheet the
 * position in a session's top bar opens, where changing the passage under a
 * running drill is worth a confirm.
 *
 * They began in that sheet alone, and the start screen opened it from a
 * button drawn to look like a field: a reader tapped what looked like the
 * surah box and was handed a modal holding a second copy of the ayah fields
 * already on the page, with a button to confirm. So the start screen holds
 * the real fields now, and the modal is left where a confirm earns its
 * place.
 */

type Surah = (typeof surahs)[number];

/* Why a field closes, among those that mean «put back what it showed». The
   others must not: Base UI closes the list when the text is cleared, and
   restoring the old value on that would make the field impossible to empty
   while retyping it, which is the defect `AyahList` exists to avoid. */
const settles = new Set([
  // Enter over a search that matched nothing closes the list with no reason
  // of its own, and left the typed text in a closed field.
  'none',
  'escape-key',
  'outside-press',
  'item-press',
  'focus-out',
  'close-press',
]);

/**
 * How far the list may hang below the field before the keyboard covers it.
 *
 * A phone's keyboard shrinks only the visual viewport, and the list sizes
 * itself against the layout one, so on a phone the bottom of a long list sat
 * under the keys where nobody could see or reach it. While a list is open
 * this measures the distance from the focused field to the bottom of what is
 * actually visible, and the stylesheet caps the list at it. By id, not
 * `document.activeElement`: a tap opens the list before it focuses the
 * input, and measuring whatever had the focus then capped the list at its
 * floor on a screen with room to spare.
 */
function useKeyboardRoom(open: boolean, id: string) {
  useEffect(() => {
    if (!open) return;
    const view = window.visualViewport;
    const fit = () => {
      const field = document.getElementById(id);
      if (!field) return;
      const bottom = view ? view.offsetTop + view.height : window.innerHeight;
      const room = bottom - field.getBoundingClientRect().bottom - 16;
      // Never so short that it shows less than three rows.
      document.documentElement.style.setProperty(
        '--keyboard-room',
        `${Math.max(140, Math.round(room))}px`,
      );
    };
    fit();
    view?.addEventListener('resize', fit);
    view?.addEventListener('scroll', fit);
    return () => {
      view?.removeEventListener('resize', fit);
      view?.removeEventListener('scroll', fit);
      document.documentElement.style.removeProperty('--keyboard-room');
    };
  }, [open, id]);
}

/** What a reader types, as opposed to the field filling itself in on a
    choice, which it reports through the same callback. */
const typed = (reason: string) =>
  reason === 'input-change' || reason === 'input-clear';

/**
 * The surah, as a search field that happens to show where you are.
 *
 * Opening it on a tap empties it, so a reader after آل عمران types straight
 * away instead of clearing البقرة first, and leaving it without choosing
 * puts the name back. That is all `draft` is: `null` whenever the field is
 * showing the surah it holds, and the text being typed otherwise, so the
 * name it falls back to always comes from the current value and can never be
 * one a handler captured before the choice landed.
 */
export function SurahSearch({
  id,
  value,
  onChange,
  className,
  children,
}: {
  id: string;
  value: number;
  onChange: (surah: Surah) => void;
  className?: string;
  /** Drawn inside the field, after the input. */
  children?: React.ReactNode;
}) {
  const selected = surahs[value - 1];
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useKeyboardRoom(open, id);
  return (
    <Combobox
      items={surahs}
      value={selected}
      inputValue={draft ?? selected.name}
      onInputValueChange={(text, details) => {
        if (typed(details.reason)) setDraft(text);
      }}
      // Typing a name and pressing Enter should take it.
      autoHighlight
      onOpenChange={(next, details) => {
        setOpen(next);
        if (next && details.reason !== 'input-change') setDraft('');
        else if (!next && settles.has(details.reason)) setDraft(null);
      }}
      itemToStringLabel={(s) => s.name}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={(item, text) => normalize(item.name).includes(normalize(text))}
      onValueChange={(s) => {
        setDraft(null);
        /* Opening the list highlights the surah already chosen, so Enter, or
           a tap on it to say «never mind», chooses it again. On the start
           screen a choice takes effect at once and a new surah starts at its
           first ayah, so passing that on reset the reader's place. */
        if (s && s.id !== value) onChange(s);
      }}
    >
      {/* No trigger button: the generated one is a tab stop with no
          accessible name, and tapping, typing or arrowing opens the list
          anyway. */}
      <ComboboxInput
        id={id}
        placeholder="ابحث عن سورة…"
        className={className}
        autoComplete="off"
        showTrigger={false}
        onBlur={() => setDraft(null)}
      >
        {children}
      </ComboboxInput>
      <ComboboxContent dir="rtl" className="surah-options">
        <ComboboxEmpty>لا توجد سورة بهذا الاسم</ComboboxEmpty>
        <ComboboxList>
          {(s: Surah) => (
            <ComboboxItem key={s.id} value={s}>
              <span>سورة {s.name}</span>
              <small>{ayatCount(s.count)}</small>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** An ayah of the chosen surah: its number, and enough of its opening to be
    recognised by somebody who knows the verse and not the number. */
export type AyahChoice = {
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

/** Every ayah of a surah, so either end of a passage can be read down rather
    than typed into. Costing al-Baqarah whole is a couple of milliseconds and
    happens once per surah, not per keystroke. */
export function useAyahChoices(surah: number): readonly AyahChoice[] {
  const { verses } = useSurah(surah);
  const count = surahs[surah - 1].count;
  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const raw = verses?.[i];
        const text = raw ? openVerse(surah, i + 1, raw).text : '';
        return { ayah: i + 1, head: opening(text), search: normalize(text) };
      }),
    [surah, count, verses],
  );
}

/**
 * One end of the passage, chosen by number or by the verse itself. Typing a
 * number takes it; anybody who knows the ayah and not its number reads down
 * the list or searches its words instead. The value is plain digits, so a
 * caller can hold an emptied field and still check it as a number.
 *
 * While it is being typed into, the field shows what was typed, and the
 * moment it settles it shows the number the passage actually holds. It has
 * to, because the start screen clamps every keystroke: a field showing the
 * clamped value fought the typing, so clearing «إلى الآية» over ٩ and typing
 * ١ then ٢ read the ١ as an inverted range, snapped it to ٥, and appended
 * the ٢ to *that*, leaving the reader on ayah ٥٢ having asked for ١٢.
 *
 * No `inputMode="numeric"`: the field takes the words of a verse as well as
 * its number, and a numeric keypad on a phone has no way to reach letters.
 * `digits()` reads the numerals either keyboard produces, which is also why
 * it is not `type="number"`, which silently throws away ٢٥٥.
 */
export function AyahList({
  id,
  label,
  value,
  items,
  invalid = false,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  items: readonly AyahChoice[];
  invalid?: boolean;
  describedBy?: string;
  onChange: (digits: string) => void;
}) {
  const shown = value ? arabic(Number(value)) : '';
  const [draft, setDraft] = useState<string | null>(null);
  const chosen = items[Number(value) - 1] ?? null;
  const [open, setOpen] = useState(false);
  useKeyboardRoom(open, id);

  return (
    <div className="ayah-field">
      <label htmlFor={id}>{label}</label>
      <Combobox
        items={items}
        value={chosen}
        inputValue={draft ?? shown}
        onInputValueChange={(text, details) => {
          if (!typed(details.reason)) return;
          setDraft(text);
          const numerals = digits(text);
          // Typing a number takes it; emptying the field takes nothing, which
          // is what lets a caller put the range in error rather than guess.
          if (numerals || !text.trim()) onChange(numerals);
        }}
        autoHighlight
        onOpenChange={(next, details) => {
          setOpen(next);
          /* Opening on a tap starts the search on an empty field, so nobody
             deletes ٢٥٥ before looking for ٢٦١. Opening because the reader
             has begun typing must keep what they typed. */
          if (next && details.reason !== 'input-change') setDraft('');
          else if (!next && settles.has(details.reason)) setDraft(null);
        }}
        itemToStringLabel={(item) => arabic(item.ayah)}
        isItemEqualToValue={(a, b) => a.ayah === b.ayah}
        filter={(item, text) => {
          const numerals = digits(text);
          if (numerals) return String(item.ayah).startsWith(numerals);
          const words = normalize(text.trim());
          return !words || item.search.includes(words);
        }}
        onValueChange={(item) => {
          setDraft(null);
          if (item) onChange(String(item.ayah));
        }}
      >
        <ComboboxInput
          id={id}
          className="ayah-search"
          placeholder="الرقم أو أول الآية…"
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          showTrigger={false}
          onBlur={() => setDraft(null)}
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

/**
 * The passage fields as the start screen draws them: the surah box, and the
 * two ends under it. Every choice takes effect at once.
 *
 * The whole box is the input, with the label and icons drawn over it and
 * letting taps through, so anywhere a finger lands opens the list.
 */
export function StartPassage({
  surah,
  from,
  to,
  onSurah,
  onRange,
}: {
  surah: number;
  from: number;
  to: number;
  onSurah: (surah: Surah) => void;
  onRange: (from: number, to: number) => void;
}) {
  const choices = useAyahChoices(surah);
  return (
    <>
      <div className="surah-field surah-box">
        <BookOpen size={21} aria-hidden="true" />
        <label htmlFor="surah">السورة</label>
        <SurahSearch
          id="surah"
          className="surah-box-input"
          value={surah}
          onChange={onSurah}
        />
        <ChevronDown size={18} aria-hidden="true" />
      </div>
      <div className="range-fields">
        <AyahList
          id="from-ayah"
          label="من الآية"
          value={String(from)}
          items={choices}
          onChange={(value) => value && onRange(Number(value), to)}
        />
        <AyahList
          id="to-ayah"
          label="إلى الآية"
          value={String(to)}
          items={choices}
          onChange={(value) => value && onRange(from, Number(value))}
        />
      </div>
    </>
  );
}
