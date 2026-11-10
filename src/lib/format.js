export const peso = (value = 0) => new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
}).format(Number(value) || 0)

export const vatBreakdown = (grossAmount = 0) => {
  const gross = Math.max(0, Number(grossAmount) || 0)
  const vatableSale = Math.round((gross / 1.12) * 100) / 100
  const vatAmount = Math.round((gross - vatableSale) * 100) / 100
  return { gross, vatableSale, vatAmount }
}

export const dateLabel = (value) => {
  if (!value) return '—'
  const timestamp = String(value).includes('T')
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: timestamp ? 'Asia/Manila' : 'UTC',
  }).format(timestamp ? new Date(value) : new Date(`${String(value).slice(0, 10)}T12:00:00Z`))
}

export const monthLabel = (value) => value
  ? new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`))
  : '—'

export const dateISOManila = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export const todayISO = () => dateISOManila()

export const billStatus = (bill) => {
  if (!bill) return 'Unknown'
  if (bill.status === 'pending' || bill.water_used == null || bill.amount == null) return 'Pending'
  if (Number(bill.balance) <= 0) return 'Paid'
  if (bill.due_date < todayISO()) return 'Overdue'
  if (Number(bill.amount_paid) > 0) return 'Partial'
  return 'Unpaid'
}

export const errorMessage = (error) => {
  if (!error) return 'Something went wrong. Please try again.'
  if (error.code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(error.message || ''))
    return 'Supabase has reached its confirmation email limit. Please try again after the limit resets, or ask the administrator to configure custom SMTP for reliable registration emails.'
  if (error.code === 'email_address_not_authorized')
    return 'Supabase cannot send to this address with its default email service. Ask the administrator to configure custom SMTP.'
  if (error.code === '23505') return 'This value is already in use. Check the meter number or billing month.'
  return error.message || String(error)
}

export const formatApplicationRef = (ref) => {
  if (!ref) return '—'
  if (ref.startsWith('IW-NSA-')) {
    return 'NA-' + ref.slice(7, 13)
  }
  return ref
}


