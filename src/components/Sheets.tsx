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
        <p className="field-note">صور المصحف قريبًا</p>
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
      <details className="shortcut-help">
        <summary>التنقّل والاختصارات</summary>
        <dl>
          <div>
            <dt>الآيات التالية</dt>
            <dd>
              <kbd>←</kbd> أو <kbd>إدخال</kbd>
            </dd>
          </div>
          <div>
            <dt>الآيات السابقة</dt>
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
        </dl>
        <p>اسحب الآية يمينًا للتالي، ويسارًا للسابق.</p>
        <p>عند تحديد زر، يعمل مفتاحا الإدخال والمسافة على تفعيله.</p>
      </details>
      <p className="field-note">
        تُحفظ الإعدادات تلقائيًا. التسجيلات على جهازك فقط، وتُحذف عند تغيير الموضع أو
        إغلاق الصفحة.
      </p>
    </Panel>
  );
}
