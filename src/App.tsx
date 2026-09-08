/* Storage is written from an effect, so a failing store surfaces as a notice
   rather than throwing out of a state updater. */
/* eslint-disable react/react-compiler */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Settings, ChevronDown, ArrowRight } from 'lucide-react';
import {
  defaults,
  grainFor,
  restore,
  surahs,
  arabic,
  type Preferences,
} from './data/quran';
import { useWebMCP } from './webmcp';
import { useAppearance } from './useAppearance';
import { useReviewPlan } from './memorize/useReviewPlan';
import { DirectionProvider } from '@/components/ui/direction';
import { HomeView } from './components/HomeView';
import { AyahView } from './components/AyahView';

const SessionView = lazy(() =>
  import('./components/SessionView').then((m) => ({ default: m.SessionView })),
);
const Picker = lazy(() =>
  import('./components/Sheets').then((m) => ({ default: m.Picker })),
);
const SettingsSheet = lazy(() =>
  import('./components/Sheets').then((m) => ({ default: m.SettingsSheet })),
);

const STORAGE = 'rattle:v1';

function stored(): Preferences {
  try {
    return restore(JSON.parse(localStorage.getItem(STORAGE) ?? 'null'));
  } catch {
    return defaults;
  }
}

export function App() {
  const [prefs, setPrefs] = useState<Preferences>(stored);
  /* «reciter» is the settings sheet opened from the start screen's reciter
     button rather than from the gear: same panel, but the cursor lands on the
     reciter instead of on the panel's name, so a reader who asked for one
     thing is put in front of that thing. */
  const [panel, setPanel] = useState<'picker' | 'settings' | 'reciter' | null>(
    null,
  );
  const [storageError, setStorageError] = useState(false);
  const review = useReviewPlan();

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(prefs));
    } catch {
      setStorageError(true);
    }
  }, [prefs]);
  useAppearance(prefs.appearance);
  useWebMCP(setPrefs);

  /* Free review moves `ayah` on its own. The passage keeps its length and
     follows, so returning to the start screen never leaves an empty range. */
  const update = (v: Partial<Preferences>) =>
    setPrefs((p) => {
      const next = { ...p, ...v };
      const count = surahs[next.surah - 1].count;
      if (v.to === undefined && v.ayah !== undefined && v.ayah !== p.ayah)
        next.to = p.to + (v.ayah - p.ayah);
      next.ayah = Math.max(1, Math.min(count, next.ayah));
      next.to = Math.max(next.ayah, Math.min(count, next.to));
      /* Here rather than at the control that changed: whichever of the reciter
         and the grain moved, the pair has to stay one the app can drill. */
      next.grain = grainFor(next.grain, next.reciter);
      return next;
    });
  const surah = surahs[prefs.surah - 1];
  const home = prefs.screen === 'home';

  return (
    <DirectionProvider direction="rtl">
      <div className="app-shell" dir="rtl">
        <a className="skip-link" href="#main">
          انتقل إلى المحتوى
        </a>
        <header className="topbar">
          {home ? (
            <a
              href={import.meta.env.BASE_URL}
              className="brand"
              aria-label="رَتِّل، الصفحة الرئيسية"
            >
              رَتِّل
            </a>
          ) : (
            <button
              className="icon-button"
              aria-label="رجوع إلى اختيار المقطع"
              onClick={() => update({ screen: 'home' })}
            >
              <ArrowRight size={21} />
            </button>
          )}
          {home ? null : (
            <button
              className="position-button"
              onClick={() => setPanel('picker')}
            >
              <span>
                سورة {surah.name}
                <span className="muted">
                  {' '}
                  ·{' '}
                  {prefs.screen === 'session'
                    ? `${arabic(prefs.ayah)}–${arabic(prefs.to)}`
                    : `آية ${arabic(prefs.ayah)}`}
                </span>
              </span>
              <ChevronDown size={15} />
            </button>
          )}
          <button
            className="icon-button gear"
            aria-label="الإعدادات"
            onClick={() => setPanel('settings')}
          >
            <Settings size={21} />
          </button>
        </header>

        <main id="main" className={home ? 'start-main' : 'memorizing-main'}>
          {home ? (
            <HomeView
              prefs={prefs}
              update={update}
              items={review.items}
              onOpenPicker={() => setPanel('picker')}
              onOpenReciter={() => setPanel('reciter')}
              onStart={(screen) => update({ screen })}
            />
          ) : prefs.screen === 'session' ? (
            <Suspense
              fallback={
                <div className="placeholder" aria-live="polite">
                  <p>جارٍ تحضير الجلسة…</p>
                </div>
              }
            >
              <SessionView
                key={`${prefs.surah}:${prefs.ayah}-${prefs.to}:${String(prefs.grain)}`}
                prefs={prefs}
                navigationEnabled={panel === null}
                onExit={() => update({ screen: 'home' })}
                onGraded={(grade) => {
                  review.complete(
                    { surah: prefs.surah, from: prefs.ayah, to: prefs.to },
                    grade,
                  );
                  update({ screen: 'home' });
                }}
              />
            </Suspense>
          ) : (
            /* No key: remounting on every move reset the loop toggle and
               revealed a hidden ayah. The recorder clears itself from its
               `position` prop, and the audio hook follows its own sources. */
            <AyahView
              prefs={prefs}
              update={update}
              navigationEnabled={panel === null}
            />
          )}
        </main>

        {(storageError || review.failed) && (
          <output className="storage-notice">
            تعذّر حفظ التقدّم في هذا المتصفح.
          </output>
        )}

        <Suspense fallback={null}>
          {panel === 'picker' && (
            <Picker
              open
              onClose={() => setPanel(null)}
              prefs={prefs}
              onSelect={(surahId, ayah, to) => {
                update({ surah: surahId, ayah, to });
                setPanel(null);
              }}
            />
          )}
          {(panel === 'settings' || panel === 'reciter') && (
            <SettingsSheet
              open
              onClose={() => setPanel(null)}
              prefs={prefs}
              update={update}
              landOn={panel === 'reciter' ? 'reciter' : 'title'}
            />
          )}
        </Suspense>
      </div>
    </DirectionProvider>
  );
}
