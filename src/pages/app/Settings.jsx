import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';
import { PLANS } from '../../services/api';
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

export default function Settings() {
  const { account, refresh } = useAuth();
  const [logo, setLogo] = useState(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [signatureType, setSignatureType] = useState('draw');
  const [signatureImage, setSignatureImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!account) return;
    const rs = account.receiptSettings || {};
    setLogo(rs.logo || null);
    setAddress(rs.address || '');
    setCity(rs.city || '');
    setNote(rs.note || '');
    setSignatureType(rs.signatureType || 'draw');
    setSignatureImage(rs.signatureImage || null);
  }, [account]);

  if (!account) return null;
  const sub = account.subscription;
  const plan = sub.plan ? PLANS[sub.plan] : null;

  const onLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogo(await fileToDataUrl(file));
  };

  const onSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureImage(await fileToDataUrl(file));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateReceiptSettings(account.id, {
        logo, address, city, note, signatureType, signatureImage,
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content narrow">
      <div className="section-header"><h2 className="section-title">Paramètres</h2></div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="form-card-title" style={{ marginBottom: 16 }}>Business</div>
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <div><b>Nom :</b> {account.businessName}</div>
          <div><b>Propriétaire :</b> {account.ownerName}</div>
          <div><b>Téléphone :</b> {account.phone}</div>
          <div><b>Email :</b> {account.email}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="form-card-title" style={{ marginBottom: 4 }}>Reçus &amp; Facturation</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted-text)', marginBottom: 16 }}>
          Ces informations apparaissent sur vos reçus PDF téléchargés.
        </div>

        {/* Logo */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
          <div className="logo-upload-box">
            {logo ? <img src={logo} alt="Logo" /> : <i className="ti ti-photo" style={{ fontSize: 28, color: 'var(--subtle-text)' }} />}
          </div>
          <div>
            <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              <i className="ti ti-upload" /> {logo ? 'Changer le logo' : 'Ajouter un logo'}
              <input type="file" accept="image/*" onChange={onLogoChange} style={{ display: 'none' }} />
            </label>
            {logo && (
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setLogo(null)}>
                Retirer
              </button>
            )}
          </div>
        </div>

        <div className="form-grid">
          <div className="field"><label>Adresse (affichée sur le reçu)</label><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ex: Zac Mbao, Dakar" /></div>
          <div className="field"><label>Ville ("Fait à")</label><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Dakar" /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Note affichée sur le reçu</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Merci pour votre confiance. Pour toute assistance, contactez-nous sur WhatsApp."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border-light)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Signature */}
        <div style={{ marginTop: 20 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--dark-text)', marginBottom: 8 }}>
            Signature
          </label>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
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
                  <input type="file" accept="image/*" onChange={onSignatureUpload} style={{ display: 'none' }} />
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

        <div className="form-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {saved && (
            <span style={{ fontSize: 12.5, color: 'var(--emerald-dark)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-check" /> Enregistré
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <div className="form-card-title" style={{ marginBottom: 16 }}>Abonnement</div>
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <div><b>Statut :</b> <span className={`badge ${sub.status === 'active' ? 'ok' : sub.status === 'pending' ? 'pending' : 'off'}`}>{sub.status}</span></div>
          {plan && <div><b>Plan :</b> {plan.label} — {fmt(plan.price)}</div>}
          {sub.expiresAt && <div><b>Expire le :</b> {new Date(sub.expiresAt).toLocaleDateString('fr-FR')}</div>}
        </div>
      </div>
    </div>
  );
}
