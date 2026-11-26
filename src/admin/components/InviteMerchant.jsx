import { useState } from 'react';
import ActionDialog from './ActionDialog';
import { inviteMerchant } from '../adminApi';

const PLANS = [
  { id: 'pro', label: 'Pro' },
  { id: 'elite', label: 'Elite' },
  { id: 'free', label: 'Free (gratuit)' },
];
const DURATIONS = {
  paid: [[30, '1 mois'], [60, '2 mois'], [90, '3 mois'], [180, '6 mois'], [365, '1 an']],
  free: [[7, '7 jours'], [14, '14 jours'], [30, '30 jours']],
};
const blank = { email: '', businessName: '', plan: 'pro', days: 30, mode: 'link' };

/**
 * Invitation d'un e-commerçant avec un plan offert (super admin).
 * Le compte est créé tout de suite ; la base active le plan choisi.
 * Mode « lien » : le lien est affiché pour l'envoyer soi-même (WhatsApp…).
 */
export default function InviteMerchant({ onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  const durations = form.plan === 'free' ? DURATIONS.free : DURATIONS.paid;
  const durationLabel = (durations.find(([d]) => d === form.days) || [])[1] || '';
  const planLabel = PLANS.find((p) => p.id === form.plan)?.label;

  const copy = async () => {
    try { await navigator.clipboard.writeText(result.link); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => { setForm(blank); setOpen(true); }}>
        <i className="ti ti-user-plus" aria-hidden="true" /> Inviter un e-commerçant
      </button>

      {result && (
        <div className="adm-invite-link adm-invite-link--merchant" role="status">
          <div className="db-strong"><i className="ti ti-circle-check" aria-hidden="true" /> {result.email} : {result.note}</div>
          {result.link ? (
            <>
              <div className="adm-sub">Envoie ce lien à la personne (WhatsApp, SMS…). Il sert une seule fois et expire dans 24 h.</div>
              <div className="adm-invite-link-row">
                <input readOnly value={result.link} onFocus={(e) => e.target.select()} aria-label="Lien d'invitation" />
                <button type="button" className="btn btn-outline" onClick={copy}>
                  <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" /> {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
            </>
          ) : (
            <div className="adm-sub">L'e-mail d'invitation est parti. La personne choisit son mot de passe en cliquant sur le lien.</div>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Fermer</button>
        </div>
      )}

      <ActionDialog
        open={open}
        icon="ti-user-plus"
        title="Inviter un e-commerçant"
        message="Son compte est créé tout de suite, avec le plan offert ci-dessous. Il n'a plus qu'à choisir son mot de passe."
        confirmLabel="Inviter"
        canSubmit={emailOk}
        onCancel={() => setOpen(false)}
        onSubmit={async (reason) => {
          const res = await inviteMerchant({ ...form, email: form.email.trim(), businessName: form.businessName.trim(), reason });
          setOpen(false);
          setResult(res);
          setCopied(false);
          onDone?.(res);
        }}
      >
        <div className="field">
          <label htmlFor="im-email">E-mail de la personne</label>
          <input id="im-email" type="email" autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="prenom@exemple.com" />
        </div>
        <div className="field">
          <label htmlFor="im-shop">Nom de la boutique <span className="adm-sub">(facultatif)</span></label>
          <input id="im-shop" type="text" maxLength={120} value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} placeholder="Boutique Awa" />
        </div>
        <div className="adm-im-row">
          <div className="field">
            <label htmlFor="im-plan">Plan offert</label>
            <select id="im-plan" value={form.plan} onChange={(e) => { const plan = e.target.value; set({ plan, days: plan === 'free' ? 14 : 30 }); }}>
              {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {form.plan !== 'free' && <div className="field">
            <label htmlFor="im-days">Offert pendant</label>
            <select id="im-days" value={form.days} onChange={(e) => set({ days: Number(e.target.value) })}>
              {durations.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
            </select>
          </div>}
        </div>
        <fieldset className="adm-invite-mode">
          <legend>Envoi</legend>
          <label className="adm-check"><input type="radio" name="im-mode" checked={form.mode === 'link'} onChange={() => set({ mode: 'link' })} /> Lien à envoyer moi-même (WhatsApp, SMS…)</label>
          <label className="adm-check"><input type="radio" name="im-mode" checked={form.mode === 'email'} onChange={() => set({ mode: 'email' })} /> E-mail envoyé par Margee+</label>
        </fieldset>
        {emailOk && <p className="adm-sub">Résumé : {planLabel} {form.plan === 'free' ? '(sans date de fin, 3 essais offerts)' : `offert pendant ${durationLabel}`}.</p>}
      </ActionDialog>
    </>
  );
}
