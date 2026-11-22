import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Fenêtre d'action admin avec MOTIF OBLIGATOIRE (écrit au journal).
 * Reprend le style de ConfirmDialog (.confirm-*) et les champs .field.
 * - children : champs supplémentaires (plan, nombre de jours, nom…)
 * - canSubmit : condition supplémentaire pour activer le bouton
 * - onSubmit(reason) : promesse ; une erreur est affichée dans la fenêtre
 * La base revérifie tout (rôle, motif) : ce contrôle n'est qu'un confort.
 */
export default function ActionDialog({
  open,
  title,
  message,
  icon = 'ti-alert-circle',
  danger = false,
  confirmLabel = 'Confirmer',
  canSubmit = true,
  onSubmit,
  onCancel,
  children,
}) {
  const dialogRef = useRef(null);
  const reasonRef = useRef(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Dernière version de onCancel, sans relancer l'initialisation (qui
  // effacerait le motif) quand la page parente se redessine.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    setReason('');
    setErr('');
    setBusy(false);
    const previous = document.activeElement;
    setTimeout(() => (dialogRef.current?.querySelector('[data-autofocus]') || reasonRef.current)?.focus(), 0);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancelRef.current(); }
      else if (e.key === 'Tab') {
        const els = dialogRef.current?.querySelectorAll('button:not([disabled]), input, select, textarea');
        if (!els?.length) return;
        const first = els[0];
        const last = els[els.length - 1];
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
  }, [open]);

  if (!open) return null;
  const reasonOk = reason.trim().length >= 3;

  const submit = async (e) => {
    e.preventDefault();
    if (!reasonOk || !canSubmit || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onSubmit(reason.trim());
    } catch (ex) {
      setErr(ex.message || 'Action impossible. Réessaie.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form
        ref={dialogRef}
        className="confirm-dialog adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-dialog-title"
        onSubmit={submit}
      >
        <div className={`confirm-icon${danger ? ' confirm-icon--danger' : ''}`} aria-hidden="true">
          <i className={`ti ${icon}`} />
        </div>
        <h2 id="adm-dialog-title" className="confirm-title">{title}</h2>
        {message && <p className="confirm-message">{message}</p>}

        <div className="adm-dialog-fields">
          {children}
          <div className="field">
            <label htmlFor="adm-reason">Motif (obligatoire, visible dans le journal)</label>
            <textarea
              id="adm-reason"
              ref={reasonRef}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : demande du client par WhatsApp le 21/11"
              required
            />
          </div>
        </div>

        {err && <div className="db-filter-err" role="alert">{err}</div>}

        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Annuler</button>
          <button type="submit" className={`btn ${danger ? 'btn-confirm-danger' : 'btn-dark'}`} disabled={!reasonOk || !canSubmit || busy}>
            {busy ? <><i className="ti ti-loader-2 adm-spin" aria-hidden="true" /> Patiente…</> : confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
