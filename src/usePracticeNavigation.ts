import { useEffect, useEffectEvent, useRef, type TouchEvent } from 'react';

type Actions = {
  enabled: boolean;
  next: () => void;
  previous: () => void;
  toggleAudio: () => void;
  /** Replay: this step again in a session, the loop toggle in free review. */
  repeat?: () => void;
  toggleRecording?: () => void;
  toggleRecordingPlayback?: () => void;
};
/** Whether the keys belong to a box the reader is inside and can still scroll. */
const scrolls = (node: Element | null | undefined) => {
  for (let el = node; el; el = el.parentElement)
    if (
      el.scrollHeight - el.clientHeight > 1 &&
      /auto|scroll/.test(getComputedStyle(el).overflowY)
    )
      return true;
  return false;
};
const editingSelector =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="radio"], [role="tab"], [role="listbox"], [role="menu"]';

export function usePracticeNavigation({
  enabled,
  next,
  previous,
  toggleAudio,
  repeat,
  toggleRecording,
  toggleRecordingPlayback,
}: Actions) {
  const gesture = useRef<{
    x: number;
    y: number;
    id: number;
    time: number;
  } | null>(null);
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const target =
      event.target instanceof Element ? event.target : document.activeElement;
    if (target?.closest(editingSelector) || target?.closest('[role="dialog"]'))
      return;
    if (event.shiftKey) {
      const action =
        event.key === 'Enter'
          ? toggleRecording
          : event.key === ' '
            ? toggleRecordingPlayback
            : undefined;
      if (action) {
        event.preventDefault();
        action();
      }
      return;
    }
    /* Space and Enter must still activate whichever native control has focus,
       which leaves a learner who tabbed or tapped onto a button with no way to
       drive the drill. So every one of them has an arrow twin, and no control
       claims an arrow: ← and Enter move on, ↑ and Space play, ↓ repeats.
       Letters would have been the other option, but a shortcut made of plain
       characters has to be switchable off to meet WCAG 2.1.4, and arrows are
       exempt from it. */
    if (
      (event.key === ' ' || event.key === 'Enter') &&
      target?.closest('button, a, [role="button"], summary')
    )
      return;
    /* Inside a frame holding more text than it shows, the arrows go back to
       reading it. Page Up, Page Down, Home and End are never claimed, so a
       keyboard can move the page whatever has focus. */
    if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      scrolls(target)
    )
      return;
    const action =
      event.key === 'ArrowLeft' || event.key === 'Enter'
        ? next
        : event.key === 'ArrowRight'
          ? previous
          : event.key === ' ' || event.key === 'ArrowUp'
            ? toggleAudio
            : event.key === 'ArrowDown'
              ? repeat
              : null;
    if (!action) return;
    event.preventDefault();
    action();
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [enabled]);

  const cancel = () => {
    gesture.current = null;
  };
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      cancel();
      if (
        !enabled ||
        event.touches.length !== 1 ||
        window.getSelection()?.toString()
      )
        return;
      const touch = event.touches[0];
      // Leave the system/browser edge gestures alone.
      if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
      gesture.current = {
        x: touch.clientX,
        y: touch.clientY,
        id: touch.identifier,
        time: event.timeStamp,
      };
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start) return;
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      // Once scrolling starts, this gesture can never turn into navigation.
      if (touch.identifier !== start.id || (dy > 12 && dy > dx)) cancel();
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      cancel();
      if (
        !start ||
        !enabled ||
        event.touches.length ||
        window.getSelection()?.toString()
      )
        return;
      const touch = Array.from(event.changedTouches).find(
        (t) => t.identifier === start.id,
      );
      if (!touch || event.timeStamp - start.time > 900) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      // RTL: drag the current verse right to expose the next verse on its left.
      if (dx > 0) next();
      else previous();
    },
    onTouchCancel: cancel,
  };
}
