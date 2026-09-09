import { useRef } from 'react';
import { X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { arabic } from '../data/quran';
import { gradeHint, gradeLabel, grades, type Grade } from '../memorize/review';

/**
 * How the recital went, which sets when the passage comes back. Asked at the
 * end of a session, and also when a session is left early, so a partial drill
 * still counts for something if the learner says it does.
 */
export function GradeSheet({
  surah,
  from,
  to,
  finished,
  onClose,
  onGrade,
  onLeave,
}: {
  surah: string;
  from: number;
  to: number;
  finished: boolean;
  onClose: () => void;
  onGrade: (grade: Grade) => void;
  onLeave: () => void;
}) {
  // The cursor opens on the question, not on the way out of it.
  const heading = useRef<HTMLDivElement>(null);
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="left"
        className="rattle-sheet"
        showCloseButton={false}
        initialFocus={heading}
        dir="rtl"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading" ref={heading} tabIndex={-1}>
          <SheetTitle>{finished ? 'تمّت الجلسة' : 'كيف كان السرد؟'}</SheetTitle>
          <SheetClose className="icon-button" aria-label="إغلاق">
            <X size={21} />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">
          قيّم سردك ليُجدوَل المقطع للمراجعة.
        </SheetDescription>
        <p className="grade-passage">
          سورة {surah} · الآيات {arabic(from)}–{arabic(to)}
        </p>
        <p className="field-note">
          تقييمك يحدّد متى يعود هذا المقطع في خطة المراجعة.
        </p>
        <ul className="grade-list">
          {grades.map((grade) => (
            <li key={grade}>
              <button
                className={`grade-button grade-${grade}`}
                onClick={() => onGrade(grade)}
              >
                <strong>{gradeLabel[grade]}</strong>
                <small>{gradeHint[grade]}</small>
              </button>
            </li>
          ))}
        </ul>
        <button className="text-button" onClick={onLeave}>
          اخرج دون جدولة
        </button>
      </SheetContent>
    </Sheet>
  );
}
