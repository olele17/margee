import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';
import { annualPrice } from '../../services/api';
import usePlans from '../../hooks/usePlans';
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

const STATUS_LABELS = { active: 'Actif', pending: 'En attente', expired: 'Expiré' };

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
  }, [account]);

  if (!account) return null;
  const sub = account.subscription || {};
  const plan = sub.plan ? catalog.all[sub.plan] : null;
  const yearly = sub.billing === 'yearly';

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
              <div className="receipt-preview-bar"><span>TOTAL PAYÉ</span><span>18 500 Fr</span></div>
              {note && <div className="receipt-preview-note">{note}</div>}
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
                <span className={`badge ${sub.status === 'active' ? 'ok' : sub.status === 'pending' ? 'pending' : 'off'}`}>
                  {STATUS_LABELS[sub.status] || sub.status}
                </span>
              </div>
              {plan && (
                <div>
                  <b>Plan :</b> {plan.label}
                  {plan.price > 0 && (yearly ? ` — ${fmt(annualPrice(plan, catalog.annualMonths))} / an` : ` — ${fmt(plan.price)} / mois`)}
                </div>
              )}
              {sub.expiresAt && <div><b>Expire le :</b> {new Date(sub.expiresAt).toLocaleDateString('fr-FR')}</div>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
