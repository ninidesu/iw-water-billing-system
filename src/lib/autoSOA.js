import { supabase } from './supabaseClient.js'
import { todayISO } from './format.js'

/**
 * Determines if today is within the end-of-month SOA generation window (28th-31st).
 */
export function isEndOfMonthWindow(dateString = todayISO()) {
  const date = new Date(`${dateString}T12:00:00Z`)
  const day = date.getUTCDate()
  // Check if today is 28 or later, or if tomorrow is the 1st of the next month
  const tomorrow = new Date(date)
  tomorrow.setUTCDate(day + 1)
  return day >= 28 || tomorrow.getUTCDate() === 1
}

/**
 * Calculates the current Manila billing month (YYYY-MM-01).
 */
export function getCurrentBillingMonth(dateString = todayISO()) {
  return `${dateString.slice(0, 7)}-01`
}

/**
 * Triggers the automatic generation of pending SOAs for all active customers.
 * Uses the Supabase RPC function `generate_monthly_pending_soas`, falling back
 * to direct client-side generation if the migration hasn't been executed yet.
 */
export async function ensureMonthlyPendingSOAs(targetMonth = getCurrentBillingMonth()) {
  try {
    // 1. Try server RPC function
    const { data, error } = await supabase.rpc('generate_monthly_pending_soas', {
      p_target_month: targetMonth,
    })

    if (!error) {
      const generated = Array.isArray(data) ? data[0]?.generated_count : data?.generated_count
      return { success: true, count: generated ?? 0, month: targetMonth }
    }

    // 2. If RPC is not available (PGRST202), execute client-side fail-safe
    if (error.code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('does not exist')) {
      return await clientFallbackGenerateSOAs(targetMonth)
    }

    throw error
  } catch (err) {
    console.warn('Auto SOA generation notice:', err.message || err)
    return { success: false, error: err.message, count: 0 }
  }
}

/**
 * Client-side fail-safe generator for environments where migration has not run.
 */
async function clientFallbackGenerateSOAs(targetMonth) {
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, full_name, initial_reading, status')
    .eq('status', 'active')

  if (custErr || !customers?.length) return { success: false, count: 0 }

  const { data: existingBills, error: billsErr } = await supabase
    .from('bills')
    .select('customer_id, billing_month')
    .eq('billing_month', targetMonth)

  if (billsErr) return { success: false, count: 0 }

  const existingCustomerIds = new Set((existingBills || []).map((b) => b.customer_id))
  const missingCustomers = customers.filter((c) => !existingCustomerIds.has(c.id))

  if (!missingCustomers.length) return { success: true, count: 0, month: targetMonth }

  let count = 0
  const today = todayISO()
  const dueDate = new Date(`${today}T12:00:00Z`)
  dueDate.setUTCDate(dueDate.getUTCDate() + 14)
  const dueISO = dueDate.toISOString().slice(0, 10)

  for (const cust of missingCustomers) {
    // Find latest previous reading from prior bills
    const { data: priorBills } = await supabase
      .from('bills')
      .select('current_reading, balance, status')
      .eq('customer_id', cust.id)
      .not('current_reading', 'is', null)
      .lt('billing_month', targetMonth)
      .order('billing_month', { ascending: false })
      .limit(1)

    const prevReading = priorBills?.[0]?.current_reading ?? cust.initial_reading ?? 0

    // Calculate carryover balance
    const { data: openBills } = await supabase
      .from('bills')
      .select('balance')
      .eq('customer_id', cust.id)
      .gt('balance', 0)
      .in('status', ['unpaid', 'partial'])

    const priorBalance = (openBills || []).reduce((sum, b) => sum + Number(b.balance || 0), 0)

    const { error: insertErr } = await supabase.from('bills').insert({
      customer_id: cust.id,
      billing_month: targetMonth,
      bill_date: today,
      due_date: dueISO,
      previous_reading: prevReading,
      current_reading: null,
      water_used: null,
      rate_per_m3: 0,
      amount: null,
      amount_paid: 0,
      balance: priorBalance,
      status: 'pending',
      previous_balance: priorBalance,
      total_amount: null,
      usage_m3: null,
    })

    if (!insertErr) count++
  }

  return { success: true, count, month: targetMonth }
}
