import type { SchedulePlan } from '../memorize/schedule';
import { Stepper } from './Stepper';

/* The three counts a learner reaches for, on the start screen beside the rest
   of the session's options rather than in the settings sheet, and on the
   screen rather than behind a disclosure. How long a sitting feels is mostly
   these three numbers, so somebody who finds it longer or shorter than suits
   them should be able to see what they are set to and change them where they
   already are. That was the request from the reading group, in those words:
   «وأرى أن وجوده في الشاشة الرئيسية بجانب بقية خيارات الجلسة سيكون أسهل».

   Three columns rather than three rows, because the form has to fit a phone
   whole and three labelled rows cost a quarter of it. What the columns give
   up is the hint under each label; the hint moves into the accessible name
   instead of off the page, which is what `compact` does in `Stepper`.

   `linkBack` is not here. It shapes the method rather than the length of a
   sitting, and its default of two is the method as taught. It stays in the
   settings sheet. */

export function Repetitions({
  plan,
  onChange,
}: {
  plan: SchedulePlan;
  onChange: (patch: Partial<SchedulePlan>) => void;
}) {
  return (
    <fieldset className="reps">
      {/* Named on the screen and not only in the accessible tree: these
          numbers are what a reader took the «طول المدى» chips for, and
          «مرات» is the word that tells the two rows apart. */}
      <legend className="setting-label">مرات التكرار</legend>
      <div className="reps-row">
        {/* The labels are the names the session shows on each of its steps,
            so what is set here is recognisable when it arrives. */}
        <Stepper
          compact
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
          compact
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
          compact
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
    </fieldset>
  );
}
