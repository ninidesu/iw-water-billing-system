import { useState } from 'react'
import { Search } from 'lucide-react'

export default function SearchSuggest({ id, value, onChange, placeholder, label = 'Search', suggestions = [] }) {
  const [open, setOpen] = useState(false)
  const visible = open && value.trim()
  const choose = (item) => { onChange(item.value); setOpen(false) }
  return <div className="table-search-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <label className="search-field"><Search size={17} /><span className="sr-only">{label}</span><input value={value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true) }} placeholder={placeholder} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={`${id}-results`} /></label>
    {visible && <div className="customer-search-dropdown table-search-dropdown" id={`${id}-results`} role="listbox">
      {suggestions.length ? suggestions.slice(0, 8).map((item) => <button type="button" role="option" aria-selected="false" key={item.key} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
        <span className="customer-result-avatar">{item.primary?.slice(0, 1).toUpperCase() || '—'}</span><span className="customer-dropdown-identity"><strong>{item.primary}</strong><small>{item.secondary}</small></span>{item.status && <span className="search-suggestion-status">{item.status}</span>}
      </button>) : <div className="customer-dropdown-empty"><Search size={18} /><span><strong>No matches found</strong><small>Try another search.</small></span></div>}
    </div>}
  </div>
}
