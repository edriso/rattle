import { reciters } from '../data/audio';
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
import { surahs, arabic, normalize, type Preferences } from '../data/quran';
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
      <p className="phase-note">الفاتحة متاحة للمعاينة. بقية السور قريبًا.</p>
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
      title="الإعدادات"
      description="تخصيص المظهر والحفظ."
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
        <p className="field-note">التلاوات قريبًا</p>
      </section>
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
            <dt>التالي</dt>
            <dd>
              <kbd>←</kbd> أو <kbd>إدخال</kbd>
            </dd>
          </div>
          <div>
            <dt>السابق</dt>
            <dd>
              <kbd>→</kbd>
            </dd>
          </div>
          <div>
            <dt>تشغيل التلاوة وإيقافها</dt>
            <dd>
              <kbd>مسافة</kbd>
            </dd>
          </div>
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
        </dl>
        <p>
          رفع هو مفتاح Shift. عند تحديد زر، يعمل مفتاحا الإدخال والمسافة على
          تفعيله.
        </p>
      </details>
    </Panel>
  );
}
