import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getPlatformSettings, updatePlatformSettings, listTeam, setTeamRole, setTeamDisabled, inviteTeamMember,
} from '../adminApi';
import { useAdmin } from '../AdminRoute';
import { can, ROLES } from '../permissions';
import { dateFr, dateTimeFr } from '../format';
import ActionDialog from '../components/ActionDialog';
import { reloadPlans } from '../../hooks/usePlans';
import '../../styles/dashboard.css';

/* ── Inscriptions et essai gratuit ─────────────────────────────── */
function PlatformSettings({ canEdit, onToast }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [dialog, setDialog] = useState(false);

  const load = () => getPlatformSettings().then((s) => { setSaved(s); setForm(s); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (!form) return <section className="db-card adm-set">{err ? <div className="db-filter-err" role="alert">{err}</div> : <div className="adm-loading">Chargement…</div>}</section>;

  const trial = Number(form.trialDays);
  const msg = form.closedMessage.trim();
  const errors = {
    trial: !Number.isInteger(trial) || trial < 1 || trial > 30 ? 'Entre 1 et 30 jours.' : '',
    message: msg.length < 5 || msg.length > 300 ? 'Entre 5 et 300 caractères.' : '',
  };
  const valid = !errors.trial && !errors.message;
  const changes = [];
  if (form.signupOpen !== saved.signupOpen) changes.push(form.signupOpen ? 'Inscriptions OUVERTES' : 'Inscriptions FERMÉES');
  if (msg !== saved.closedMessage.trim()) changes.push('Message de fermeture modifié');
  if (trial !== saved.trialDays) changes.push(`Essai gratuit : ${saved.trialDays} → ${trial} jours`);
  const dirty = changes.length > 0;

  return (
    <section className="db-card adm-set" aria-labelledby="set-title">
      <div className="adm-set-head">
        <span className="adm-set-icon" aria-hidden="true"><i className="ti ti-user-plus" /></span>
        <div>
          <h2 id="set-title" className="adm-set-title">Inscriptions et essai gratuit</h2>
          <div className="adm-sub">Dernière modification : {saved.updatedAt ? dateTimeFr(saved.updatedAt) : '—'}</div>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (dirty && valid) setDialog(true); }} noValidate>
        <div className={`adm-switch-row${form.signupOpen ? '' : ' is-off'}`}>
          <label className="adm-check" htmlFor="set-open">
            <input id="set-open" type="checkbox" checked={form.signupOpen} disabled={!canEdit} onChange={(e) => { const v = e.target.checked; setForm((s) => ({ ...s, signupOpen: v })); }} />
            Inscriptions ouvertes
          </label>
          <span className={`badge ${form.signupOpen ? 'ok' : 'off'}`}>
            <i className={`ti ${form.signupOpen ? 'ti-lock-open' : 'ti-lock'}`} aria-hidden="true" />{form.signupOpen ? 'Ouvertes' : 'Fermées'}
          </span>
        </div>
        <p className="adm-sub adm-set-help">
          Fermées : la page d'inscription affiche le message ci-dessous et la base refuse les nouveaux comptes.
          Les e-commerçants déjà inscrits ne sont pas touchés. Les membres de l'équipe invités peuvent toujours créer leur compte.
        </p>

        <div className="adm-set-fields">
          <div className="field adm-plan-wide">
            <label htmlFor="set-message">Message affiché quand les inscriptions sont fermées</label>
            <textarea id="set-message" rows={3} maxLength={300} value={form.closedMessage} disabled={!canEdit} onChange={(e) => { const v = e.target.value; setForm((s) => ({ ...s, closedMessage: v })); }} aria-invalid={!!errors.message} />
            <div className="adm-sub">{msg.length} / 300</div>
            {errors.message && <div className="adm-field-err" role="alert">{errors.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="set-trial">Durée de l'essai gratuit (jours)</label>
            <input id="set-trial" type="number" min="1" max="30" value={form.trialDays} disabled={!canEdit} onChange={(e) => { const v = e.target.value === '' ? '' : Number(e.target.value); setForm((s) => ({ ...s, trialDays: v })); }} aria-invalid={!!errors.trial} />
            {errors.trial && <div className="adm-field-err" role="alert">{errors.trial}</div>}
          </div>
          <div className="adm-plan-note">
            <i className="ti ti-info-circle" aria-hidden="true" />
            <span>S'applique seulement aux <b>nouveaux inscrits</b> : les essais en cours gardent leur date de fin.</span>
          </div>
        </div>

        {canEdit && (
          <div className="adm-plan-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(saved)} disabled={!dirty}>
              <i className="ti ti-arrow-back-up" aria-hidden="true" /> Annuler les modifications
            </button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || !valid}>
              <i className="ti ti-device-floppy" aria-hidden="true" /> Enregistrer
            </button>
          </div>
        )}
      </form>

      <ActionDialog
        open={dialog}
        icon={form.signupOpen ? 'ti-settings' : 'ti-lock'}
        danger={!form.signupOpen && saved.signupOpen}
        title="Enregistrer les paramètres ?"
        message={`${changes.join(' · ')}. Effet immédiat sur la page d'inscription.`}
        confirmLabel="Enregistrer"
        onCancel={() => setDialog(false)}
        onSubmit={async (reason) => {
          await updatePlatformSettings({ signupOpen: form.signupOpen, closedMessage: msg, trialDays: trial }, reason);
          setDialog(false);
          await load();
          reloadPlans(); // la durée d'essai apparaît dans les avantages du plan Free
          onToast('Paramètres enregistrés.');
        }}
      />
    </section>
  );
}

/* ── Équipe ─────────────────────────────────────────────────────── */
function Team({ onToast }) {
  const [team, setTeam] = useState(null);
  const [err, setErr] = useState('');
  const [dialog, setDialog] = useState(null); // { type, member }
  const [newRole, setNewRole] = useState('support');
  const [invite, setInvite] = useState({ email: '', role: 'support', mode: 'link' });
  const [inviteLink, setInviteLink] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => listTeam().then(setTeam).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(invite.email.trim());
  const member = dialog?.member;
  const close = () => setDialog(null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteLink.link); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <section className="db-card adm-set" aria-labelledby="team-title">
      <div className="adm-set-head">
        <span className="adm-set-icon" aria-hidden="true"><i className="ti ti-users" /></span>
        <div>
          <h2 id="team-title" className="adm-set-title">Équipe admin</h2>
          <div className="adm-sub">Super admin : accès complet. Support : lecture, notes, signalements et prolongations.</div>
        </div>
      </div>

      {err && <div className="db-filter-err" role="alert">{err}</div>}

      <div className="db-table-scroll">
        <table className="db-table adm-table">
          <thead>
            <tr><th>Membre</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {!team && !err && <tr><td colSpan={5}><div className="adm-loading">Chargement…</div></td></tr>}
            {team?.map((m) => (
              <tr key={m.user_id} className={m.disabled_at ? 'adm-row-off' : ''}>
                <td>
                  <div className="db-strong">{m.email}{m.is_me && <span className="adm-me">toi</span>}</div>
                  <div className="adm-sub">
                    Ajouté le {dateFr(m.created_at)}{m.invited_by_email ? ` par ${m.invited_by_email}` : ''}
                  </div>
                </td>
                <td className="db-nowrap">{ROLES[m.role]?.label || m.role}</td>
                <td>
                  {m.disabled_at
                    ? <span className="badge off"><i className="ti ti-ban" aria-hidden="true" />Désactivé</span>
                    : <span className="badge ok"><i className="ti ti-circle-check" aria-hidden="true" />Actif</span>}
                </td>
                <td className="db-nowrap">{m.last_sign_in_at ? dateTimeFr(m.last_sign_in_at) : (m.invited ? 'Invitation en attente' : 'Jamais')}</td>
                <td>
                  {!m.is_me && (
                    <div className="adm-row-actions">
                      {!m.disabled_at && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setNewRole(m.role === 'support' ? 'super_admin' : 'support'); setDialog({ type: 'role', member: m }); }}>
                          <i className="ti ti-switch-horizontal" aria-hidden="true" /> Rôle
                        </button>
                      )}
                      <button type="button" className={`btn btn-sm ${m.disabled_at ? 'btn-outline' : 'adm-btn-warn'}`} onClick={() => setDialog({ type: m.disabled_at ? 'enable' : 'disable', member: m })}>
                        <i className={`ti ${m.disabled_at ? 'ti-player-play' : 'ti-ban'}`} aria-hidden="true" /> {m.disabled_at ? 'Réactiver' : 'Désactiver'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-sub adm-set-help">Tu ne peux pas modifier ton propre accès. Il reste toujours au moins un super admin actif.</p>

      <form className="adm-invite" onSubmit={(e) => { e.preventDefault(); if (emailOk) setDialog({ type: 'invite' }); }} noValidate>
        <h3 className="adm-invite-title"><i className="ti ti-mail-plus" aria-hidden="true" /> Inviter un membre</h3>
        <div className="adm-invite-fields">
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" type="email" autoComplete="off" value={invite.email} onChange={(e) => { const v = e.target.value; setInvite((s) => ({ ...s, email: v })); }} placeholder="prenom@exemple.com" />
          </div>
          <div className="field">
            <label htmlFor="inv-role">Rôle</label>
            <select id="inv-role" value={invite.role} onChange={(e) => { const v = e.target.value; setInvite((s) => ({ ...s, role: v })); }}>
              <option value="support">Support</option>
              <option value="super_admin">Super admin</option>
            </select>
          </div>
          <fieldset className="adm-invite-mode">
            <legend>Envoi</legend>
            <label className="adm-check"><input type="radio" name="inv-mode" checked={invite.mode === 'link'} onChange={() => setInvite((s) => ({ ...s, mode: 'link' }))} /> Lien à partager moi-même</label>
            <label className="adm-check"><input type="radio" name="inv-mode" checked={invite.mode === 'email'} onChange={() => setInvite((s) => ({ ...s, mode: 'email' }))} /> Email envoyé par Margee+</label>
          </fieldset>
        </div>
        <div className="adm-plan-actions">
          <button type="submit" className="btn btn-primary" disabled={!emailOk}>
            <i className="ti ti-send" aria-hidden="true" /> Inviter
          </button>
        </div>
      </form>

      {inviteLink && (
        <div className="adm-invite-link" role="status">
          <div className="db-strong"><i className="ti ti-link" aria-hidden="true" /> Lien d'invitation pour {inviteLink.email}</div>
          <p className="adm-sub">Envoie-le uniquement à cette personne (WhatsApp, SMS…) : il ouvre son compte admin. Elle choisira son mot de passe en l'ouvrant.</p>
          <div className="adm-invite-link-row">
            <input id="inv-link" readOnly value={inviteLink.link} onFocus={(e) => e.target.select()} aria-label="Lien d'invitation" />
            <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
              <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" /> {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}

      <ActionDialog
        open={dialog?.type === 'invite'}
        icon="ti-mail-plus"
        title={`Inviter ${invite.email.trim()} ?`}
        message={`Rôle : ${ROLES[invite.role]?.label}. ${invite.mode === 'link' ? 'Un lien d\'invitation sera affiché ici pour que tu le transmettes.' : 'Supabase enverra l\'email d\'invitation (l\'envoi peut être limité tant qu\'un service d\'emails n\'est pas configuré).'}`}
        confirmLabel="Inviter"
        onCancel={close}
        onSubmit={async (reason) => {
          const res = await inviteTeamMember(invite.email.trim(), invite.role, invite.mode, reason);
          close();
          setInviteLink(res.link ? { email: res.email, link: res.link } : null);
          setCopied(false);
          setInvite({ email: '', role: 'support', mode: invite.mode });
          await load();
          onToast(res.link ? `Invitation créée pour ${res.email} : copie le lien ci-dessous.` : `Email d'invitation envoyé à ${res.email}.`);
        }}
      />
      <ActionDialog
        open={dialog?.type === 'role'}
        icon="ti-switch-horizontal"
        title={`Changer le rôle de ${member?.email} ?`}
        message={`Rôle actuel : ${ROLES[member?.role]?.label}.`}
        confirmLabel="Changer le rôle"
        canSubmit={newRole !== member?.role}
        onCancel={close}
        onSubmit={async (reason) => {
          await setTeamRole(member.user_id, newRole, reason);
          close();
          await load();
          onToast(`Rôle de ${member.email} : ${ROLES[newRole].label}.`);
        }}
      >
        <div className="field">
          <label htmlFor="team-role">Nouveau rôle</label>
          <select id="team-role" data-autofocus value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="support">Support</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>
      </ActionDialog>
      <ActionDialog
        open={dialog?.type === 'disable' || dialog?.type === 'enable'}
        icon={dialog?.type === 'disable' ? 'ti-ban' : 'ti-player-play'}
        danger={dialog?.type === 'disable'}
        title={dialog?.type === 'disable' ? `Désactiver ${member?.email} ?` : `Réactiver ${member?.email} ?`}
        message={dialog?.type === 'disable'
          ? 'Cette personne perd immédiatement l\'accès à l\'espace admin. Son historique reste dans le journal.'
          : 'Cette personne retrouve l\'accès à l\'espace admin avec son rôle.'}
        confirmLabel={dialog?.type === 'disable' ? 'Désactiver' : 'Réactiver'}
        onCancel={close}
        onSubmit={async (reason) => {
          const disable = dialog.type === 'disable';
          await setTeamDisabled(member.user_id, disable, reason);
          close();
          await load();
          onToast(`${member.email} ${disable ? 'désactivé' : 'réactivé'}.`);
        }}
      />
    </section>
  );
}

export default function Settings() {
  const { role } = useAdmin();
  const [toast, setToast] = useState('');
  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">Paramètres et équipe</h1>
          <div className="adm-page-sub">Chaque modification demande un motif et apparaît dans le <Link to="/admin/journal">journal d'activité</Link>.</div>
        </div>
      </div>
      {toast && <div className="adm-toast" role="status"><i className="ti ti-circle-check" aria-hidden="true" /> {toast}</div>}
      <PlatformSettings canEdit={can(role, 'settings.edit')} onToast={setToast} />
      {can(role, 'team.manage') && <Team onToast={setToast} />}
    </div>
  );
}
