/* The review plan on this device. Nothing leaves the browser. */

import { useCallback, useState } from 'react';
import { record, restoreReview, type Grade, type ReviewItem } from './review';

/* Still `rattil`, after the rename, for the reason given in `App.tsx`: this
   is where a reader's review schedule already lives, and it is the one piece
   of saved state that is weeks of their work rather than a preference. */
const KEY = 'rattil:review:v1';

function read(): ReviewItem[] {
  try {
    return restoreReview(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
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
