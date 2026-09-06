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
            title: 'ابدأ الحفظ',
            description:
              'Start memorization at a Quran surah and ayah, saving the position on this device.',
            inputSchema: {
              type: 'object',
              properties: {
                surah: { type: 'integer', minimum: 1, maximum: 114 },
                ayah: { type: 'integer', minimum: 1 },
              },
              required: ['surah', 'ayah'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              if (!input || typeof input !== 'object')
                throw new Error('موضع غير صالح');
              const { surah, ayah } = input as { surah: number; ayah: number };
              if (
                !Number.isInteger(surah) ||
                !Number.isInteger(ayah) ||
                surah < 1 ||
                surah > 114 ||
                ayah < 1 ||
                ayah > surahs[surah - 1].count
              )
                throw new Error('موضع غير صالح');
              flushSync(() =>
                setPrefs((p) => ({ ...p, surah, ayah, started: true })),
              );
              return { surah, ayah, started: true };
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
