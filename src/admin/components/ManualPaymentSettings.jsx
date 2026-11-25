import { useEffect, useState } from 'react';
import ActionDialog from './ActionDialog';
import { getManualPaymentSettings, updateManualPayment } from '../adminApi';

/**
 * Réglages du paiement direct : numéro Wave / Orange Money et nom
 * affichés aux e-commerçants sur la page des plans (super admin).
 */
export default function ManualPaymentSettings({ canEdit, onToast }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    getManualPaymentSettings().then((s) => { setSaved(s); setForm(s); }).catch((e) => setErr(e.message));
  }, []);

  if (!form) return err ? <div className="db-filter-err" role="alert">{err}</div> : null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const changed = JSON.stringify(form) !== JSON.stringify(saved);
  const valid = /^\+?[0-9 ]{7,20}$/.test(form.number.trim()) && form.name.trim().length >= 2;

  return (
    <section className="db-card adm-set" aria-labelledby="mp-set-title">
      <div className="db-card-head">
        <div>
          <h2 id="mp-set-title" className="db-card-title"><i className="ti ti-cash" aria-hidden="true" /> Paiement direct (Wave / Orange Money)</h2>
          <div className="db-card-sub">Numéro affiché sur la page des plans. Les e-commerçants y envoient l'argent, puis déclarent leur paiement : tu valides dans Paiements.</div>
        </div>
      </div>
      <form className="adm-set-form" onSubmit={(e) => { e.preventDefault(); if (changed && valid) setConfirm(true); }} noValidate>
        <label className="adm-check">
          <input type="checkbox" checked={form.enabled} disabled={!canEdit} onChange={(e) => set({ enabled: e.target.checked })} />
          Proposer le paiement direct aux e-commerçants
        </label>
        <div className="adm-im-row">
          <div className="field">
            <label htmlFor="mp-number">Numéro Wave / Orange Money</label>
            <input id="mp-number" type="tel" value={form.number} disabled={!canEdit} onChange={(e) => set({ number: e.target.value })} placeholder="78 733 28 50" />
          </div>
          <div className="field">
            <label htmlFor="mp-name">Nom affiché</label>
            <input id="mp-name" type="text" maxLength={60} value={form.name} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} placeholder="OLELE" />
          </div>
        </div>
        {canEdit && (
          <div>
            <button type="submit" className="btn btn-primary" disabled={!changed || !valid}>Enregistrer</button>
          </div>
        )}
      </form>
      <ActionDialog
        open={confirm}
        icon="ti-cash"
        title="Modifier le paiement direct ?"
        message={`${form.enabled ? 'Activé' : 'Désactivé'} · ${form.number.trim()} (${form.name.trim()}).`}
        confirmLabel="Enregistrer"
        onCancel={() => setConfirm(false)}
        onSubmit={async (reason) => {
          const s = await updateManualPayment({ enabled: form.enabled, number: form.number.trim(), name: form.name.trim() }, reason);
          const next = { enabled: s.enabled, number: s.number, name: s.name };
          setSaved(next); setForm(next); setConfirm(false);
          onToast?.('Paiement direct mis à jour.');
        }}
      />
    </section>
  );
}
