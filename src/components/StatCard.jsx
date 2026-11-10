export default function StatCard({ label, value, icon: Icon, tone = 'blue', detail, className = '' }) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-top">
        <span>{label}</span>
        {Icon && (
          <span className={`stat-icon tone-${tone}`}>
            <Icon size={19} strokeWidth={1.9} />
          </span>
        )}
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}
