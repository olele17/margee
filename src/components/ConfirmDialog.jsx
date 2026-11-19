import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Fenêtre de confirmation accessible.
 * - Le focus va sur « Annuler » à l'ouverture (choix sûr par défaut).
 * - Échap ou un clic à côté de la fenêtre annule.
 * - Tab reste à l'intérieur de la fenêtre.
 * - Le focus revient sur le bouton d'origine à la fermeture.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  icon = 'ti-alert-circle',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    cancelRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll('button');
        if (!focusables?.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-message' : undefined}
      >
        <div className={`confirm-icon${danger ? ' confirm-icon--danger' : ''}`} aria-hidden="true">
          <i className={`ti ${icon}`} />
        </div>
        <h2 id="confirm-title" className="confirm-title">{title}</h2>
        {message && <p id="confirm-message" className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-outline" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${danger ? 'btn-confirm-danger' : 'btn-dark'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
