import { useEffect, useRef } from 'react';
import type { SchedulePlan } from '../memorize/schedule';
import { Stepper } from './Stepper';

/* The three counts a learner reaches for, on the start screen rather than in
   the settings sheet: how long a drill feels is mostly these three numbers,
   and somebody who finds a session longer or shorter than suits them wants
   them beside the estimate they move. They open from the row that carries
   that estimate, which is also why they are not always on the screen: this
   form has to fit a phone whole, and every row it grows by is a row «ابدأ»
   moves down.

   `linkBack` is not here. It shapes the method rather than the length of a
   sitting, and its default of two is the method as taught. It stays in the
   settings sheet. */

export function Repetitions({
  id,
  plan,
  open,
  onChange,
}: {
  id: string;
  plan: SchedulePlan;
  open: boolean;
  onChange: (patch: Partial<SchedulePlan>) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /* Opening adds three rows below the tap that opened them, and on a short
     screen that is under the fold. */
  useEffect(() => {
    if (open) box.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);
  return (
    <div className="reps" id={id} ref={box} hidden={!open}>
      {/* The labels are the names the session shows on each of its steps, so
          what is set here is recognisable when it arrives. */}
      <Stepper
        label="تلقين"
        hint="المقطع منفردًا"
        name="مرات التلقين"
        value={plan.singleReps}
        min={0}
        max={10}
        zeroLabel="بلا"
        onChange={(singleReps) => onChange({ singleReps })}
      />
      <Stepper
        label="وصل"
        hint="المقطع مع ما قبله"
        name="مرات الوصل"
        value={plan.linkReps}
        min={0}
        max={10}
        zeroLabel="بلا"
        onChange={(linkReps) => onChange({ linkReps })}
      />
      <Stepper
        label="سرد"
        hint="المدى كاملًا في آخر الجلسة"
        name="مرات السرد"
        value={plan.reciteReps}
        min={0}
        max={10}
        zeroLabel="بلا"
        onChange={(reciteReps) => onChange({ reciteReps })}
      />
    </div>
  );
}
