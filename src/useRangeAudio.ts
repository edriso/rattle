/* State mirrors native media events and source changes. */
/* Cleanup invalidates the live request counter, rather than a captured request. */
/* eslint-disable react/react-compiler, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioMirrors } from './data/audio';

/** Every address a recording can be reached at, its own first. */
const addresses = (url: string) => [url, ...audioMirrors(url)];

const FAILED = 'تعذّر تشغيل التلاوة. أعد المحاولة.';

/**
 * Plays a run of ayah recordings one after another through a single media
 * element, looping the whole run when `repeat` is set. One element rather than
 * one per ayah keeps a mobile browser's single-stream autoplay grant intact.
 *
 * With `keepPlaying`, a run that is sounding when the range changes carries on
 * into the new one. That is not autoplay: it only ever continues sound the
 * learner already asked for, so moving through a passage does not mean
 * pressing play at every ayah.
 */
export function useRangeAudio(
  urls: readonly string[],
  repeat: boolean,
  keepPlaying = false,
) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const list = useRef<readonly string[]>(urls);
  const at = useRef(0);
  /** Which address the run is reaching recitation at: index 0 is each
      recording's own, and a later one a mirror moved to because the host
      before it could not be reached. It belongs to the run rather than to one
      ayah, so a host that is down is not rediscovered at every boundary. */
  const host = useRef(0);
  /** Whether the run is meant to be sounding. A rewind between runs is not,
      and neither is a run the learner has just paused. */
  const wanted = useRef(false);
  /** Whether the element was actually sounding when the range last changed.
      Read from the element rather than from `wanted`, because a pause from
      the lock screen or a headset button never passes through this hook: it
      leaves `wanted` set, and a move would then start sound the learner had
      just stopped. */
  const sounding = useRef(false);
  const request = useRef(0);
  const pending = useRef(false);
  const looping = useRef(repeat);
  const carries = useRef(keepPlaying);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');
  const key = urls.join('|');

  looping.current = repeat;
  carries.current = keepPlaying;

  /** Start the element sounding, and own the outcome: only the latest attempt
      is allowed to publish it, so a range change mid-attempt stays quiet. */
  const begin = useCallback(async (player: HTMLAudioElement) => {
    const id = ++request.current;
    pending.current = true;
    wanted.current = true;
    setNotice('');
    try {
      await player.play();
      if (id === request.current) setPlaying(!player.paused);
    } catch {
      if (id === request.current) {
        wanted.current = false;
        setPlaying(false);
        setNotice(FAILED);
      }
    } finally {
      if (id === request.current) pending.current = false;
    }
  }, []);

  useEffect(() => {
    /* Whether the recitation the learner asked for is to carry into this
       range. The address that was answering carries with it: a run that is
       still sounding has no reason to go back to a host it already found
       unreachable, while a run that is starting fresh does. */
    const carry = sounding.current && carries.current;
    setPlaying(false);
    setNotice('');
    list.current = urls;
    at.current = 0;
    if (!carry) host.current = 0;
    wanted.current = false;
    if (!urls.length) return;
    const player = new Audio();
    player.preload = 'none';
    audio.current = player;
    player.onplaying = () => setPlaying(true);
    player.onpause = () => setPlaying(false);
    /** Move the element to one ayah of the run, at the address the run has
        found to answer. */
    const goTo = (index: number) => {
      at.current = index;
      const chain = addresses(list.current[index] ?? '');
      player.src = chain[host.current] ?? chain[0];
    };
    goTo(0);
    player.onended = () => {
      const next = at.current + 1;
      if (next < list.current.length) {
        goTo(next);
        void player.play().catch(() => setPlaying(false));
        return;
      }
      // Rewind, so pressing play again starts the run over rather than
      // resuming from the ayah it happened to end on.
      goTo(0);
      if (looping.current) {
        void player.play().catch(() => setPlaying(false));
        return;
      }
      wanted.current = false;
      setPlaying(false);
    };
    player.onerror = () => {
      const chain = addresses(list.current[at.current] ?? '');
      if (host.current + 1 < chain.length) {
        // Whoever is awaiting the address that just failed no longer speaks
        // for this element; the mirror it moves to does.
        request.current++;
        pending.current = false;
        host.current++;
        player.src = chain[host.current];
        // Chase the mirror only while the run is meant to be sounding. A
        // rewind between runs, or an error that lands after the learner has
        // pressed pause, must move the address and stay quiet.
        if (wanted.current) void player.play().catch(() => setPlaying(false));
        return;
      }
      // Nowhere left to reach. The next attempt starts from the recording's
      // own address, which is the one likelier to have come back.
      host.current = 0;
      // And it is only worth saying if the learner is still waiting to hear
      // something. An error can land after they have pressed pause.
      if (wanted.current)
        setNotice('تعذّر تشغيل التلاوة. تحقّق من الاتصال ثم أعد المحاولة.');
      wanted.current = false;
      setPlaying(false);
    };
    if (carry) void begin(player);
    return () => {
      request.current++;
      pending.current = false;
      // Read before the pause below, which is this hook's own and says
      // nothing about whether the learner was listening.
      sounding.current = !player.paused;
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
    wanted.current = false;
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
    await begin(player);
  }, [pause, begin]);

  return { playing, notice, toggle, pause };
}
