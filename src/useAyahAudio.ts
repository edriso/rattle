/* State mirrors native media events and source changes. */
/* Cleanup invalidates the live request counter, rather than a captured request. */
/* eslint-disable react/react-compiler, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAyahAudio(url: string | null, repeat: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const request = useRef(0);
  const pending = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setPlaying(false);
    setNotice('');
    if (!url) return;
    const player = new Audio(url);
    player.preload = 'none';
    audio.current = player;
    player.onplaying = () => setPlaying(true);
    player.onpause = () => setPlaying(false);
    player.onended = () => setPlaying(false);
    player.onerror = () => {
      setPlaying(false);
      setNotice('تعذّر تشغيل التلاوة. حاول مجددًا.');
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
  }, [url]);
  useEffect(() => {
    if (audio.current) audio.current.loop = repeat;
  }, [repeat, url]);
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
        setNotice('تعذّر تشغيل التلاوة. حاول مجددًا.');
      }
    } finally {
      if (id === request.current) pending.current = false;
    }
  }, [pause]);
  return { playing, notice, toggle, pause };
}
