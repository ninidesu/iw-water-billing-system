import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  Layout,
  LockKeyhole,
  Monitor,
  Palette,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Type,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAdminData } from '../../hooks/useAdminData.js'
import { dateLabel, errorMessage, formatApplicationRef, monthLabel, peso } from '../../lib/format.js'
import { usePreferences } from '../../lib/preferences.js'
import { supabase } from '../../lib/supabaseClient.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../../components/TablePagination.jsx'
import StatCard from '../../components/StatCard.jsx'
import './settings.css'
import './users-audit.css'
import StatusBadge from '../../components/StatusBadge.jsx'

function timeLabel(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    }).format(d)
  } catch {
    return ''
  }
}

export default function AdminModule({ module }) {
  const { data, loading, error, refresh } = useAdminData()

  if (module === 'usersAudit') {
    return <UsersAuditView data={data} loading={loading} error={error} refresh={refresh} />
  }

  if (module === 'settings') {
    return <AdminSettingsView data={data} refresh={refresh} />
  }

  return (
    <div className="page-content">
      <PageHeader title="Adjustments" />
      <section className="panel" style={{ padding: '22px' }}>
        <EmptyState title="Select a customer bill in Statements of Account (SOA) or Customer Accounts to record an adjustment." />
      </section>
    </div>
  )
}

