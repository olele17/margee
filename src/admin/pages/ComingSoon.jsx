/** Page provisoire : remplacée à l'étape indiquée. */
export default function ComingSoon({ title, step, icon = 'ti-tools' }) {
  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">{title}</h1>
          <div className="adm-page-sub">Espace administrateur Margee+</div>
        </div>
      </div>
      <div className="adm-soon">
        <i className={`ti ${icon}`} aria-hidden="true" />
        <strong>Cette page arrive à l'étape {step}.</strong>
        <span>L'accès, les rôles et le journal d'activité sont en place.</span>
      </div>
    </div>
  );
}
