import { useState } from 'react';
import { X, Check, ChevronLeft, Minus, Plus } from 'lucide-react';
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
import { surahs, arabic, normalize, type Preferences } from '../data/quran';
import { echoLabel, echoModes, type EchoMode } from '../memorize/session';
import { MAX_INTERVAL } from '../memorize/review';
import type { SchedulePlan } from '../memorize/schedule';

function Panel({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
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
        dir="rtl"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
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

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  zeroLabel,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  zeroLabel?: string;
  onChange: (value: number) => void;
}) {
  const shown = value === 0 && zeroLabel ? zeroLabel : arabic(value);
  return (
    <div className="stepper">
      <span className="stepper-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="stepper-controls">
        {/* `aria-disabled`, not `disabled`: a button that disables itself the
            moment it is pressed drops the keyboard where it stands. */}
        <button
          className="icon-button"
          aria-label={`أنقص ${label}`}
          aria-disabled={value <= min}
          onClick={() => value > min && onChange(value - 1)}
        >
          <Minus size={17} />
        </button>
        <output aria-label={label}>{shown}</output>
        <button
          className="icon-button"
          aria-label={`زد ${label}`}
          aria-disabled={value >= max}
          onClick={() => value < max && onChange(value + 1)}
        >
          <Plus size={17} />
        </button>
      </span>
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
  const [from, setFrom] = useState(String(prefs.ayah));
  const [to, setTo] = useState(String(prefs.to));
  const selected = surahs[id - 1];
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
        itemToStringLabel={(s) => s.name}
        isItemEqualToValue={(a, b) => a.id === b.id}
        filter={(item, query) =>
          normalize(item.name).includes(normalize(query))
        }
        onValueChange={(s) => {
          if (!s) return;
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
                <small>{arabic(s.count)} آية</small>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <div className="picker-meta">
        السورة {arabic(id)} من ١١٤ <span>{arabic(selected.count)} آية</span>
      </div>
      <div className="range-fields">
        <div className="ayah-field">
          <label htmlFor="picker-from">من الآية</label>
          <input
            className="full-input"
            id="picker-from"
            aria-describedby={valid ? undefined : 'picker-error'}
            type="number"
            inputMode="numeric"
            min={1}
            max={selected.count}
            value={from}
            aria-invalid={!inRange(from)}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="ayah-field">
          <label htmlFor="picker-to">إلى الآية</label>
          <input
            className="full-input"
            id="picker-to"
            aria-describedby={valid ? undefined : 'picker-error'}
            type="number"
            inputMode="numeric"
            min={1}
            max={selected.count}
            value={to}
            aria-invalid={!inRange(to)}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
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
}: {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  update: (v: Partial<Preferences>) => void;
}) {
  const reciter = findReciter(prefs.reciter);
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

      <details className="advanced">
        <summary>عدد مرات التكرار</summary>
        <Stepper
          label="المقطع منفردًا"
          hint="تلقين"
          value={prefs.plan.singleReps}
          min={0}
          max={10}
          zeroLabel="بلا"
          onChange={(singleReps) => setPlan({ singleReps })}
        />
        <Stepper
          label="الوصل بما قبله"
          hint="ربط"
          value={prefs.plan.linkReps}
          min={0}
          max={10}
          zeroLabel="بلا"
          onChange={(linkReps) => setPlan({ linkReps })}
        />
        <Stepper
          label="مقاطع الوصل"
          hint="كم مقطعًا سابقًا يُضَم"
          value={prefs.plan.linkBack}
          min={0}
          max={5}
          zeroLabel="الكل"
          onChange={(linkBack) => setPlan({ linkBack })}
        />
        <Stepper
          label="السرد الأخير"
          hint="المقطع كاملًا"
          value={prefs.plan.reciteReps}
          min={0}
          max={10}
          zeroLabel="بلا"
          onChange={(reciteReps) => setPlan({ reciteReps })}
        />
        <p className="field-note">
          ضمّ كل المقاطع السابقة يجعل الجلسة تطول بسرعة كبيرة كلما زاد المدى.
        </p>
      </details>

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
            <SelectValue>
              {prefs.perView === 1
                ? 'آية واحدة'
                : prefs.perView === 2
                  ? 'آيتان'
                  : `${arabic(prefs.perView)} آيات`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent dir="rtl">
            {[1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 1
                  ? 'آية واحدة'
                  : n === 2
                    ? 'آيتان'
                    : `${arabic(n)} آيات`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

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

      <p className="field-note">
        تُجدوَل المراجعة على هذا الجهاز، ولا يمرّ على أي مقطع أكثر من{' '}
        {arabic(MAX_INTERVAL)} يومًا دون أن يعود.
      </p>
      <p className="field-note">
        لا تُحفَظ التسجيلات ولا تُرسَل. تُحذَف عند تغيير الآية.
      </p>
      <p className="field-note">
        النص القرآني:{' '}
        <a href="https://tanzil.net" target="_blank" rel="noreferrer">
          مشروع تنزيل
        </a>
      </p>
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
