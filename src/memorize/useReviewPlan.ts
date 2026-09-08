/* The review plan on this device. Nothing leaves the browser. */

import { useCallback, useState } from 'react';
import { readRenamed } from '../data/storage';
import { record, restoreReview, type Grade, type ReviewItem } from './review';

const KEY = 'rattle:review:v1';
/** What the key was called before the app was renamed. See `readRenamed`. */
const WAS_KEY = 'rattil:review:v1';

function read(): ReviewItem[] {
  try {
    return restoreReview(JSON.parse(readRenamed(KEY, WAS_KEY) ?? 'null'));
  } catch {
    return [];
  }
}

export function useReviewPlan() {
  const [items, setItems] = useState<readonly ReviewItem[]>(read);
  const [failed, setFailed] = useState(false);

  /* The write happens here rather than inside the state updater, which React
     is free to call more than once and which must stay free of side effects. */
  const update = useCallback(
    (change: (current: readonly ReviewItem[]) => ReviewItem[]) => {
      const next = change(items);
      setItems(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        setFailed(true);
      }
    },
    [items],
  );

  const complete = useCallback(
    (passage: { surah: number; from: number; to: number }, grade: Grade) =>
      update((current) => record(current, passage, grade)),
    [update],
  );

  return { items, failed, complete };
}
