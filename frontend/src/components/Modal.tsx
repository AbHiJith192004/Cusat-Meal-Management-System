import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Every dialog in the app renders through here, into document.body.
 *
 * A dialog left where it is written -- inside a view, which is inside
 * .app-main -- is painted BELOW the desktop sidebar however high its z-index
 * goes: .app-main sits in a stacking context the fixed sidebar is not part of,
 * so the two never compare z-indexes at all. The visible symptom was a modal
 * with its left edge sliced off by the 252px sidebar, and it applied to every
 * dialog on every admin screen. Moving the node to document.body puts it in
 * the same stacking context as the sidebar, where z-index 60 wins.
 *
 * `scrim` renders the app's own bottom-sheet-on-phones treatment; pass false
 * for a dialog that brings its own backdrop markup.
 */
interface ModalProps {
  open: boolean;
  onClose?: () => void;
  labelledBy?: string;
  /** Extra classes for the panel, e.g. "max-w-3xl". */
  panelClassName?: string;
  scrim?: boolean;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  labelledBy,
  panelClassName = '',
  scrim = true,
  children,
}) => {
  React.useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const body = scrim ? (
    <div
      className="modal-scrim animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div className={`modal-panel ${panelClassName}`}>{children}</div>
    </div>
  ) : (
    <>{children}</>
  );

  return createPortal(body, document.body);
};
