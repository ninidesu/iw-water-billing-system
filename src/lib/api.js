import { supabase } from './supabaseClient.js'
import { todayISO } from './format.js'

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

async function fetchAll(table, columns = '*') {
  const rows = []
  let afterId = null
  while (true) {
    let query = supabase.from(table).select(columns).order('id', { ascending: true }).limit(1000)
    if (afterId) query = query.gt('id', afterId)
    const page = unwrap(await query)
    rows.push(...page)
    if (page.length < 1000) return rows
    afterId = page[page.length - 1].id
  }
}

export async function getCurrentRate() {
  const tier = await supabase
    .from('rate_tiers')
    .select('rate_per_m3,effective_from')
    .eq('is_active', true)
    .lte('effective_from', todayISO())
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tier.data) return tier.data
  return unwrap(await supabase.from('water_rates').select('rate_per_m3,effective_from')
    .lte('effective_from', todayISO()).order('effective_from', { ascending: false }).limit(1).maybeSingle())
}

export async function getAdminData() {
  const accountColumns = 'id,can,legacy_customer_id,account_name,installation_reading,property_type'
  const accountResult = await supabase.from('contract_accounts').select(accountColumns)
  const loadedAccounts = accountResult.error?.code === '42703'
    ? unwrap(await supabase.from('contract_accounts').select('id,can,legacy_customer_id,account_name'))
    : unwrap(accountResult)
  const [customerRows, profiles, billRows, paymentRows, goalResult, accounts, contacts, applications, casesResult, rateResult] = await Promise.all([
    fetchAll('customers'),
    fetchAll('profiles', 'id,full_name,role'),
    fetchAll('bills'),
    fetchAll('payments'),
    supabase.from('settings').select('value').eq('key', 'monthly_collection_goal').maybeSingle(),
    Promise.resolve(loadedAccounts),
    supabase.from('account_contacts').select('account_id,phone,email').then(unwrap),
    fetchAll('service_applications', 'id,reference_no,applicant_name,linked_account_id,contact_no,contact_email,notes,status,created_at'),
    supabase.from('service_cases').select('id,reference_no,requester_name,case_type,status,created_at'),
    supabase
      .from('rate_tiers')
      .select('rate_per_m3,effective_from')
      .eq('is_active', true)
      .lte('effective_from', todayISO())
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((res) => (res.data ? res : supabase.from('water_rates').select('rate_per_m3,effective_from').lte('effective_from', todayISO()).order('effective_from', { ascending: false }).limit(1).maybeSingle())),
  ])
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const migrationResult = await supabase.from('customer_migrations').select('*')
  const migrated = new Map((migrationResult.data || []).map(row => [row.customer_id,row]))
  const accountsByCustomer = new Map(accounts.map(a=>[a.legacy_customer_id,a]))
  const contactsByAccount = new Map(contacts.map(contact=>[contact.account_id,contact]))
  const applicationsByAccount = new Map(applications.filter(application=>application.linked_account_id).map(application=>[application.linked_account_id,application]))
  const customers = customerRows
    .filter((customer) => !profileMap.has(customer.id) || profileMap.get(customer.id).role === 'customer')
    .map((customer) => {
      const account = accountsByCustomer.get(customer.id)
      const contact = contactsByAccount.get(account?.id)
      const application = applicationsByAccount.get(account?.id)
      const migration = migrated.get(customer.id)
      return { ...customer, account_id: account?.id || null, can: account?.can || null, full_name: account?.account_name || profileMap.get(customer.id)?.full_name || 'Unnamed customer', initial_reading: account?.installation_reading, mobile_no: contact?.phone || application?.contact_no || customer.contact_no || null, email: contact?.email || application?.contact_email || null, property_type: account?.property_type || migration?.property_type || application?.notes || null }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]))
  const bills = billRows.map((bill) => ({ ...bill, customer: customerMap.get(bill.customer_id) || null }))
    .sort((a, b) => b.billing_month.localeCompare(a.billing_month) || b.created_at.localeCompare(a.created_at))
  return {
    customers,
    bills,
    profiles,
    payments: paymentRows.sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
    goal: Number(unwrap(goalResult)?.value || 0),
    applications,
    cases: casesResult.data || [],
    currentRate: rateResult.data || null,
  }
}

export async function getOwnBills(accountId) {
  if (!accountId) return []
  return unwrap(await supabase.from('bills').select('*').eq('account_id', accountId).order('billing_month', { ascending: false }))
}

export async function getOwnPayments(accountId) {
  if (!accountId) return []
  return unwrap(await supabase.from('payments')
    .select('id,paid_at,amount,method,reference_no,status,bill:bills!inner(bill_no,billing_month,account_id)')
    .eq('bill.account_id', accountId).eq('status', 'valid').order('paid_at', { ascending: false }))
}

export async function getPrintableBill(id) {
  const bill = unwrap(await supabase.from('bills').select('*').eq('id', id).single())
  const [customerResult, itemsResult] = await Promise.all([
    supabase.from('contract_accounts').select('full_name:account_name,address:service_address,meter_no,can').eq('id', bill.account_id).single(),
    supabase.from('bill_items').select('*').eq('bill_id', id).order('id'),
  ])
  return { ...bill, items: unwrap(itemsResult), customer: unwrap(customerResult) }
}
