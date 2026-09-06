/* Resource refs must be read at cleanup time to release the active recorder and URL.
   State resets synchronize the controls with the changed external media session. */
/* eslint-disable react/react-compiler, react-hooks/exhaustive-deps */
/* A canvas exposes its live visual as an image; private recordings have no transcript. */
/* eslint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/media-has-caption */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';
import { arabic } from '../data/quran';
export function Recorder({ position }: { position: string }) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording'>(
    'idle',
  );
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
  const audio = useRef<HTMLAudioElement>(null);
  const activeUrl = useRef<string | null>(null);
  function release() {
    cancelAnimationFrame(animation.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
  }
  function clear() {
    audio.current?.pause();
    setPlaying(false);
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = null;
    setUrl(null);
  }
  useEffect(() => {
    generation.current++;
    const r = media.current;
    if (r && r.state !== 'inactive') {
      r.onstop = null;
      r.stop();
    }
    release();
    clear();
    setState('idle');
    setSeconds(0);
    setError('');
    return () => {
      generation.current++;
      const r = media.current;
      if (r && r.state !== 'inactive') {
        r.onstop = null;
        r.stop();
      }
      release();
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    };
  }, [position]);
  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);
  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        'التسجيل غير متاح في هذا المتصفح. جرّب متصفحًا حديثًا مع اتصال آمن.',
      );
      return;
    }
    setState('requesting');
    const session = ++generation.current;
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== generation.current) {
        input.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = input;
      clear();
      setSeconds(0);
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(input);
      media.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (session !== generation.current) return;
        generation.current++; // Cancel a pending AudioContext resume callback.
        release();
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size) {
          const next = URL.createObjectURL(blob);
          activeUrl.current = next;
          setUrl(next);
        }
        setState('idle');
      };
      recorder.onerror = () => {
        setError('تعذّر إكمال التسجيل. حاول مرة أخرى.');
        release();
        setState('idle');
      };
      recorder.start();
      setState('recording');
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
          if (el) {
            const ctx = el.getContext('2d');
            if (ctx) {
              analyser.getByteFrequencyData(data);
              ctx.clearRect(0, 0, el.width, el.height);
              ctx.fillStyle = getComputedStyle(el).color;
              for (let i = 0; i < 38; i++) {
                const h = Math.max(3, (data[i * 2] / 255) * 36);
                ctx.fillRect(i * 6, (40 - h) / 2, 3, h);
              }
            }
          }
          animation.current = requestAnimationFrame(draw);
        };
        draw();
      } catch {
        /* Recording can continue without visualization. */
      }
    } catch (e) {
      if (session !== generation.current) return;
      release();
      setState('idle');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'لم يُسمح باستخدام الميكروفون. يمكنك تفعيله من إعدادات المتصفح.'
          : 'تعذّر الوصول إلى الميكروفون. تأكد من توصيله وحاول مجددًا.',
      );
    }
  }
  async function playback() {
    if (!audio.current) return;
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      try {
        await audio.current.play();
        setPlaying(true);
      } catch {
        setError('تعذّر تشغيل التسجيل. حاول مجددًا.');
      }
    }
  }
  return (
    <div className="record-section">
      <div className="record-row">
        <button
          className={`record-button ${state === 'recording' ? 'recording' : ''}`}
          disabled={state === 'requesting'}
          onClick={() =>
            state === 'recording' ? media.current?.stop() : void start()
          }
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
                : url
                  ? 'أعد التسجيل'
                  : 'سمّع بصوتك'}
          </span>
        </button>
        <div className="waveform">
          <canvas
            width={228}
            height={40}
            ref={canvas}
            aria-label={
              state === 'recording'
                ? 'الموجة الصوتية المباشرة'
                : 'الموجة الصوتية'
            }
            role="img"
          />
          {state !== 'recording' && (
            <div className="wave-idle" aria-hidden="true">
              {Array.from({ length: 30 }, (_, i) => (
                <i
                  key={i}
                  style={{ height: `${4 + Math.sin(i * 1.7) ** 2 * 14}px` }}
                />
              ))}
            </div>
          )}
        </div>
        {state === 'recording' && (
          <span className="record-time" role="timer">
            {arabic(Math.floor(seconds / 60))}:
            {arabic(seconds % 60).padStart(2, '٠')}
          </span>
        )}
      </div>
      {url && (
        <div className="recording-result">
          <audio
            ref={audio}
            src={url}
            onEnded={() => setPlaying(false)}
            onError={() => {
              setPlaying(false);
              setError('تعذّر تشغيل التسجيل.');
            }}
          />
          <button className="text-button" onClick={() => void playback()}>
            {playing ? <Pause size={17} /> : <Play size={17} />}{' '}
            {playing ? 'إيقاف مؤقت' : 'استمع إلى تسجيلك'}
          </button>
          <button
            className="icon-button"
            aria-label="حذف التسجيل"
            onClick={clear}
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}
      <p className="record-note">
        تسجيلك خاص بك، ويُحذف عند تغيير الموضع أو إغلاق الصفحة
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
