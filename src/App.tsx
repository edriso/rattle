/* Hydration intentionally restores device storage after the initial render. */
/* eslint-disable react/react-compiler */
import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Settings,
  ChevronDown,
  ArrowLeft,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import {
  defaults,
  restore,
  surahs,
  arabic,
  type Preferences,
} from './data/quran';
import { useWebMCP } from './webmcp';
const Picker = lazy(() =>
  import('./components/Sheets').then((m) => ({ default: m.Picker })),
);
const SettingsSheet = lazy(() =>
  import('./components/Sheets').then((m) => ({ default: m.SettingsSheet })),
);
import { AyahView } from './components/AyahView';
export function App() {
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<'picker' | 'settings' | null>(null);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      setPrefs(
        restore(JSON.parse(localStorage.getItem('rattil:v1') || 'null')),
      );
    } catch {
      setStorageError(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = prefs.theme;
    try {
      localStorage.setItem('rattil:v1', JSON.stringify(prefs));
    } catch {
      setStorageError(true);
    }
  }, [prefs, ready]);
  useWebMCP(setPrefs);
  const update = (v: Partial<Preferences>) => setPrefs((p) => ({ ...p, ...v }));
  const surah = surahs[prefs.surah - 1];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="topbar">
        <a
          href={import.meta.env.BASE_URL}
          className="brand"
          aria-label="رِتِّل، الصفحة الرئيسية"
        >
          رِتِّل<span className="brand-dot">.</span>
        </a>
        {prefs.started ? (
          <button
            className="position-button"
            onClick={() => setPanel('picker')}
          >
            <span>
              سورة {surah.name}
              <span className="muted"> · آية {arabic(prefs.ayah)}</span>
            </span>
            <ChevronDown size={15} />
          </button>
        ) : (
          <span className="header-note">رفيق رحلتك مع القرآن</span>
        )}
        <button
          className="icon-button gear"
          aria-label="الإعدادات"
          onClick={() => setPanel('settings')}
        >
          <Settings size={21} />
        </button>
      </header>
      <main
        id="main"
        className={prefs.started ? 'memorizing-main' : 'start-main'}
      >
        {!ready ? (
          <output className="loading">جارٍ استعادة موضعك…</output>
        ) : prefs.started ? (
          <AyahView
            key={`${prefs.surah}:${prefs.ayah}:${prefs.mode}:${prefs.perView}`}
            prefs={prefs}
            update={update}
          />
        ) : (
          <>
            <div className="intro">
              <div className="book-emblem">
                <BookOpen size={31} strokeWidth={1.25} />
              </div>
              <p className="eyebrow">قَلِيلٌ دَائِمٌ، وَأَثَرٌ بَاقٍ</p>
              <h1>
                رحلتك مع القرآن،
                <br />
                <span>آيةً آية.</span>
              </h1>
              <p className="intro-copy">
                مساحة هادئة للحفظ والمراجعة.
                <br />
                استمع بقلبك، وردّد بلسانك، وثبّت حفظك.
              </p>
            </div>
            <section className="start-form" aria-label="اختر موضع الحفظ">
              <div className="field-heading">
                <span>من أين نبدأ؟</span>
                <span className="tiny-label">١١٤ سورة بين يديك</span>
              </div>
              <button
                className="surah-field"
                aria-label={`اختيار السورة، سورة ${surah.name}`}
                onClick={() => setPanel('picker')}
              >
                <BookOpen size={21} />
                <span>
                  <small>السورة</small>
                  <strong>سورة {surah.name}</strong>
                </span>
                <ChevronDown size={18} />
              </button>
              <div className="ayah-field">
                <label htmlFor="start-ayah">
                  ابدأ من الآية <span className="muted">(اختياري)</span>
                </label>
                <input
                  id="start-ayah"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={surah.count}
                  value={prefs.ayah}
                  onChange={(e) =>
                    update({
                      ayah: Math.max(
                        1,
                        Math.min(
                          surah.count,
                          Math.trunc(Number(e.target.value)) || 1,
                        ),
                      ),
                    })
                  }
                />
              </div>
              <button
                className="primary-button"
                onClick={() => update({ started: true })}
              >
                ابدأ الحفظ
                <ArrowLeft size={20} />
              </button>
              <p className="save-hint">
                <span className="status-dot" /> نحفظ موضعك، لتعود وتكمل من حيث
                توقفت
              </p>
            </section>
            <div className="start-ornament" aria-hidden="true">
              <span />✧<span />
            </div>
          </>
        )}
      </main>
      <footer>
        <span>
          <ShieldCheck size={14} /> مساحتك الخاصة، وصوتك يبقى على جهازك
        </span>
        <span className="footer-brand">بِالتَّرْتِيلِ نَحْفَظُ، وَبِالتَّكْرَارِ نُتْقِنُ</span>
      </footer>
      {storageError && (
        <output className="storage-notice">
          تعذّر حفظ التقدّم على هذا المتصفح.
        </output>
      )}
      <Suspense fallback={null}>
        {panel === 'picker' && (
          <Picker
            open={panel === 'picker'}
            onClose={() => setPanel(null)}
            prefs={prefs}
            onSelect={(surah, ayah) => {
              update({ surah, ayah });
              setPanel(null);
            }}
          />
        )}
        {panel === 'settings' && (
          <SettingsSheet
            open={panel === 'settings'}
            onClose={() => setPanel(null)}
            prefs={prefs}
            update={update}
          />
        )}
      </Suspense>
    </div>
  );
}
