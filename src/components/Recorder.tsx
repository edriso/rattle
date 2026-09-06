/* State mirrors microphone, playback, and page lifecycle changes. Cleanup must
   invalidate the current asynchronous request and release the current URL. */
/* eslint-disable react/react-compiler, react-hooks/exhaustive-deps */
/* Canvas describes the live waveform. Private user audio has no transcript. */
/* eslint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/media-has-caption */
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';
import { arabic } from '../data/quran';

export type RecorderControls = {
  toggleRecording: () => void;
  togglePlayback: () => void;
  pausePlayback: () => void;
  isCapturing: () => boolean;
};
type Phase = 'idle' | 'requesting' | 'recording' | 'stopping';

export function Recorder({
  position,
  onBeforeAudio,
  onCaptureChange,
  ref,
}: {
  position: string;
  onBeforeAudio?: () => void;
  onCaptureChange?: (busy: boolean) => void;
  ref?: Ref<RecorderControls>;
}) {
  const [state, setState] = useState<Phase>('idle');
  const phase = useRef<Phase>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const media = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const animation = useRef(0);
  const generation = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const activeUrl = useRef<string | null>(null);
  const playbackRequest = useRef(0);
  const playbackPending = useRef(false);
  const chunks = useRef<BlobPart[]>([]);
  function transition(next: Phase) {
    phase.current = next;
    setState(next);
  }
  function releaseMicrophone() {
    cancelAnimationFrame(animation.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
  }
  function detachRecorder() {
    const recorder = media.current;
    if (recorder) {
      recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    media.current = null;
    chunks.current = [];
  }
  function pausePlayback() {
    playbackRequest.current++;
    playbackPending.current = false;
    audio.current?.pause();
    setPlaying(false);
  }
  function clear() {
    pausePlayback();
    if (audio.current) {
      audio.current.removeAttribute('src');
      audio.current.load();
    }
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = null;
    setUrl(null);
  }
  function dispose() {
    generation.current++;
    playbackRequest.current++;
    playbackPending.current = false;
    detachRecorder();
    releaseMicrophone();
    audio.current?.pause();
    if (audio.current) {
      audio.current.removeAttribute('src');
      audio.current.load();
    }
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = null;
    phase.current = 'idle';
  }
  useEffect(() => {
    const reset = () => {
      dispose();
      setUrl(null);
      setPlaying(false);
      setSeconds(0);
      setError('');
      setState('idle');
    };
    reset();
    window.addEventListener('pagehide', reset);
    return () => {
      window.removeEventListener('pagehide', reset);
      dispose();
    };
  }, [position]);
  useEffect(() => {
    onCaptureChange?.(state !== 'idle');
  }, [state, onCaptureChange]);
  useEffect(() => {
    if (state !== 'recording') return;
    const interval = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [state]);
  async function start() {
    if (phase.current !== 'idle') return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('التسجيل غير متاح في هذا المتصفح.');
      return;
    }
    onBeforeAudio?.();
    pausePlayback();
    transition('requesting');
    const session = ++generation.current;
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== generation.current) {
        input.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = input;
      // Keep the previous recording if microphone permission fails.
      clear();
      detachRecorder();
      setSeconds(0);
      const recorder = new MediaRecorder(input);
      media.current = recorder;
      recorder.ondataavailable = (event) => {
        if (session === generation.current && event.data.size)
          chunks.current.push(event.data);
      };
      recorder.onstop = () => {
        if (session !== generation.current) return;
        generation.current++;
        const blob = new Blob(chunks.current, { type: recorder.mimeType });
        detachRecorder();
        releaseMicrophone();
        if (blob.size) {
          const next = URL.createObjectURL(blob);
          activeUrl.current = next;
          setUrl(next);
        } else setError('لم يُلتقط صوت. أعد التسجيل.');
        transition('idle');
      };
      recorder.onerror = () => {
        if (session !== generation.current) return;
        generation.current++;
        detachRecorder();
        releaseMicrophone();
        transition('idle');
        setError('تعذّر إكمال التسجيل. أعد المحاولة.');
      };
      recorder.start();
      transition('recording');
      try {
        const ac = new AudioContext();
        context.current = ac;
        await ac.resume();
        if (session !== generation.current) return;
        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        ac.createMediaStreamSource(input).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          const el = canvas.current;
          const ctx = el?.getContext('2d');
          if (el && ctx) {
            analyser.getByteFrequencyData(data);
            ctx.clearRect(0, 0, el.width, el.height);
            ctx.fillStyle = getComputedStyle(el).color;
            for (let i = 0; i < 38; i++) {
              const height = Math.max(3, (data[i * 2] / 255) * 36);
              ctx.fillRect(i * 6, (40 - height) / 2, 3, height);
            }
          }
          animation.current = requestAnimationFrame(draw);
        };
        draw();
      } catch {
        /* Recording remains available without a waveform. */
      }
    } catch (cause) {
      if (session !== generation.current) return;
      generation.current++;
      detachRecorder();
      releaseMicrophone();
      transition('idle');
      setError(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'اسمح باستخدام الميكروفون من إعدادات المتصفح.'
          : 'تعذّر الوصول إلى الميكروفون. أعد المحاولة.',
      );
    }
  }
  function toggleRecording() {
    if (phase.current === 'recording') {
      const recorder = media.current;
      if (recorder?.state === 'recording') {
        transition('stopping');
        recorder.stop();
      }
    } else if (phase.current === 'idle') {
      void start();
    }
  }
  async function playback() {
    const player = audio.current;
    if (!player || !activeUrl.current || phase.current !== 'idle') return;
    if (!player.paused || playbackPending.current) {
      pausePlayback();
      return;
    }
    const id = ++playbackRequest.current;
    playbackPending.current = true;
    setError('');
    onBeforeAudio?.();
    try {
      await player.play();
      if (id === playbackRequest.current) setPlaying(!player.paused);
    } catch {
      if (id === playbackRequest.current)
        setError('تعذّر تشغيل التسجيل. أعد المحاولة.');
    } finally {
      if (id === playbackRequest.current) playbackPending.current = false;
    }
  }
  useImperativeHandle(ref, () => ({
    toggleRecording,
    togglePlayback: () => {
      void playback();
    },
    pausePlayback,
    isCapturing: () => phase.current !== 'idle',
  }));
  return (
    <div className="record-section">
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setPlaying(false);
            setError('تعذّر تشغيل التسجيل.');
          }}
        />
      )}
      <div className="record-row">
        <button
          id="record-toggle"
          className={`record-button ${state === 'recording' ? 'recording' : ''}`}
          disabled={state === 'requesting' || state === 'stopping'}
          onClick={toggleRecording}
          aria-keyshortcuts="Shift+Enter"
        >
          {state === 'recording' ? (
            <Square size={16} fill="currentColor" />
          ) : (
            <Mic size={19} />
          )}
          <span>
            {state === 'recording'
              ? 'إنهاء التسجيل'
              : state === 'requesting'
                ? 'بانتظار الميكروفون…'
                : state === 'stopping'
                  ? 'إنهاء التسجيل…'
                  : url
                    ? 'إعادة التسجيل'
                    : 'تسجيل صوتك'}
          </span>
        </button>
        <div className="waveform" hidden={state !== 'recording'}>
          <canvas
            width={228}
            height={40}
            ref={canvas}
            role="img"
            aria-label="الموجة الصوتية المباشرة"
          />
        </div>
        {state === 'recording' && (
          <span className="record-time" role="timer">
            {arabic(Math.floor(seconds / 60))}:
            {arabic(seconds % 60).padStart(2, '٠')}
          </span>
        )}
        {url && (
          <div className="recording-result">
            <button
              id="record-play"
              className="icon-button"
              disabled={state !== 'idle'}
              onClick={() => {
                void playback();
              }}
              aria-keyshortcuts="Shift+Space"
              aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل التسجيل'}
              title={playing ? 'إيقاف مؤقت' : 'تشغيل التسجيل'}
            >
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button
              className="icon-button"
              disabled={state !== 'idle'}
              aria-label="حذف التسجيل"
              title="حذف التسجيل"
              onClick={() => {
                clear();
                setError('');
                document.getElementById('record-toggle')?.focus();
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
