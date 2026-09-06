/* State mirrors native media events and source changes. */
/* Cleanup invalidates the live request counter, rather than a captured request. */
/* eslint-disable react/react-compiler, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Plays a run of ayah recordings one after another through a single media
 * element, looping the whole run when `repeat` is set. One element rather than
 * one per ayah keeps a mobile browser's single-stream autoplay grant intact.
 */
export function useRangeAudio(urls: readonly string[], repeat: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const list = useRef<readonly string[]>(urls);
  const at = useRef(0);
  const request = useRef(0);
  const pending = useRef(false);
  const looping = useRef(repeat);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');
  const key = urls.join('|');

  looping.current = repeat;

  useEffect(() => {
    setPlaying(false);
    setNotice('');
    list.current = urls;
    at.current = 0;
    if (!urls.length) return;
    const player = new Audio(urls[0]);
    player.preload = 'none';
    audio.current = player;
    player.onplaying = () => setPlaying(true);
    player.onpause = () => setPlaying(false);
    player.onended = () => {
      const next = at.current + 1;
      if (next < list.current.length) {
        at.current = next;
        player.src = list.current[next];
        void player.play().catch(() => setPlaying(false));
        return;
      }
      // Rewind, so pressing play again starts the run over rather than
      // resuming from the ayah it happened to end on.
      at.current = 0;
      player.src = list.current[0];
      if (looping.current) {
        void player.play().catch(() => setPlaying(false));
        return;
      }
      setPlaying(false);
    };
    player.onerror = () => {
      setPlaying(false);
      setNotice('تعذّر تشغيل التلاوة. تحقّق من الاتصال ثم أعد المحاولة.');
    };
    return () => {
      request.current++;
      pending.current = false;
      player.onplaying =
        player.onpause =
        player.onended =
        player.onerror =
          null;
      player.pause();
      player.removeAttribute('src');
      player.load();
      audio.current = null;
    };
  }, [key]);

  const pause = useCallback(() => {
    request.current++;
    pending.current = false;
    audio.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(async () => {
    const player = audio.current;
    if (!player) {
      setNotice('التلاوة غير متاحة حاليًا.');
      return;
    }
    if (!player.paused || pending.current) {
      pause();
      return;
    }
    const id = ++request.current;
    pending.current = true;
    setNotice('');
    try {
      await player.play();
      if (id === request.current) setPlaying(!player.paused);
    } catch {
      if (id === request.current) {
        setPlaying(false);
        setNotice('تعذّر تشغيل التلاوة. أعد المحاولة.');
      }
    } finally {
      if (id === request.current) pending.current = false;
    }
  }, [pause]);

  return { playing, notice, toggle, pause };
}
