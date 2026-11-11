import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

function getInitials(name, email) {
  if (name && typeof name === 'string' && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email && typeof email === 'string') {
    const userPart = email.split('@')[0]
    const parts = userPart.split(/[._-]/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return userPart.slice(0, 2).toUpperCase()
  }
  return 'AD'
}

export default function UserMenu() {
  const { user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin = location.pathname.startsWith('/admin')

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split('@')[0] : 'admin')

  const email = user?.email || profile?.email || ''
  const initials = getInitials(profile?.full_name || user?.user_metadata?.full_name, email)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
    navigate('/portal', { replace: true })
  }

  return (
    <div className="admin-profile-container" ref={menuRef}>
      {/* Profile Trigger Pill: Avatar + Name + Email + Down Arrow */}
      <button
        type="button"
        className={`admin-profile-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        title={`${displayName}${email ? ` (${email})` : ''}`}
      >
        <div className="admin-profile-left">
          <span className="admin-profile-avatar">{initials}</span>
          <div className="admin-profile-meta">
            <span className="admin-profile-name">{displayName}</span>
            {email && <span className="admin-profile-email">{email}</span>}
          </div>
        </div>
        <ChevronDown size={14} className={`admin-profile-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>

      {/* Dropdown Menu Card */}
      {open && (
        <div className="admin-profile-dropdown" role="menu">
          <div className="admin-dropdown-header">
            <strong className="admin-dropdown-name">{displayName}</strong>
            {email && <span className="admin-dropdown-email">{email}</span>}
          </div>

          <div className="admin-dropdown-divider" />

          <div className="admin-dropdown-group">
            <Link
              to={isAdmin ? '/admin/settings' : '/cashier'}
              className="admin-dropdown-item"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span>Profile</span>
              <span className="admin-dropdown-shortcut">⇧⌘P</span>
            </Link>

            <Link
              to={isAdmin ? '/admin/billing?mode=new' : '/cashier/billing?mode=new'}
              className="admin-dropdown-item"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span>New Bill</span>
            </Link>
          </div>

          <div className="admin-dropdown-divider" />

          <div className="admin-dropdown-group">
            <button
              type="button"
              className="admin-dropdown-item admin-dropdown-logout"
              onClick={handleSignOut}
              role="menuitem"
            >
              <span>Sign out</span>
              <span className="admin-dropdown-shortcut admin-logout-shortcut">⇧⌘Q</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
