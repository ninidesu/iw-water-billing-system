import { useState } from 'react'
import { ClipboardList, LifeBuoy } from 'lucide-react'
import ServiceApplications from './ServiceApplications.jsx'
import ConcernsComplaints from './ConcernsComplaints.jsx'

export default function Requests({ initialQueue = 'service_applications', lockedQueue = false, embedded = false }) {
  const [queue, setQueue] = useState(initialQueue)

  if (lockedQueue) {
    if (initialQueue === 'service_cases') {
      return <ConcernsComplaints embedded={embedded} />
    }
    return <ServiceApplications embedded={embedded} />
  }

  return (
    <div className={embedded ? 'embedded-requests' : 'page-content'}>
      <div className="unified-requests-switcher" style={{ marginBottom: 16 }}>
        <div className="view-switch" role="tablist" aria-label="Customer service operations switch">
          <button
            type="button"
            className={`button ${queue === 'service_applications' ? '' : 'button-ghost'}`}
            onClick={() => setQueue('service_applications')}
          >
            <ClipboardList size={16} /> Service Applications
          </button>
          <button
            type="button"
            className={`button ${queue === 'service_cases' ? '' : 'button-ghost'}`}
            onClick={() => setQueue('service_cases')}
          >
            <LifeBuoy size={16} /> Concerns & Complaints
          </button>
        </div>
      </div>

      {queue === 'service_cases' ? (
        <ConcernsComplaints embedded />
      ) : (
        <ServiceApplications embedded />
      )}
    </div>
  )
}
