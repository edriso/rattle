import { useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';

/**
 * The frame every sheet in the app shares: the passage picker, the settings,
 * and the grading sheet at the end of a session.
 *
 * A module of its own rather than a private helper in `Sheets.tsx`, because
 * `Sheets.tsx` is loaded on demand and pulls the combobox and the select in
 * with it, while the grading sheet ships with the session screen. Sharing it
 * from there would have put the passage picker's widgets in the session's
 * chunk; not sharing it left the three rules below written down in two places,
 * so a fix to one silently missed the sheet a learner sees at the end of every
 * sitting.
 *
 * Drawn only while it is open, so there is no closed state to pass in: every
 * caller renders it conditionally.
 */
export function Panel({
  onClose,
  title,
  description,
  landOn,
  onBack,
  backLabel,
  children,
}: {
  onClose: () => void;
  title: string;
  /** Said to a screen reader, not drawn: what the panel is for. */
  description: string;
  /** Where the cursor goes, when it is not the panel's own name. */
  landOn?: React.RefObject<HTMLElement | null>;
  /**
   * A panel reached from inside another one goes back to it rather than
   * closing over nothing: the reciters are opened from the settings, and
   * whoever chose one there expects to be returned to the settings. The back
   * arrow takes the place of «إغلاق», since two ways out side by side make
   * the reader stop and work out which one they want.
   */
  onBack?: () => void;
  backLabel?: string;
  children: React.ReactNode;
}) {
  /* Opening a panel puts the cursor on its title, not on the close button:
     landing on «إغلاق» reads as though leaving were the thing to do, and a
     screen reader hears the panel's name instead of "close". */
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
        initialFocus={landOn ?? heading}
        dir="rtl"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading" ref={heading} tabIndex={-1}>
          {onBack && (
            <button
              className="icon-button sheet-back"
              aria-label={backLabel}
              onClick={onBack}
            >
              <ArrowRight size={21} />
            </button>
          )}
          <SheetTitle>{title}</SheetTitle>
          {!onBack && (
            <SheetClose className="icon-button" aria-label="إغلاق">
              <X size={21} />
            </SheetClose>
          )}
        </div>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}