function UsersAuditView({ data, loading, error, refresh }) {
  const [activeTab, setActiveTab] = useState('staff')
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [activitySearch, setActivitySearch] = useState('')
  const [activityFilter, setActivityFilter] = useState('all')

  const profiles = data?.profiles || []
  const payments = data?.payments || []
  const bills = data?.bills || []
  const customers = data?.customers || []
  const applications = data?.applications || []

  const staffProfiles = useMemo(
    () => profiles.filter((p) => p.role === 'admin' || p.role === 'cashier'),
    [profiles]
  )

  const staffList = useMemo(() => {
    return staffProfiles.filter((p) => {
      if (roleFilter !== 'all' && p.role !== roleFilter) return false
      if (search.trim() && !`${p.full_name || ''} ${p.email || ''} ${p.role || ''}`.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      return true
    })
  }, [staffProfiles, roleFilter, search])

  const staffPagination = useTablePagination(staffList, 10, [search, roleFilter])

  const adminCount = useMemo(() => profiles.filter((p) => p.role === 'admin').length, [profiles])
  const cashierCount = useMemo(() => profiles.filter((p) => p.role === 'cashier').length, [profiles])
  const customerProfilesCount = useMemo(() => profiles.filter((p) => p.role === 'customer').length, [profiles])

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c.full_name])), [customers])
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])

  const auditEvents = useMemo(() => {
    const list = [
      ...payments.map((p) => {
        const staff = profileMap.get(p.collected_by)
        const staffName = staff?.full_name || 'Cashier Staff'
        const initials = staffName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
        return {
          id: `pay-${p.id}`,
          date: p.paid_at,
          type: 'payment',
          action: 'Posted Payment',
          reference: p.or_number || p.reference_no || `PAY-${p.id}`,
          party: customerMap.get(p.customer_id) || 'Consumer Account',
          detail: `${peso(p.amount)} · ${p.method || 'Cash'}`,
          actor: staffName,
          actorRole: staff?.role || 'cashier',
          actorInitials: initials || 'CS',
          status: p.status || 'completed',
        }
      }),
      ...bills.map((b) => {
        const staff = profiles.find((p) => p.role === 'admin')
        const staffName = staff?.full_name || 'Billing Staff'
        const initials = staffName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
        return {
          id: `bill-${b.id}`,
          date: b.created_at,
          type: 'bill',
          action: 'Issued Bill',
          reference: b.bill_no || `BILL-${b.id}`,
          party: customerMap.get(b.customer_id) || 'Consumer Account',
          detail: `${peso(b.amount)} · ${b.billing_month ? monthLabel(b.billing_month) : 'Water Charge'}`,
          actor: staffName,
          actorRole: 'admin',
          actorInitials: initials || 'BS',
          status: b.status || 'issued',
        }
      }),
      ...applications.map((app) => {
        return {
          id: `app-${app.id}`,
          date: app.created_at,
          type: 'application',
          action: 'New Application',
          reference: formatApplicationRef(app.reference_no),
          party: app.applicant_name || 'Walk-In Applicant',
          detail: app.notes || 'Service Request',
          actor: 'Customer Portal',
          actorRole: 'portal',
          actorInitials: 'CP',
          status: app.status || 'submitted',
        }
      }),
    ]
    return list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  }, [payments, bills, applications, profiles, customers, customerMap, profileMap])

  const filteredEvents = useMemo(() => {
    return auditEvents.filter((ev) => {
      if (activityFilter !== 'all' && ev.type !== activityFilter) return false
      if (activitySearch.trim()) {
        const q = activitySearch.toLowerCase()
        const text = `${ev.action} ${ev.reference} ${ev.party} ${ev.actor} ${ev.detail} ${ev.status}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  }, [auditEvents, activityFilter, activitySearch])

  const activityPagination = useTablePagination(filteredEvents, 10, [activitySearch, activityFilter])

  return (
    <div className="page-content users-audit-page">
      <PageHeader title="Users & Audit Logs" description="Find staff accounts and review recent payments, bills, and applications." />
      <Notice type="error">{error}</Notice>
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="audit-summary">
            <div className="panel audit-metric">
              <span className="audit-metric-icon"><Users size={19} aria-hidden="true" /></span>
              <div>
                <span>Staff accounts</span>
                <small>{adminCount} Admin · {cashierCount} Cashier</small>
              </div>
              <strong>{adminCount + cashierCount}</strong>
            </div>
            <div className="panel audit-metric">
              <span className="audit-metric-icon"><UserRound size={19} aria-hidden="true" /></span>
              <div>
                <span>Customer portal accounts</span>
              </div>
              <strong>{customerProfilesCount}</strong>
            </div>
            <div className="panel audit-metric">
              <span className="audit-metric-icon"><Activity size={19} aria-hidden="true" /></span>
              <div>
                <span>Recent system events</span>
              </div>
              <strong>{auditEvents.length}</strong>
            </div>
          </div>

          {/* Toggle Switcher: Display One Table Only at a Time */}
          <div className="audit-toggle-bar">
            <div className="view-switch" role="group" aria-label="Audit view">
              <button
                type="button"
                className={activeTab === 'staff' ? 'active' : ''}
                aria-pressed={activeTab === 'staff'}
                onClick={() => setActiveTab('staff')}
              >
                <Users size={16} aria-hidden="true" /> Staff directory
              </button>
              <button
                type="button"
                className={activeTab === 'activity' ? 'active' : ''}
                aria-pressed={activeTab === 'activity'}
                onClick={() => setActiveTab('activity')}
              >
                <Activity size={16} aria-hidden="true" /> Activity log
              </button>
            </div>
          </div>

          {/* Display One Table/Panel at a Time */}
          {activeTab === 'staff' ? (
            <section className="panel audit-panel audit-panel-full">
              <div className="audit-panel-head">
                <div>
                  <h2 id="audit-staff-title">Staff directory</h2>
                  <p>System administrators and counter cashiers</p>
                </div>
                <span className="audit-count-pill">
                  {staffList.length} staff member{staffList.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="audit-toolbar">
                <div className="audit-search-field">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search staff accounts"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search staff by name, role, email..."
                  />
                </div>
                <div className="mf-segmented-tabs" role="group" aria-label="Filter by staff role">
                  {[
                    ['all', 'All Staff'],
                    ['admin', 'Admin'],
                    ['cashier', 'Cashier'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={roleFilter === val ? 'active' : ''}
                      aria-pressed={roleFilter === val}
                      onClick={() => setRoleFilter(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {staffList.length ? (
                <>
                  <div className="table-scroll audit-table-wrap" tabIndex={0} role="region" aria-labelledby="audit-staff-title">
                    <table className="audit-clean-table staff-directory-table" aria-labelledby="audit-staff-title">
                      <thead>
                        <tr>
                          <th>Account Name</th>
                          <th>System Role</th>
                          <th>Access Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffPagination.visibleRows.map((u) => {
                          const initials = (u.full_name || u.role || 'U')
                            .split(' ')
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()

                          return (
                            <tr key={u.id}>
                              <td>
                                <div className="audit-user-cell">
                                  <span className={`audit-user-avatar role-${u.role}`}>{initials}</span>
                                  <div>
                                    <strong>{u.full_name || (u.role === 'admin' ? 'Administrator' : 'Cashier Staff')}</strong>
                                    <small>{u.email || (u.role === 'admin' ? 'admin@isabelwaters.com' : 'cashier@isabelwaters.com')}</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`audit-role-badge role-${u.role}`}>
                                  {u.role === 'admin' ? 'Administrator' : 'Counter Cashier'}
                                </span>
                              </td>
                              <td>
                                <span className="audit-status-badge">
                                  <i className="status-dot-active" /> Active
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination {...staffPagination} total={staffList.length} />
                </>
              ) : (
                <EmptyState title="No matching accounts" description="Try clearing your search query or role filter." />
              )}
            </section>
          ) : (
            <section className="panel audit-panel audit-panel-full">
              <div className="audit-panel-head">
                <div>
                  <h2 id="audit-activity-title">Activity log</h2>
                  <p>Recent payments, bill issuances, and service applications</p>
                </div>
                <div className="audit-panel-head-tags">
                  <span className="audit-count-pill">
                    {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="audit-toolbar">
                <div className="audit-search-field">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search audit activity"
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    placeholder="Search activity by ref no, customer, staff, or action..."
                  />
                </div>
                <div className="mf-segmented-tabs" role="group" aria-label="Filter by event type">
                  {[
                    ['all', 'All Activities'],
                    ['payment', 'Payments'],
                    ['bill', 'Bills'],
                    ['application', 'Applications'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={activityFilter === val ? 'active' : ''}
                      aria-pressed={activityFilter === val}
                      onClick={() => setActivityFilter(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredEvents.length ? (
                <>
                  <div className="table-scroll audit-table-wrap" tabIndex={0} role="region" aria-labelledby="audit-activity-title">
                    <table className="audit-clean-table activity-log-table" aria-labelledby="audit-activity-title">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Event / Action</th>
                          <th>Reference No.</th>
                          <th>Customer / Account</th>
                          <th>Activity Details</th>
                          <th>Logged By</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityPagination.visibleRows.map((ev) => (
                          <tr key={ev.id}>
                            <td>
                              <div className="activity-timestamp-cell">
                                <strong>{dateLabel(ev.date)}</strong>
                                {timeLabel(ev.date) && <small>{timeLabel(ev.date)}</small>}
                              </div>
                            </td>
                            <td>
                              <span className={`activity-pill activity-${ev.type}`}>
                                {ev.type === 'payment' ? (
                                  <Wallet size={13} />
                                ) : ev.type === 'bill' ? (
                                  <FileSpreadsheet size={13} />
                                ) : (
                                  <ClipboardList size={13} />
                                )}
                                {ev.action}
                              </span>
                            </td>
                            <td>
                              <span className="request-ref-code">{ev.reference}</span>
                            </td>
                            <td>
                              <strong className="activity-party-text">{ev.party}</strong>
                            </td>
                            <td>
                              <span className="activity-detail-text">{ev.detail}</span>
                            </td>
                            <td>
                              <div className="audit-user-cell-compact">
                                <span className={`audit-user-avatar audit-user-avatar-sm role-${ev.actorRole}`}>
                                  {ev.actorInitials}
                                </span>
                                <span className="audit-actor-name">{ev.actor}</span>
                              </div>
                            </td>
                            <td>
                              <span className="audit-status-badge">
                                <i className="status-dot-active" /> Completed
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination {...activityPagination} total={filteredEvents.length} />
                </>
              ) : (
                <EmptyState
                  title="No matching activity events"
                  description="Try clearing your search query or switching event filter tabs."
                />
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function StepSlider({ options, value, onChange, ariaLabel }) {
  const currentIndex = options.findIndex((opt) => String(opt.id) === String(value))
  const activeIdx = currentIndex >= 0 ? currentIndex : 0
  const total = options.length
  const percent = total > 1 ? (activeIdx / (total - 1)) * 100 : 0

  return (
    <div className="step-slider-box" role="radiogroup" aria-label={ariaLabel}>
      <div className="step-slider-track-wrap">
        <div className="step-slider-rail">
          <div className="step-slider-track" />
          <div className="step-slider-progress" style={{ width: `${percent}%` }} />
        </div>
        <div className="step-slider-points">
          {options.map((opt, idx) => {
            const isActive = idx === activeIdx
            const isPassed = idx <= activeIdx
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`step-slider-point ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''}`}
                onClick={() => onChange(opt.id)}
                title={opt.label}
              >
                <span className="step-slider-dot" />
              </button>
            )
          })}
        </div>
      </div>
      <div className="step-slider-labels">
        {options.map((opt, idx) => (
          <button
            key={opt.id}
            type="button"
            className={`step-slider-label-btn ${idx === activeIdx ? 'active' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AdminSettingsView({ data, refresh }) {
  const { user, profile, refreshIdentity } = useAuth()
  const { prefs, updatePreferences, restoreDefaults } = usePreferences()

  // 1. Profile state
  const currentDisplayName =
    prefs.adminDisplayName || profile?.full_name || user?.user_metadata?.full_name || ''
  const [fullName, setFullName] = useState(currentDisplayName)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileNotice, setProfileNotice] = useState('')
  const [profileError, setProfileError] = useState('')

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    if (currentDisplayName) {
      setFullName(currentDisplayName)
    }
  }, [currentDisplayName])

  // 2. Business Info state
  const [businessForm, setBusinessForm] = useState({
    utilityName: prefs.utilityName,
    brandName: prefs.brandName,
    officeUnit: prefs.officeUnit,
    officeAddress: prefs.officeAddress,
    supportPhone: prefs.supportPhone,
    officialEmail: prefs.officialEmail,
    tinNumber: prefs.tinNumber,
    officeHours: prefs.officeHours,
  })
  const [monthlyGoal, setMonthlyGoal] = useState(prefs.monthlyGoal ?? data?.goal ?? 100000)
  const [businessBusy, setBusinessBusy] = useState(false)
  const [businessNotice, setBusinessNotice] = useState('')
  const [businessError, setBusinessError] = useState('')

  // 3. Table & Display state notice
  const [customNotice, setCustomNotice] = useState('')

  const rate = data?.currentRate?.rate_per_m3 ?? 8

  const handleSaveProfile = async (event) => {
    event.preventDefault()
    setProfileError('')
    setProfileNotice('')
    const trimmed = fullName.trim()
    if (!trimmed) {
      setProfileError('Full name cannot be empty.')
      return
    }
    if (!user?.id) {
      setProfileError('No signed-in user session found.')
      return
    }
    setProfileBusy(true)
    try {
      updatePreferences({ adminDisplayName: trimmed })
      await supabase.auth.updateUser({ data: { full_name: trimmed } })
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ full_name: trimmed })
        .eq('id', user.id)
      // Ignore RLS policy denial on profiles since auth user_metadata and preferences store it
      if (updateErr && updateErr.code !== '42501' && !String(updateErr.message || '').includes('row-level security')) {
        throw updateErr
      }
      await refreshIdentity()
      if (refresh) refresh()
      setProfileNotice('Administrator profile updated.')
    } catch (err) {
      setProfileError(errorMessage(err))
    } finally {
      setProfileBusy(false)
    }
  }

  const handleSavePassword = async (event) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordNotice('')
    if (password.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    setPasswordBusy(true)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) throw updateErr
      setPassword('')
      setShowPassword(false)
      setConfirmPassword('')
      setPasswordNotice('Password updated successfully.')
    } catch (err) {
      setPasswordError(errorMessage(err))
    } finally {
      setPasswordBusy(false)
    }
  }

  const handleSaveBusiness = async (event) => {
    event.preventDefault()
    setBusinessError('')
    setBusinessNotice('')
    setBusinessBusy(true)
    try {
      const numericGoal = Number(monthlyGoal)
      const validGoal = Number.isFinite(numericGoal) && numericGoal >= 0 ? numericGoal : 100000
      updatePreferences({ ...businessForm, monthlyGoal: validGoal })

      // Best-effort sync to public.settings if RLS permits admin writes
      const { error: goalErr } = await supabase
        .from('settings')
        .upsert({ key: 'monthly_collection_goal', value: validGoal, updated_at: new Date().toISOString() })
      if (goalErr && goalErr.code !== '42501' && !String(goalErr.message || '').includes('row-level security')) {
        throw goalErr
      }
      if (!goalErr && refresh) refresh()
      setBusinessNotice('Business information and collection target saved.')
    } catch (err) {
      setBusinessError(errorMessage(err))
    } finally {
      setBusinessBusy(false)
    }
  }

  const handleResetCustomization = () => {
    const defaults = restoreDefaults()
    setBusinessForm({
      utilityName: defaults.utilityName,
      brandName: defaults.brandName,
      officeUnit: defaults.officeUnit,
      officeAddress: defaults.officeAddress,
      supportPhone: defaults.supportPhone,
      officialEmail: defaults.officialEmail,
      tinNumber: defaults.tinNumber,
      officeHours: defaults.officeHours,
    })
    setCustomNotice('Display, font size, and table preferences restored to defaults.')
  }

  const [activeTab, setActiveTab] = useState('account')
  const accountName = currentDisplayName || 'Administrator'
  const accountRole = profile?.role === 'admin' || !profile?.role ? 'Admin' : profile.role

  const navItems = [
    { id: 'account', label: 'Account', icon: UserRound },
    { id: 'business', label: 'Business', icon: Building2 },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'display', label: 'Display', icon: Monitor },
    { id: 'printing', label: 'Printing', icon: Printer },
  ]

  return (
    <div className="page-content admin-settings-page">
      <PageHeader
        title="Settings"
        description="Manage your account, business details, and how the app looks and prints."
      />

      <div className="shadcn-settings-layout">
        {/* Left Navigation Sidebar */}
        <nav className="shadcn-settings-nav" aria-label="Settings navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`shadcn-nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'true' : undefined}
            >
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Right Content Area */}
        <div className="shadcn-settings-main">
          {/* TAB 1: ACCOUNT (Merged Profile & Security) */}
          {activeTab === 'account' && (
            <div className="shadcn-tab-pane settings-account-pane">
              <div className="settings-card settings-account-summary">
                <span className="settings-avatar-circle" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
                <div className="settings-account-identity">
                  <strong>{accountName}</strong>
                  <span>{user?.email}</span>
                </div>
                <span className="settings-account-role"><LockKeyhole size={13} aria-hidden="true" /> {accountRole}</span>
              </div>

              <form className="settings-card" onSubmit={handleSaveProfile} aria-labelledby="settings-profile-heading">
                <header className="settings-card-heading">
                  <h2 id="settings-profile-heading">Profile</h2>
                  <p>How you appear to your team.</p>
                </header>
                {(profileError || profileNotice) && (
                  <div className="settings-card-feedback">
                    <Notice type="error" onClose={() => setProfileError('')}>{profileError}</Notice>
                    <Notice type="success" onClose={() => setProfileNotice('')}>{profileNotice}</Notice>
                  </div>
                )}
                <div className="settings-field-row">
                  <div>
                    <label className="shadcn-form-label" htmlFor="settings-username">Display name</label>
                    <p className="shadcn-form-hint" id="settings-name-hint">Shown in audit logs, reports, and staff actions.</p>
                  </div>
                  <input
                    id="settings-username"
                    className="shadcn-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter administrator name"
                    aria-describedby="settings-name-hint"
                    required
                  />
                </div>

                <div className="settings-field-row">
                  <div>
                    <label className="shadcn-form-label" htmlFor="settings-email">Login email</label>
                    <p className="shadcn-form-hint" id="settings-email-hint">Used to sign in.</p>
                  </div>
                  <input
                    id="settings-email"
                    className="shadcn-input readonly"
                    value={user?.email || ''}
                    aria-describedby="settings-email-hint"
                    readOnly
                  />
                </div>

                <div className="settings-field-row">
                  <div>
                    <span className="shadcn-form-label">Role</span>
                    <p className="shadcn-form-hint">Permissions can’t be changed from your profile.</p>
                  </div>
                  <span className="settings-role-value"><LockKeyhole size={15} aria-hidden="true" /> {accountRole}</span>
                </div>

                <div className="settings-card-actions">
                  <button className="shadcn-btn-primary" type="submit" disabled={profileBusy}>
                    {profileBusy ? 'Updating…' : 'Update profile'}
                  </button>
                </div>
              </form>

              <form className="settings-card" onSubmit={handleSavePassword} aria-labelledby="settings-password-heading">
                <header className="settings-card-heading">
                  <h2 id="settings-password-heading">Password</h2>
                  <p>Choose a new password. Leave blank to keep your current one.</p>
                </header>
                {(passwordError || passwordNotice) && (
                  <div className="settings-card-feedback">
                    <Notice type="error" onClose={() => setPasswordError('')}>{passwordError}</Notice>
                    <Notice type="success" onClose={() => setPasswordNotice('')}>{passwordNotice}</Notice>
                  </div>
                )}
                <div className="settings-field-row">
                  <label className="shadcn-form-label" htmlFor="settings-password">New password</label>
                  <div>
                    <div className="settings-password-field">
                      <input
                        id="settings-password"
                        type={showPassword ? 'text' : 'password'}
                        className="shadcn-input"
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        aria-describedby="settings-password-hint"
                        required
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} aria-controls="settings-password">
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="shadcn-form-hint" id="settings-password-hint">Use at least 8 characters. Include letters and numbers for a stronger password.</p>
                  </div>
                </div>

                <div className="settings-field-row">
                  <label className="shadcn-form-label" htmlFor="settings-confirm-password">Confirm password</label>
                  <input
                    id="settings-confirm-password"
                    type="password"
                    className="shadcn-input"
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                  />
                </div>

                <div className="settings-card-actions">
                  <button className="shadcn-btn-primary" type="submit" disabled={passwordBusy}>
                    {passwordBusy ? 'Updating Password…' : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="shadcn-tab-pane">
              <div className="shadcn-section-header">
                <h2 className="shadcn-section-title">Appearance</h2>
                <p className="shadcn-section-desc">Customize the appearance of the app and workspace theme.</p>
              </div>
              <div className="shadcn-divider" />

              <div className="shadcn-form-stack">
                {/* Theme Accent Color */}
                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Theme Accent</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    Select the primary accent color for active items, buttons, and badges.
                  </p>
                  <div className="settings-choice-grid cols-4" role="radiogroup" aria-label="Theme accent color">
                    {[
                      { id: 'navy', label: 'Navy', color: '#172554' },
                      { id: 'ocean', label: 'Ocean', color: '#0284C7' },
                      { id: 'emerald', label: 'Emerald', color: '#059669' },
                      { id: 'slate', label: 'Slate', color: '#334155' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={prefs.themeAccent === opt.id}
                        className={`settings-choice-btn compact ${prefs.themeAccent === opt.id ? 'active' : ''}`}
                        onClick={() => updatePreferences({ themeAccent: opt.id })}
                      >
                        <span className="theme-color-dot" style={{ background: opt.color }} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Navigation Bar Menu Theme */}
                <div className="shadcn-form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="shadcn-form-label" style={{ margin: 0 }}>Navigation Bar Menu Theme</label>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Applied to Admin & Cashier</span>
                  </div>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    Background tone for the persistent left sidebar.
                  </p>
                  <div className="settings-choice-grid cols-5" role="radiogroup" aria-label="Navigation Bar Menu Theme">
                    {[
                      { id: 'navy', label: 'Navy Blue', color: '#0C1729' },
                      { id: 'midnight', label: 'Midnight', color: '#060A12' },
                      { id: 'ocean', label: 'Ocean', color: '#071F36' },
                      { id: 'slate', label: 'Dark Slate', color: '#111827' },
                      { id: 'light', label: 'Classic Light', color: '#F8F9FC', border: true },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={(prefs.sidebarTheme || 'navy') === opt.id}
                        className={`settings-choice-btn compact ${(prefs.sidebarTheme || 'navy') === opt.id ? 'active' : ''}`}
                        onClick={() => updatePreferences({ sidebarTheme: opt.id })}
                        title={`${opt.label} navigation bar theme (Admin & Cashier)`}
                      >
                        <span
                          className="theme-color-dot"
                          style={{
                            background: opt.color,
                            border: opt.border ? '1px solid #CBD5E1' : undefined,
                          }}
                        />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Card Corner Radius */}
                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Card Corners</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    Corner curvature applied to containers and cards.
                  </p>
                  <div className="settings-choice-grid cols-3" role="radiogroup" aria-label="Card radius">
                    {[
                      { id: 'compact', label: 'Sharp (8px)' },
                      { id: 'rounded', label: 'Rounded (16px)' },
                      { id: 'extra', label: 'Pill (24px)' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={prefs.cardRadius === opt.id}
                        className={`settings-choice-btn compact ${prefs.cardRadius === opt.id ? 'active' : ''}`}
                        onClick={() => updatePreferences({ cardRadius: opt.id })}
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Workspace Font Size */}
                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Workspace Font Size</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                    Scale font sizing across all administrative screens.
                  </p>
                  <StepSlider
                    value={prefs.fontSize}
                    onChange={(val) => updatePreferences({ fontSize: val })}
                    options={[
                      { id: 'small', label: 'Small' },
                      { id: 'medium', label: 'Default' },
                      { id: 'large', label: 'Large' },
                      { id: 'xlarge', label: 'Extra Large' },
                    ]}
                    ariaLabel="Workspace Font Size"
                  />
                </div>

                {/* Layout & Accessibility */}
                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Layout & Accessibility</label>
                  <div className="settings-toggle-grid" style={{ marginTop: 8 }}>
                    <label className="settings-toggle-row compact">
                      <span>Compact Sidebar</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.compactSidebar)}
                        onChange={(e) => updatePreferences({ compactSidebar: e.target.checked })}
                      />
                    </label>

                    <label className="settings-toggle-row compact">
                      <span>High Contrast</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.highContrast)}
                        onChange={(e) => updatePreferences({ highContrast: e.target.checked })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DISPLAY */}
          {activeTab === 'display' && (
            <div className="shadcn-tab-pane">
              <div className="shadcn-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 className="shadcn-section-title">Display</h2>
                  <p className="shadcn-section-desc">Turn items on or off to control what's displayed in data tables and ledgers.</p>
                </div>
                <button type="button" className="button button-ghost button-small" onClick={handleResetCustomization}>
                  <RotateCcw size={14} /> Reset Defaults
                </button>
              </div>
              <div className="shadcn-divider" />

              <Notice type="info" onClose={() => setCustomNotice('')}>{customNotice}</Notice>

              <div className="shadcn-form-stack">
                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Table Text Size</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                    Typography scale inside table rows and data cells.
                  </p>
                  <StepSlider
                    value={prefs.tableFontSize}
                    onChange={(val) => updatePreferences({ tableFontSize: val })}
                    options={[
                      { id: 'small', label: 'Compact' },
                      { id: 'medium', label: 'Standard' },
                      { id: 'large', label: 'Large' },
                    ]}
                    ariaLabel="Table Text Size"
                  />
                </div>

                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Row Density</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                    Vertical height and padding between ledger rows.
                  </p>
                  <StepSlider
                    value={prefs.tableDensity}
                    onChange={(val) => updatePreferences({ tableDensity: val })}
                    options={[
                      { id: 'compact', label: 'Compact' },
                      { id: 'comfortable', label: 'Comfortable' },
                      { id: 'spacious', label: 'Spacious' },
                    ]}
                    ariaLabel="Row Density"
                  />
                </div>

                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Table Styles & Behavior</label>
                  <div className="settings-toggle-grid" style={{ marginTop: 8 }}>
                    <label className="settings-toggle-row compact">
                      <span>Zebra Striping</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.stripedRows)}
                        onChange={(e) => updatePreferences({ stripedRows: e.target.checked })}
                      />
                    </label>

                    <label className="settings-toggle-row compact">
                      <span>Cell Borders</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.showCellBorders)}
                        onChange={(e) => updatePreferences({ showCellBorders: e.target.checked })}
                      />
                    </label>

                    <label className="settings-toggle-row compact">
                      <span>Sticky Headers</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.stickyHeaders)}
                        onChange={(e) => updatePreferences({ stickyHeaders: e.target.checked })}
                      />
                    </label>

                    <label className="settings-toggle-row compact">
                      <span>Uppercase Headers</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.uppercaseHeaders)}
                        onChange={(e) => updatePreferences({ uppercaseHeaders: e.target.checked })}
                      />
                    </label>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Live Table Preview</label>
                  <div className="settings-table-preview-wrap compact" style={{ marginTop: 6 }}>
                    <div className="settings-preview-caption">
                      <span>Interactive Preview</span>
                      <span className="settings-preview-pill">
                        {prefs.themeAccent} · {prefs.tableFontSize} text · {prefs.tableDensity} density
                      </span>
                    </div>
                    <div className="table-scroll settings-preview-table-box">
                      <table>
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>CAN</th>
                            <th>Usage</th>
                            <th>Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><strong>Maria Santos</strong></td>
                            <td>720127051</td>
                            <td>14.0 m³</td>
                            <td className="money-cell">{peso(259)}</td>
                            <td><StatusBadge status="paid" /></td>
                          </tr>
                          <tr>
                            <td><strong>Miguel Santos</strong></td>
                            <td>505425093</td>
                            <td>9.6 m³</td>
                            <td className="money-cell">{peso(178)}</td>
                            <td><StatusBadge status="partial" /></td>
                          </tr>
                          <tr>
                            <td><strong>Padluck Orcio</strong></td>
                            <td>414849422</td>
                            <td>10.0 m³</td>
                            <td className="money-cell">{peso(185)}</td>
                            <td><StatusBadge status="paid" /></td>
                          </tr>
                          <TableEmptyRows count={2} colSpan={5} />
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: BUSINESS */}
          {activeTab === 'business' && (
            <div className="shadcn-tab-pane">
              <div className="shadcn-section-header">
                <h2 className="shadcn-section-title">Business Information</h2>
                <p className="shadcn-section-desc">Configure your water utility identity, contact details, tax registration, and billing defaults.</p>
              </div>
              <div className="shadcn-divider" />

              <Notice type="error" onClose={() => setBusinessError('')}>{businessError}</Notice>
              <Notice type="success" onClose={() => setBusinessNotice('')}>{businessNotice}</Notice>

              <form className="shadcn-form-stack" onSubmit={handleSaveBusiness}>
                <div className="form-grid">
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">Legal Utility Name</label>
                    <input
                      className="shadcn-input"
                      value={businessForm.utilityName}
                      onChange={(e) => setBusinessForm({ ...businessForm, utilityName: e.target.value })}
                      required
                    />
                    <p className="shadcn-form-hint">Registered corporate water provider name.</p>
                  </div>
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">Sidebar Brand Title</label>
                    <input
                      className="shadcn-input"
                      value={businessForm.brandName}
                      onChange={(e) => setBusinessForm({ ...businessForm, brandName: e.target.value })}
                      required
                    />
                    <p className="shadcn-form-hint">Displayed in the header and menu title.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">Office / Department Label</label>
                    <input
                      className="shadcn-input"
                      value={businessForm.officeUnit}
                      onChange={(e) => setBusinessForm({ ...businessForm, officeUnit: e.target.value })}
                      required
                    />
                    <p className="shadcn-form-hint">Administrative sub-unit or district office.</p>
                  </div>
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">TIN / Tax Registration</label>
                    <input
                      className="shadcn-input"
                      value={businessForm.tinNumber}
                      onChange={(e) => setBusinessForm({ ...businessForm, tinNumber: e.target.value })}
                    />
                    <p className="shadcn-form-hint">Tax identification printed on receipts.</p>
                  </div>
                </div>

                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Office Address</label>
                  <input
                    className="shadcn-input"
                    value={businessForm.officeAddress}
                    onChange={(e) => setBusinessForm({ ...businessForm, officeAddress: e.target.value })}
                    required
                  />
                  <p className="shadcn-form-hint">Physical counter location for consumer walk-in services.</p>
                </div>

                <div className="form-grid">
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">Support Contact No.</label>
                    <input
                      className="shadcn-input"
                      value={businessForm.supportPhone}
                      onChange={(e) => setBusinessForm({ ...businessForm, supportPhone: e.target.value })}
                    />
                    <p className="shadcn-form-hint">Helpline telephone number.</p>
                  </div>
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">Official Billing Email</label>
                    <input
                      type="email"
                      className="shadcn-input"
                      value={businessForm.officialEmail}
                      onChange={(e) => setBusinessForm({ ...businessForm, officialEmail: e.target.value })}
                    />
                    <p className="shadcn-form-hint">Email address for statements.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">Operating Hours</label>
                    <input
                      className="shadcn-input"
                      value={businessForm.officeHours}
                      onChange={(e) => setBusinessForm({ ...businessForm, officeHours: e.target.value })}
                    />
                    <p className="shadcn-form-hint">Counter schedule printed on statements.</p>
                  </div>
                  <div className="shadcn-form-group">
                    <label className="shadcn-form-label">Monthly Collection Target (₱)</label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className="shadcn-input"
                      value={monthlyGoal}
                      onChange={(e) => setMonthlyGoal(e.target.value)}
                    />
                    <p className="shadcn-form-hint">Benchmark for monitoring progress.</p>
                  </div>
                </div>

                <div className="shadcn-form-actions">
                  <button className="shadcn-btn-primary" type="submit" disabled={businessBusy}>
                    {businessBusy ? 'Saving…' : 'Save business info'}
                  </button>
                </div>
              </form>

              <div className="shadcn-divider" />

              <div className="shadcn-section-header">
                <h3 className="shadcn-section-title" style={{ fontSize: 16 }}>Billing & Statutory Standards</h3>
                <p className="shadcn-section-desc">Active tariff and compliance rules.</p>
              </div>
              <div className="mf-decision-list" style={{ marginTop: 12 }}>
                <div className="mf-decision-item">
                  <div className="mf-decision-body">
                    <strong>Value Added Tax (VAT)</strong>
                    <small>Applied inclusively on all water bills & official receipts</small>
                  </div>
                  <div className="mf-decision-meta"><strong>12% Inclusive</strong></div>
                </div>
                <div className="mf-decision-item">
                  <div className="mf-decision-body">
                    <strong>Active Cubic Meter Rate</strong>
                    <small>
                      {data?.currentRate?.effective_from
                        ? `Standard tariff · Effective ${dateLabel(data.currentRate.effective_from)}`
                        : 'Standard residential & commercial tariff'}
                    </small>
                  </div>
                  <div className="mf-decision-meta">
                    <Link to="/admin/rates" className="button button-outline button-small">
                      {peso(rate)} / m³ →
                    </Link>
                  </div>
                </div>
                <div className="mf-decision-item">
                  <div className="mf-decision-body">
                    <strong>Contract Account Number (CAN)</strong>
                    <small>9-digit numeric identifier format</small>
                  </div>
                  <div className="mf-decision-meta"><strong>9 Digits</strong></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: PRINTING */}
          {activeTab === 'printing' && (
            <div className="shadcn-tab-pane">
              <div className="shadcn-section-header">
                <h2 className="shadcn-section-title">Printing</h2>
                <p className="shadcn-section-desc">Configure bill & receipt paper sizes, copy counts, and automated printing rules.</p>
              </div>
              <div className="shadcn-divider" />

              <div className="shadcn-form-stack">
                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Bill Paper Size</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    Format used when generating printable monthly water statements.
                  </p>
                  <div className="settings-choice-grid cols-2" role="radiogroup" aria-label="Bill paper size">
                    {[
                      { id: 'half', label: 'Half Letter (5.5" × 8.5")' },
                      { id: 'letter', label: 'Letter (8.5" × 11")' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={(prefs.billPaperSize || 'letter') === opt.id}
                        className={`settings-choice-btn compact ${(prefs.billPaperSize || 'letter') === opt.id ? 'active' : ''}`}
                        onClick={() => updatePreferences({ billPaperSize: opt.id })}
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Receipt Paper Size</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    Thermal roll or sheet printer size at the payment counter.
                  </p>
                  <div className="settings-choice-grid cols-3" role="radiogroup" aria-label="Receipt paper size">
                    {[
                      { id: '58mm', label: '58mm Roll' },
                      { id: '80mm', label: '80mm Roll' },
                      { id: 'a4', label: 'A4 / Letter' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={(prefs.receiptPaperSize || '80mm') === opt.id}
                        className={`settings-choice-btn compact ${(prefs.receiptPaperSize || '80mm') === opt.id ? 'active' : ''}`}
                        onClick={() => updatePreferences({ receiptPaperSize: opt.id })}
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Print Copies</label>
                  <p className="shadcn-form-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    Number of receipts produced per counter transaction.
                  </p>
                  <div className="settings-choice-grid cols-3" role="radiogroup" aria-label="Print copies">
                    {[
                      { id: 'office', label: 'Office Copy Only' },
                      { id: 'customer', label: 'Customer Copy Only' },
                      { id: 'both', label: 'Both Copies' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={(prefs.printCopies || 'both') === opt.id}
                        className={`settings-choice-btn compact ${(prefs.printCopies || 'both') === opt.id ? 'active' : ''}`}
                        onClick={() => updatePreferences({ printCopies: opt.id })}
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="shadcn-form-group">
                  <label className="shadcn-form-label">Counter Printing Automation</label>
                  <div className="settings-toggle-grid" style={{ marginTop: 8 }}>
                    <label className="settings-toggle-row compact">
                      <span>Auto-Print on Pay</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.autoPrintOnPay ?? true)}
                        onChange={(e) => updatePreferences({ autoPrintOnPay: e.target.checked })}
                      />
                    </label>

                    <label className="settings-toggle-row compact">
                      <span>Print Utility Logo</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.printUtilityLogo ?? true)}
                        onChange={(e) => updatePreferences({ printUtilityLogo: e.target.checked })}
                      />
                    </label>

                    <label className="settings-toggle-row compact">
                      <span>Cashier Signature</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.printCashierSignature ?? true)}
                        onChange={(e) => updatePreferences({ printCashierSignature: e.target.checked })}
                      />
                    </label>

                    <label className="settings-toggle-row compact">
                      <span>Auto-Clear Queue</span>
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={Boolean(prefs.autoClearQueue ?? false)}
                        onChange={(e) => updatePreferences({ autoClearQueue: e.target.checked })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
