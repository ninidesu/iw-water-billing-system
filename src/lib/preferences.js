import { useEffect, useState } from 'react'

const STORAGE_KEY = 'iw_admin_preferences_v1'
const EVENT_NAME = 'iw-preferences-updated'

export const DEFAULT_PREFERENCES = {
  // Profile override fallback
  adminDisplayName: '',

  // Business Info
  utilityName: 'Isabel Water District',
  brandName: 'ISABEL WATERS',
  officeUnit: 'Admin Office',
  officeAddress: 'Municipal Compound, Isabel, Leyte',
  supportPhone: '(053) 555-0142',
  officialEmail: 'billing@isabelwaters.gov.ph',
  tinNumber: '000-418-291-000 VAT',
  officeHours: 'Mon – Fri, 8:00 AM – 5:00 PM',
  monthlyGoal: 100000,

  // Table & Display Customization
  fontSize: 'medium', // 'small' | 'medium' | 'large' | 'xlarge'
  tableFontSize: 'medium', // 'small' | 'medium' | 'large'
  defaultPageSize: 10,
  tableDensity: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
  stripedRows: false,
  showCellBorders: false,
  stickyHeaders: true,
  uppercaseHeaders: false,

  // Interface & Workspace Theme Customization
  themeAccent: 'navy', // 'navy' | 'ocean' | 'emerald' | 'slate'
  sidebarTheme: 'navy', // 'navy' (Deep Navy) | 'midnight' (Midnight Dark) | 'ocean' (Ocean Blue) | 'slate' (Dark Slate) | 'light' (Classic Light)
  cardRadius: 'rounded', // 'compact' | 'rounded' | 'extra'
  dateFormat: 'standard', // 'standard' (Nov 10, 2026) | 'iso' (2026-11-10) | 'slash' (10/11/2026)
  compactSidebar: false,
  highContrast: false,

  // Print & Receipt Customization
  billPaperSize: 'letter', // 'half' (5.5" x 8.5") | 'letter' (8.5" x 11")
  receiptPaperSize: '80mm', // '58mm' | '80mm' | 'a4'
  printCopies: 'both', // 'office' | 'customer' | 'both'
  autoPrintOnPay: true,
  printUtilityLogo: true,
  printCashierSignature: true,
  autoClearQueue: false,
}

export function getPreferences() {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(patch) {
  const next = { ...getPreferences(), ...patch }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
    } catch {
      // Ignore storage quota errors
    }
  }
  return next
}

export function resetPreferences() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: DEFAULT_PREFERENCES }))
    } catch {
      // Ignore storage errors
    }
  }
  return DEFAULT_PREFERENCES
}

export function usePreferences() {
  const [prefs, setPrefs] = useState(() => getPreferences())

  useEffect(() => {
    const handleUpdate = (event) => {
      setPrefs(event?.detail ? { ...DEFAULT_PREFERENCES, ...event.detail } : getPreferences())
    }
    window.addEventListener(EVENT_NAME, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const updatePreferences = (patch) => {
    const next = savePreferences(patch)
    setPrefs(next)
    return next
  }

  const restoreDefaults = () => {
    const next = resetPreferences()
    setPrefs(next)
    return next
  }

  return { prefs, updatePreferences, restoreDefaults }
}
