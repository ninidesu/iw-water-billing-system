import React, { Component, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import UserMenu from './UserMenu.jsx'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled UI error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-content" style={{ padding: '32px 20px', maxWidth: '640px', margin: '40px auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Something went wrong loading this page</h2>
          <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '20px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              className="button button-outline"
              onClick={() => { this.setState({ hasError: false, error: null }); window.history.back() }}
            >
              Go Back
            </button>
            <button
              type="button"
              className="button"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function Loading({ label = 'Loading…' }) {
  return <div className="loading-wrap" role="status"><span className="spinner" aria-hidden="true" />{label}</div>
}

export function Notice({ type = 'info', children, onClose }) {
  if (!children) return null
  return <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}>
    <span>{children}</span>{onClose && <button type="button" onClick={onClose} aria-label="Dismiss message">×</button>}
  </div>
}

export function EmptyState({ title, description }) {
  return <div className="empty-state"><h3>{title}</h3><p>{description}</p></div>
}

export function PageHeader({ title, description, action }) {
  const { profile } = useAuth()
  const location = useLocation()
  const isStaff = location.pathname.startsWith('/admin') || location.pathname.startsWith('/cashier')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!isStaff) return undefined
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [isStaff])

  const datePart = new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(now)

  const timePart = new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  }).format(now)

  return (
    <div className="page-header">
      <div className="page-header-title">
        <h1>{title}</h1>
        {description && <p className="page-header-desc">{description}</p>}
      </div>
      <div className="page-header-right">
        {action && <div className="page-header-actions">{action}</div>}
        {isStaff && (
          <div className="staff-header-meta">
            <div className="unified-datetime" aria-label={`Current Manila date and time: ${datePart} ${timePart} PHT`}>
              <span className="datetime-date">{datePart}</span>
              <span className="datetime-dot" aria-hidden="true">·</span>
              <strong className="datetime-time">{timePart}</strong>
              <small className="datetime-tz">PHT</small>
            </div>
            <UserMenu />
          </div>
        )}
      </div>
    </div>
  )
}


