import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CreditCard,
  Droplets,
  FileText,
  ClipboardList,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  Settings2,
  Sun,
  SlidersHorizontal,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { usePreferences } from '../lib/preferences.js'
import { supabase } from '../lib/supabaseClient.js'
import './staff-theme.css'

const adminSections = [
  {
    id: 'overview',
    links: [
      { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    links: [
      { to: '/admin/collections', label: 'Payment Counter', icon: Wallet },
      { to: '/admin/billing', label: 'Statements of Account (SOA)', icon: FileText },
      { to: '/admin/customers', label: 'Customer Accounts', icon: Users },
      { to: '/admin/delinquent', label: 'Overdue Accounts', icon: AlertTriangle, badgeKey: 'delinquent' },
    ],
  },
  {
    id: 'consumer-services',
    title: 'Consumer Services',
    links: [
      { to: '/admin/service-requests', label: 'Service Applications', icon: ClipboardList, badgeKey: 'applications' },
      { to: '/admin/concerns', label: 'Concerns & Complaints', icon: AlertTriangle, badgeKey: 'concerns' },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    links: [
      { to: '/admin/rates', label: 'Rates & Charges', icon: SlidersHorizontal },
      { to: '/admin/users-audit', label: 'Users & Audit Logs', icon: Users },
      { to: '/admin/settings', label: 'Settings', icon: Settings2 },
    ],
  },
]

const cashierSections = [
  {
    id: 'overview',
    links: [
      { to: '/cashier', label: 'Overview', icon: BarChart3, end: true },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    links: [
      { to: '/cashier/collection', label: 'Payment Counter', icon: Wallet },
      { to: '/cashier/billing', label: 'Statements of Account (SOA)', icon: FileText },
      { to: '/cashier/customers', label: 'Customer Accounts', icon: Users },
    ],
  },
  {
    id: 'consumer-services',
    title: 'Consumer Services',
    links: [
      { to: '/cashier/service-requests', label: 'Service Applications', icon: ClipboardList, badgeKey: 'applications' },
      { to: '/cashier/concerns', label: 'Concerns & Complaints', icon: AlertTriangle, badgeKey: 'concerns' },
    ],
  },
]

const customerSections = [
  {
    id: 'portal',
    links: [
      { to: '/customer/dashboard', label: 'My Dashboard', icon: BarChart3, end: true },
      { to: '/customer/bills', label: 'My Bills', icon: FileText },
      { to: '/customer/payments', label: 'Payment History', icon: CreditCard },
      { to: '/customer/profile', label: 'Profile', icon: Settings2 },
    ],
  },
]

export default function Sidebar({ area }) {
  const { signOut } = useAuth()
  const { prefs, updatePreferences } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [badges, setBadges] = useState({})
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('iw_overview_theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  const [themeAnimating, setThemeAnimating] = useState(false)

  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode'
  const ThemeIcon = theme === 'dark' ? Sun : Moon

  async function toggleTheme(event) {
    if (themeAnimating) return
    const next = theme === 'dark' ? 'light' : 'dark'
    const applyTheme = () => {
      setTheme(next)
      try { localStorage.setItem('iw_overview_theme', next) } catch {}
    }
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme()
      return
    }

    const button = event.currentTarget.getBoundingClientRect()
    const x = button.left + button.width / 2
    const y = button.top + button.height / 2
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    setThemeAnimating(true)
    const transition = document.startViewTransition(() => flushSync(applyTheme))
    try {
      await transition.ready
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 420, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
      )
      await transition.finished
    } catch {
      // A navigation or resize can skip the animation.
    } finally {
      setThemeAnimating(false)
    }
  }

  const isMinimized = Boolean(prefs.compactSidebar)
  const sidebarTheme = prefs.sidebarTheme || 'navy'
  const sections = area === 'admin' ? adminSections : area === 'cashier' ? cashierSections : customerSections

  const toggleSection = (id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Ensure active route section is automatically open
  useEffect(() => {
    sections.forEach((sec) => {
      if (
        sec.links?.some(
          (l) =>
            location.pathname === l.to ||
            (l.to !== '/admin' && l.to !== '/cashier' && location.pathname.startsWith(l.to))
        )
      ) {
        setCollapsed((prev) => (prev[sec.id] ? { ...prev, [sec.id]: false } : prev))
      }
    })
  }, [location.pathname])

  useEffect(() => {
    let active = true
    async function loadCounts() {
      try {
        const [appRes, caseRes, delinqRes] = await Promise.allSettled([
          supabase
            .from('service_requests')
            .select('id', { count: 'exact', head: true })
            .eq('queue', 'service_applications')
            .in('status', ['received', 'requirements_pending']),
          supabase
            .from('service_requests')
            .select('id', { count: 'exact', head: true })
            .eq('queue', 'service_cases')
            .in('status', ['received', 'triage']),
          supabase
            .from('contract_accounts')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'delinquent'),
        ])
        if (!active) return
        const appCount = appRes.status === 'fulfilled' && appRes.value?.count ? appRes.value.count : null
        const caseCount = caseRes.status === 'fulfilled' && caseRes.value?.count ? caseRes.value.count : null
        const delinqCount = delinqRes.status === 'fulfilled' && delinqRes.value?.count ? delinqRes.value.count : null
        const totalReq = (appCount || 0) + (caseCount || 0)
        setBadges({
          applications: appCount,
          concerns: caseCount,
          delinquent: delinqCount,
          cashierRequests: totalReq > 0 ? totalReq : null,
        })
      } catch {
        // quiet fallback
      }
    }
    loadCounts()
    return () => {
      active = false
    }
  }, [area])

  const logout = async () => {
    await signOut()
    navigate(area === 'customer' ? '/login' : '/portal', { replace: true })
  }

  const brandTitle = prefs.brandName || 'ISABEL WATERS'
  const brandSub = area === 'customer' ? 'Customer Portal' : area === 'admin' ? (prefs.officeUnit || 'Admin Office') : 'Cashier Counter'

  return (
    <div
      className={`app-shell ${area === 'customer' ? 'customer-shell' : 'staff-shell admin-workspace-shell'}`}
      data-font-size={area !== 'customer' ? prefs.fontSize : undefined}
      data-table-font={area !== 'customer' ? prefs.tableFontSize : undefined}
      data-table-density={area !== 'customer' ? prefs.tableDensity : undefined}
      data-table-striped={area !== 'customer' && prefs.stripedRows ? 'true' : undefined}
      data-table-borders={area !== 'customer' && prefs.showCellBorders ? 'true' : undefined}
      data-table-sticky={area !== 'customer' && prefs.stickyHeaders ? 'true' : undefined}
      data-table-uppercase={area !== 'customer' && prefs.uppercaseHeaders ? 'true' : undefined}
      data-theme-accent={area !== 'customer' ? prefs.themeAccent : undefined}
      data-staff-theme={area !== 'customer' ? theme : undefined}
      data-card-radius={area !== 'customer' ? prefs.cardRadius : undefined}
      data-high-contrast={area !== 'customer' && prefs.highContrast ? 'true' : undefined}
      data-compact-sidebar={area !== 'customer' && isMinimized ? 'true' : undefined}
      data-sidebar-theme={area !== 'customer' ? sidebarTheme : undefined}
    >
      <button
        className="mobile-menu button button-ghost"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close navigation' : 'Open navigation'}
      >
        {open ? <X /> : <Menu />} <span>Menu</span>
      </button>

      {open && <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}

      <aside
        className={`sidebar ${open ? 'sidebar-open' : ''} ${isMinimized ? 'sidebar-minimized' : ''}`}
        data-sidebar-theme={area !== 'customer' ? sidebarTheme : undefined}
      >
        <div className="brand">
          <div className="brand-info">
            <span className="brand-icon" title={brandTitle}>
              <Droplets size={20} />
            </span>
            {!isMinimized && (
              <div className="brand-titles">
                <strong>{brandTitle}</strong>
                <small>{brandSub}</small>
              </div>
            )}
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => updatePreferences({ compactSidebar: !isMinimized })}
            title={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-label={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
          >
            <PanelLeft size={17} />
          </button>
        </div>

        <div className="sidebar-divider" />

        <nav aria-label="Main navigation" className="sidebar-nav-scroll">
          {sections.map((sec) => (
            <div key={sec.id} className="sidebar-section-group">
              {sec.title && !isMinimized && (
                <div className={`sidebar-section-header ${collapsed[sec.id] ? 'collapsed' : ''}`}>
                  <button
                    type="button"
                    onClick={() => toggleSection(sec.id)}
                    aria-expanded={!collapsed[sec.id]}
                    className="sidebar-section-btn"
                  >
                    <span>{sec.title}</span>
                    <ChevronDown size={14} className="section-chevron" />
                  </button>
                </div>
              )}
              {(!collapsed[sec.id] || isMinimized) && (
                <div className={`sidebar-section-links ${sec.title ? 'nested-section-links' : 'top-level-links'}`}>
                  {sec.links.map(({ to, label, icon: Icon, end, badgeKey }) => {
                    const badgeVal = badgeKey ? badges[badgeKey] : null
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        title={isMinimized ? label : undefined}
                        data-tooltip={label}
                      >
                        <span className="nav-icon-wrap">
                          <Icon size={19} strokeWidth={2} />
                        </span>
                        <span className="nav-label">{label}</span>
                        {badgeVal ? <span className="nav-badge">{badgeVal}</span> : null}
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {area !== 'customer' && (
            <div className="sidebar-bottom staff-theme-footer">
              <button
                type="button"
                className="staff-theme-toggle"
                onClick={toggleTheme}
                aria-label={themeLabel}
                aria-disabled={themeAnimating}
                title={themeLabel}
              >
                <span className="staff-theme-icon"><ThemeIcon size={18} aria-hidden="true" /></span>
                {!isMinimized && <span>{themeLabel}</span>}
              </button>
            </div>
        )}

        {area === 'customer' && (
          <div className="sidebar-bottom">
            <button
              className="nav-item logout"
              onClick={logout}
              title={isMinimized ? 'Sign Out' : undefined}
              data-tooltip="Sign Out"
            >
              <span className="nav-icon-wrap">
                <LogOut size={19} strokeWidth={2} />
              </span>
              <span className="nav-label">Sign Out</span>
            </button>
          </div>
        )}
      </aside>

      <main key={location.pathname} className={`app-main ${area !== 'customer' ? 'staff-route-enter' : ''}`}>
        <Outlet />
      </main>
    </div>
  )
}
