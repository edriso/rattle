import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { arabic } from '../data/quran';

/**
 * A count between `min` and `max`, adjusted one at a time. Shared by the start
 * screen and the settings sheet, so a repetition count reads the same wherever
 * it is set.
 */
export function Stepper({
  label,
  hint,
  name = label,
  value,
  min,
  max,
  zeroLabel,
  compact = false,
  onChange,
}: {
  label: string;
  hint?: string;
  /** What the label is called when a screen reader hears it inside a
      sentence: «زد مرات التلقين» rather than «زد تلقين». */
  name?: string;
  value: number;
  min: number;
  max: number;
  zeroLabel?: string;
  /**
   * A column rather than a row, for three of these side by side on a phone.
   * The hint stops being drawn and is only spoken, because there is no line
   * under a 110px label to draw it on; it is still on `aria-describedby`, so
   * nothing is lost to a screen reader, only to the eye.
   */
  compact?: boolean;
  onChange: (value: number) => void;
}) {
  const shown = value === 0 && zeroLabel ? zeroLabel : arabic(value);
  /* The hint carries what the label means, so it is spoken with the value
     rather than left on the screen for whoever can see it. */
  const described = useId();
  return (
    <div className={compact ? 'stepper stepper-compact' : 'stepper'}>
      <span className="stepper-label">
        {label}
        {hint && (
          <small id={described} className={compact ? 'sr-only' : undefined}>
            {hint}
          </small>
        )}
      </span>
      <span className="stepper-controls">
        {/* `aria-disabled`, not `disabled`: a button that disables itself the
            moment it is pressed drops the keyboard where it stands. */}
        <button
          className="icon-button"
          aria-label={`أنقِص ${name}`}
          aria-disabled={value <= min}
          onClick={() => value > min && onChange(value - 1)}
        >
          <Minus size={17} />
        </button>
        <output
          aria-label={name}
          aria-describedby={hint ? described : undefined}
        >
          {shown}
        </output>
        <button
          className="icon-button"
          aria-label={`زِد ${name}`}
          aria-disabled={value >= max}
          onClick={() => value < max && onChange(value + 1)}
        >
          <Plus size={17} />
        </button>
      </span>
    </div>
  );
}
