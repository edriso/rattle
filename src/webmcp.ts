import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { surahs, type Preferences } from './data/quran';
type Registry = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function useWebMCP(setPrefs: Dispatch<SetStateAction<Preferences>>) {
  useEffect(() => {
    const registry = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        registry.registerTool(
          {
            name: 'start_memorization',
            title: 'ابدأ جلسة التلقين',
            description:
              'Start a cumulative memorization session over a passage of the Quran, saving the position on this device. Omit `to` to drill five ayat.',
            inputSchema: {
              type: 'object',
              properties: {
                surah: { type: 'integer', minimum: 1, maximum: 114 },
                ayah: { type: 'integer', minimum: 1 },
                to: { type: 'integer', minimum: 1 },
              },
              required: ['surah', 'ayah'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              if (!input || typeof input !== 'object')
                throw new Error('موضع غير صالح');
              const { surah, ayah, to } = input as {
                surah: number;
                ayah: number;
                to?: number;
              };
              if (
                !Number.isInteger(surah) ||
                !Number.isInteger(ayah) ||
                surah < 1 ||
                surah > 114 ||
                ayah < 1 ||
                ayah > surahs[surah - 1].count
              )
                throw new Error('موضع غير صالح');
              const count = surahs[surah - 1].count;
              const last = Number.isInteger(to)
                ? Math.min(count, Math.max(ayah, to!))
                : Math.min(count, ayah + 4);
              flushSync(() =>
                setPrefs((p) => ({
                  ...p,
                  surah,
                  ayah,
                  to: last,
                  screen: 'session',
                })),
              );
              return { surah, ayah, to: last };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, [setPrefs]);
}
