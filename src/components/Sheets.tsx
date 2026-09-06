import { useState } from 'react';
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
import {
  surahs,
  arabic,
  normalize,
  reciters,
  type Preferences,
} from '../data/quran';
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
        <SheetDescription className="sheet-description">
          {description}
        </SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
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
  onSelect: (surah: number, ayah: number) => void;
}) {
  const [id, setId] = useState(prefs.surah);
  const [ayah, setAyah] = useState(String(prefs.ayah));
  const selected = surahs[id - 1];
  const valid =
    Number.isInteger(Number(ayah)) &&
    Number(ayah) >= 1 &&
    Number(ayah) <= selected.count;
  return (
    <Panel
      open={open}
      onClose={onClose}
      title="اختر موضع الحفظ"
      description="اختر السورة والآية التي تريد أن تبدأ منها."
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
          if (s) {
            setId(s.id);
            setAyah('1');
          }
        }}
      >
        <ComboboxInput
          id="surah-search"
          placeholder="ابحث عن سورة…"
          className="surah-search"
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
      <label className="setting-label" htmlFor="picker-ayah">
        ابدأ من الآية
      </label>
      <input
        className="full-input"
        id="picker-ayah"
        type="number"
        inputMode="numeric"
        min={1}
        max={selected.count}
        value={ayah}
        onChange={(e) => setAyah(e.target.value)}
        aria-invalid={!valid}
      />
      {!valid && (
        <p className="error-text">اختر آية بين ١ و{arabic(selected.count)}.</p>
      )}
      <button
        className="primary-button sheet-action"
        disabled={!valid}
        onClick={() => onSelect(id, Number(ayah))}
      >
        تأكيد الموضع
        <ChevronLeft size={20} />
      </button>
      <p className="phase-note">
        تتوفّر الفاتحة للمعاينة. بقية النصوص والتلاوات ستتوفر قريبًا.
      </p>
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
  return (
    <Panel
      open={open}
      onClose={onClose}
      title="على طريقتك"
      description="تفاصيل صغيرة، لتكون رحلتك أكثر راحة."
    >
      <section className="setting-section">
        <div className="setting-label" id="reciter-label">
          صوت التلاوة
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
            <SelectValue>
              {reciters.find((r) => r.id === prefs.reciter)?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent dir="rtl">
            {reciters.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="field-note">التلاوات الصوتية ستتوفر قريبًا</p>
      </section>
      <fieldset className="setting-section">
        <legend>لون المساحة</legend>
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
      <fieldset className="setting-section">
        <legend>طريقة العرض</legend>
        <div className="segmented">
          {(
            [
              ['text', 'نص قرآني'],
              ['page', 'صفحة المصحف'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} data-active={prefs.mode === mode}>
              <input
                type="radio"
                name="mode"
                className="sr-only"
                checked={prefs.mode === mode}
                onChange={() => update({ mode })}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="field-note">صور المصحف ستتوفر قريبًا</p>
      </fieldset>
      <section className="setting-section">
        <div className="setting-label" id="count-label">
          الآيات في كل مرة
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
                : `${arabic(prefs.perView)} آيات`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent dir="rtl">
            {[1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 1 ? 'آية واحدة' : `${arabic(n)} آيات`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>
      <p className="save-hint">
        <Check size={15} /> تُحفظ إعداداتك تلقائيًا على جهازك
      </p>
    </Panel>
  );
}
