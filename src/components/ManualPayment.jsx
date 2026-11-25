import { useEffect, useState } from 'react';
import { declareManualPayment, getManualPaymentInfo, getMyManualPayment } from '../services/api';
import { fmt } from '../utils/calc';

const METHODS = [
  { id: 'wave', label: 'Wave' },
  { id: 'orange_money', label: 'Orange Money' },
];
const methodLabel = (id) => METHODS.find((m) => m.id === id)?.label || id;
const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Paiement direct (hors Bictorys) : l'e-commerçant envoie l'argent par
 * Wave ou Orange Money au numéro de Margee+, puis déclare son paiement.
 * L'équipe vérifie la réception et active l'abonnement depuis l'admin.
 */
export default function ManualPayment({ plan, planLabel, billing, amount }) {
  const [info, setInfo] = useState(null);
  const [last, setLast] = useState(undefined); // undefined = chargement
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ method: 'wave', payerPhone: '', transactionRef: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getManualPaymentInfo().then((i) => { if (alive) setInfo(i); }).catch(() => { if (alive) setInfo(null); });
    getMyManualPayment().then((p) => { if (alive) setLast(p); }).catch(() => { if (alive) setLast(null); });
    return () => { alive = false; };
  }, []);

  if (!info?.enabled || last === undefined) return null;

  // Déclaration déjà en cours de vérification
  if (last?.status === 'pending') {
    return (
      <div className="mp-box mp-box--pending" role="status">
        <i className="ti ti-clock-hour-4" aria-hidden="true" />
        <div>
          <strong>Paiement déclaré, en cours de vérification</strong>
          <p>{fmt(last.amount)} par {methodLabel(last.method)}, déclaré le {dateFr(last.created_at)} (réf. {last.reference}). Ton abonnement sera activé dès que l'équipe Margee+ aura confirmé la réception.</p>
        </div>
      </div>
    );
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (form.payerPhone.replace(/\D/g, '').length < 7) { setErr('Indique le numéro qui a envoyé l\'argent.'); return; }
    if (form.transactionRef.trim().length < 4) { setErr('Indique la référence de la transaction (dans le SMS ou l\'app).'); return; }
    setBusy(true);
    try {
      await declareManualPayment({ plan, billing, method: form.method, payerPhone: form.payerPhone, transactionRef: form.transactionRef.trim() });
      setLast(await getMyManualPayment());
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mp-box">
      {last?.status === 'failed' && (
        <p className="mp-warn" role="note">
          <i className="ti ti-alert-circle" aria-hidden="true" /> Ta dernière déclaration n'a pas pu être confirmée. Vérifie la référence, ou écris-nous depuis la messagerie de ton espace.
        </p>
      )}
      <button type="button" className="mp-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><i className="ti ti-cash" aria-hidden="true" /> Tu préfères envoyer l'argent directement par Wave ou Orange Money ?</span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="mp-body">
          <ol className="mp-steps">
            <li>Envoie <b>{fmt(amount)}</b> par Wave ou Orange Money au <b className="mp-number">{info.number}</b> ({info.name}).</li>
            <li>Note la <b>référence de la transaction</b> : elle est dans le SMS de confirmation ou dans l'historique de ton app.</li>
            <li>Déclare ton paiement ci-dessous : on vérifie et on active ton plan <b>{planLabel}</b>.</li>
          </ol>

          <form className="mp-form" onSubmit={submit} noValidate>
            <fieldset className="mp-methods">
              <legend>Moyen utilisé</legend>
              {METHODS.map((m) => (
                <label key={m.id} className={`mp-method${form.method === m.id ? ' on' : ''}`}>
                  <input type="radio" name="mp-method" value={m.id} checked={form.method === m.id} onChange={() => set({ method: m.id })} />
                  {m.label}
                </label>
              ))}
            </fieldset>
            <div className="au-field">
              <label htmlFor="mp-phone">Numéro qui a envoyé l'argent</label>
              <input id="mp-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.payerPhone} onChange={(e) => set({ payerPhone: e.target.value })} placeholder="77 123 45 67" />
            </div>
            <div className="au-field">
              <label htmlFor="mp-ref">Référence de la transaction</label>
              <input id="mp-ref" type="text" autoComplete="off" maxLength={60} value={form.transactionRef} onChange={(e) => set({ transactionRef: e.target.value })} placeholder="Ex. : T_AB12CD34EF" />
            </div>
            {err && <div className="au-err" role="alert">{err}</div>}
            <button className="au-btn" disabled={busy}>
              {busy ? 'Envoi…' : `J'ai payé ${fmt(amount)} : déclarer mon paiement`}
            </button>
            <p className="mp-note">Ton abonnement est activé après vérification par l'équipe Margee+, en général dans la journée.</p>
          </form>
        </div>
      )}
    </div>
  );
}
