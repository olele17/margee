import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';
import { annualPrice } from '../../services/api';
import usePlans from '../../hooks/usePlans';
import { getPlanOffer } from '../../utils/planOffer';
import { RECEIPT_THEMES, DEFAULT_RECEIPT_COLORS, getReceiptColors, isHexColor, matchTheme } from '../../utils/receiptTheme';
import { isFreeTier, MARGEE_URL } from '../../utils/pdfBrand';
import { fmt } from '../../utils/calc';
import SignaturePad from '../../components/SignaturePad';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_IMAGE_BYTES = 1024 * 1024; // 1 Mo : les images sont stockées dans le navigateur

const STATUS_LABELS = { active: 'Actif', trial: 'Essai gratuit', pending: 'En attente', expired: 'Expiré', suspended: 'Suspendu' };

export default function Settings() {
  const { account, refresh } = useAuth();
  const catalog = usePlans(); // plans lus dans la base
  // Entreprise
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  // Reçus
  const [logo, setLogo] = useState(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [signatureType, setSignatureType] = useState('draw');
  const [signatureImage, setSignatureImage] = useState(null);
  // Couleurs du reçu (bandeau du tableau + bande « Total payé »)
  const [colorPrimary, setColorPrimary] = useState(DEFAULT_RECEIPT_COLORS.primary);
  const [colorAccent, setColorAccent] = useState(DEFAULT_RECEIPT_COLORS.accent);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!account) return;
    const rs = account.receiptSettings || {};
    setBusinessName(account.businessName || '');
    setOwnerName(account.ownerName || '');
    setPhone(account.phone || '');
    setContactEmail(rs.email || account.email || '');
    setLogo(rs.logo || null);
    setAddress(rs.address || '');
    setCity(rs.city || '');
    setNote(rs.note || '');
    setSignatureType(rs.signatureType || 'draw');
    setSignatureImage(rs.signatureImage || null);
    setColorPrimary(isHexColor(rs.colorPrimary) ? rs.colorPrimary : DEFAULT_RECEIPT_COLORS.primary);
    setColorAccent(isHexColor(rs.colorAccent) ? rs.colorAccent : DEFAULT_RECEIPT_COLORS.accent);
  }, [account]);

  if (!account) return null;
  const sub = account.subscription || {};
  const plan = sub.plan ? catalog.all[sub.plan] : null;
  const offer = getPlanOffer(account, catalog);
  const yearly = sub.billing === 'yearly';
  const themeId = matchTheme(colorPrimary, colorAccent);
  const colors = getReceiptColors({ colorPrimary, colorAccent }).hex;

  const readImage = async (e, setter) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setErr('Image trop lourde : choisis une image de moins de 1 Mo.');
      return;
    }
    setErr('');
    setter(await fileToDataUrl(file));
  };

  const save = async () => {
    setErr('');
    if (!businessName.trim()) {
      setErr('Le nom de l\'entreprise est obligatoire.');
      return;
    }
    setSaving(true);
    try {
      await api.updateBusinessInfo(account.id, { businessName, ownerName, phone });
      await api.updateReceiptSettings(account.id, {
        logo, address, city, note, signatureType, signatureImage,
        email: contactEmail.trim(),
        // Couleurs Margee+ : on enregistre « par défaut » (null)
        colorPrimary: themeId === 'margee' ? null : colorPrimary.toUpperCase(),
        colorAccent: themeId === 'margee' ? null : colorAccent.toUpperCase(),
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content">
      <div className="section-header">
        <div>
          <h2 className="section-title">Paramètres</h2>
          <div className="section-sub">Les informations de ton entreprise apparaissent sur chaque reçu PDF.</div>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-main">
          {/* ── Informations de l'entreprise ─────────────────── */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="form-card-title" style={{ marginBottom: 4 }}>
              <i className="ti ti-building-store" /> Informations de l'entreprise
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted-text)', marginBottom: 18 }}>
              Logo, nom, adresse et contacts imprimés en haut et en bas de tes reçus.
            </div>

            {/* Logo */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
              <div className="logo-upload-box">
                {logo ? <img src={logo} alt="Logo de l'entreprise" /> : <i className="ti ti-photo" style={{ fontSize: 28, color: 'var(--subtle-text)' }} />}
              </div>
              <div>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  <i className="ti ti-upload" /> {logo ? 'Changer le logo' : 'Ajouter un logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => readImage(e, setLogo)} style={{ display: 'none' }} />
                </label>
                {logo && (
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setLogo(null)}>
                    Retirer
                  </button>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--muted-text)', marginTop: 6 }}>PNG ou JPG, 1 Mo maximum.</div>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="set-business">Nom de l'entreprise *</label>
                <input id="set-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex : Fatou Boutique" />
              </div>
              <div className="field">
                <label htmlFor="set-owner">Nom du propriétaire</label>
                <input id="set-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Prénom Nom" />
              </div>
              <div className="field">
                <label htmlFor="set-phone">Téléphone</label>
                <input id="set-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77 000 00 00" />
              </div>
              <div className="field">
                <label htmlFor="set-email">Email de contact (sur les reçus)</label>
                <input id="set-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@maboutique.com" />
              </div>
              <div className="field">
                <label htmlFor="set-address">Adresse</label>
                <input id="set-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ex : Zac Mbao, Dakar" />
              </div>
              <div className="field">
                <label htmlFor="set-city">Ville (« Fait à »)</label>
                <input id="set-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex : Dakar" />
              </div>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="set-note">Note affichée sur le reçu</label>
                <textarea
                  id="set-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex : Merci pour votre confiance. Pour toute assistance, contactez-nous sur WhatsApp."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border-light)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted-text)', marginTop: 10 }}>
              Ton email de connexion ({account.email}) ne change pas.
            </div>
          </div>

          {/* ── Couleurs du reçu ───────────────────────────────── */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="form-card-title" style={{ marginBottom: 6 }}>
              <i className="ti ti-palette" /> Couleurs du reçu
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted-text)', marginBottom: 12 }}>
              Choisis un thème ou tes propres couleurs : l'aperçu à droite et tes reçus PDF changent tout de suite.
            </div>
            <div className="rc-themes" role="radiogroup" aria-label="Thème de couleurs du reçu">
              {RECEIPT_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={themeId === t.id}
                  className={`rc-theme${themeId === t.id ? ' is-on' : ''}`}
                  onClick={() => { setColorPrimary(t.primary); setColorAccent(t.accent); }}
                >
                  <span className="rc-swatch" aria-hidden="true">
                    <span style={{ background: t.primary }} />
                    <span style={{ background: t.accent }} />
                  </span>
                  {t.label}
                </button>
              ))}
              <span className={`rc-theme rc-theme--custom${themeId === 'custom' ? ' is-on' : ''}`} aria-hidden={themeId !== 'custom'}>
                <i className="ti ti-adjustments-horizontal" aria-hidden="true" /> Personnalisé
              </span>
            </div>
            <div className="rc-pickers">
              <label className="rc-picker" htmlFor="rc-primary">
                <input id="rc-primary" type="color" value={colorPrimary} onChange={(e) => setColorPrimary(e.target.value)} />
                <span>
                  <b>Bandeau du tableau</b>
                  <span className="rc-hex">{colorPrimary.toUpperCase()}</span>
                </span>
              </label>
              <label className="rc-picker" htmlFor="rc-accent">
                <input id="rc-accent" type="color" value={colorAccent} onChange={(e) => setColorAccent(e.target.value)} />
                <span>
                  <b>Total payé et « Merci »</b>
                  <span className="rc-hex">{colorAccent.toUpperCase()}</span>
                </span>
              </label>
            </div>
            {themeId !== 'margee' && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => { setColorPrimary(DEFAULT_RECEIPT_COLORS.primary); setColorAccent(DEFAULT_RECEIPT_COLORS.accent); }}>
                <i className="ti ti-arrow-back-up" aria-hidden="true" /> Revenir aux couleurs Margee+
              </button>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--muted-text)', marginTop: 8 }}>
              Le texte passe automatiquement en blanc ou en noir pour rester lisible. Pense à enregistrer.
            </div>
          </div>

          {/* ── Signature ──────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="form-card-title" style={{ marginBottom: 12 }}>
              <i className="ti ti-signature" /> Signature
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="sigType" checked={signatureType === 'draw'} onChange={() => setSignatureType('draw')} />
                Dessiner à la main
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="sigType" checked={signatureType === 'upload'} onChange={() => setSignatureType('upload')} />
                Importer une image
              </label>
            </div>

            {signatureType === 'draw' ? (
              <SignaturePad value={signatureImage} onChange={setSignatureImage} />
            ) : (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div className="logo-upload-box" style={{ width: 160, height: 90 }}>
                  {signatureImage ? <img src={signatureImage} alt="Signature" /> : <i className="ti ti-signature" style={{ fontSize: 26, color: 'var(--subtle-text)' }} />}
                </div>
                <div>
                  <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                    <i className="ti ti-upload" /> {signatureImage ? 'Changer' : 'Importer'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => readImage(e, setSignatureImage)} style={{ display: 'none' }} />
                  </label>
                  {signatureImage && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setSignatureImage(null)}>
                      Retirer
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Enregistrer ────────────────────────────────────── */}
          <div className="settings-save">
            {err && <div className="settings-err" role="alert">{err}</div>}
            <div className="form-actions" style={{ marginTop: 0 }}>
              <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>
                <i className="ti ti-device-floppy" /> {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
              {saved && (
                <span style={{ fontSize: 13, color: 'var(--gold-dark-aa)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }} role="status">
                  <i className="ti ti-check" /> Enregistré
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Aperçu + abonnement ─────────────────────────────── */}
        <aside className="settings-side">
          <div className="receipt-preview" aria-label="Aperçu de l'en-tête du reçu">
            <div className="receipt-preview-label">Aperçu de ton reçu</div>
            <div className="receipt-preview-paper">
              <div className="receipt-preview-top">
                <div>
                  <div className="receipt-preview-title">REÇU DE PAIEMENT</div>
                  <div className="receipt-preview-muted">Numéro : ES-2026-0001</div>
                </div>
                {logo && <img src={logo} alt="" className="receipt-preview-logo" />}
              </div>
              <div className="receipt-preview-business">{businessName || 'Nom de ton entreprise'}</div>
              {address && <div className="receipt-preview-muted">{address}</div>}
              {phone && <div className="receipt-preview-muted">Tél : {phone}</div>}
              {contactEmail && <div className="receipt-preview-muted">Email : {contactEmail}</div>}
              <div className="rc-prev-client" style={{ background: colors.tint }}>
                <span className="rc-prev-small">REÇU DE :</span> Client exemple
              </div>
              <div className="rc-prev-head" style={{ background: colors.primary, color: colors.onPrimary }}>
                <span>DESCRIPTION</span><span>MONTANT</span>
              </div>
              <div className="rc-prev-row"><span>Sac à main × 1</span><b>18 500</b></div>
              <div className="receipt-preview-bar" style={{ background: colors.accent, color: colors.onAccent }}><span>TOTAL PAYÉ</span><span>18 500 Fr</span></div>
              {note && <div className="receipt-preview-note" style={{ background: colors.noteBg }}>{note}</div>}
              <div className="rc-prev-thanks" style={{ color: colors.thanks }}>MERCI POUR VOTRE CONFIANCE !</div>
              {isFreeTier(account) && (
                <div className="rc-prev-brand" title="Mention retirée avec les plans Pro et Elite">Créé gratuitement avec Margee+ · {MARGEE_URL}</div>
              )}
              <div className="receipt-preview-muted" style={{ marginTop: 10 }}>
                Fait à {city || '—'}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="form-card-title" style={{ marginBottom: 12 }}>
              <i className="ti ti-crown" /> Abonnement
            </div>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>
                <b>Statut :</b>{' '}
                <span className={`badge ${offer.paidActive || offer.trialActive ? 'ok' : sub.status === 'pending' ? 'pending' : 'off'}`}>
                  {offer.expired && sub.status !== 'pending' ? 'Expiré' : (STATUS_LABELS[sub.status] || sub.status)}
                </span>
              </div>
              {plan && (
                <div>
                  <b>Plan :</b> {plan.label}
                  {plan.price > 0 && (yearly ? ` — ${fmt(annualPrice(plan, catalog.annualMonths))} / an` : ` — ${fmt(plan.price)} / mois`)}
                </div>
              )}
              {offer.trialActive && sub.trialEndsAt && <div><b>Essai jusqu'au :</b> {new Date(sub.trialEndsAt).toLocaleDateString('fr-FR')}</div>}
              {sub.expiresAt && <div><b>{offer.paidActive ? 'Valable jusqu\'au' : 'Expiré le'} :</b> {new Date(sub.expiresAt).toLocaleDateString('fr-FR')}</div>}
            </div>
            {offer.action && (
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                <Link to={offer.href} className={`btn ${offer.action.kind === 'upgrade' || offer.expired ? 'btn-primary' : 'btn-outline'} btn-block`}>
                  <i className={`ti ${offer.action.kind === 'upgrade' ? 'ti-arrow-big-up-lines' : 'ti-refresh'}`} aria-hidden="true" /> {offer.action.label}
                </Link>
                <Link to="/abonnement" className="btn btn-ghost btn-block btn-sm">Voir tous les plans</Link>
                {offer.action.kind === 'upgrade' && offer.paidActive && (
                  <p style={{ fontSize: 12, color: 'var(--muted-text)', margin: 0, lineHeight: 1.5 }}>
                    Les jours restants de ton plan {offer.currentLabel} sont convertis et ajoutés à ton nouveau plan.
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
