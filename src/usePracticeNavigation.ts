import { useEffect, useRef, type TouchEvent } from 'react';

type Actions = {
  enabled: boolean;
  next: () => void;
  previous: () => void;
  toggleAudio: () => void;
};
const editingSelector =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="radio"], [role="tab"], [role="listbox"], [role="menu"]';

export function usePracticeNavigation({
  enabled,
  next,
  previous,
  toggleAudio,
}: Actions) {
  const gesture = useRef<{
    x: number;
    y: number;
    id: number;
    time: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target =
        event.target instanceof Element ? event.target : document.activeElement;
      if (
        target?.closest(editingSelector) ||
        target?.closest('[role="dialog"]')
      )
        return;
      // Space and Enter must still activate whichever native control has focus.
      if (
        (event.key === ' ' || event.key === 'Enter') &&
        target?.closest('button, a, [role="button"], summary')
      )
        return;
      const action =
        event.key === 'ArrowLeft' || event.key === 'Enter'
          ? next
          : event.key === 'ArrowRight'
            ? previous
            : event.key === ' '
              ? toggleAudio
              : null;
      if (!action) return;
      event.preventDefault();
      action();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, next, previous, toggleAudio]);

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
