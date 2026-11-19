export default function StatCard({ label, value, sub, trend, positive, highlight, negative, onAction }) {
  const trendDirClass = trend ? (positive === false ? 'down' : 'up') : '';
  return (
    <div className={`kpi-card${highlight ? ' highlight' : ''}`}>
      <div className="kpi-top-row">
        <span className="kpi-label">{label}</span>
        <button className="kpi-action-icon" onClick={onAction} title="Voir détails">
          <i className="ti ti-arrow-up-right" />
        </button>
      </div>

      <div className={`kpi-value${negative ? ' is-negative' : ''}`}>{value}</div>

      {(sub || trend) && (
        <div className={`kpi-trend-pill ${trendDirClass}`}>
          {trend && <i className={`ti ti-arrow-${positive === false ? 'down' : 'up'}-right`} style={{ fontSize: 12 }} />}
          <span>{trend || sub}</span>
        </div>
      )}
    </div>
  );
}
