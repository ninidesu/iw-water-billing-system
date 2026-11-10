import { billStatus } from '../lib/format.js'

export default function StatusBadge({ status, bill }) {
  const value = bill ? billStatus(bill) : status || 'Unknown'
  const displayLabel = value.toLowerCase() === 'pending' ? 'Pending Encoding' : value
  return <span className={`status-badge status-${value.toLowerCase()}`}>{displayLabel}</span>
}
