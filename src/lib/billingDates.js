export function addDays(date, count) {
  const value=new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate()+count)
  return value.toISOString().slice(0,10)
}
export function billingDates(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return {period_start:'',period_end:'',due_date:''}
  const [year,m]=month.split('-').map(Number)
  const end=new Date(Date.UTC(year,m,0,12)).toISOString().slice(0,10)
  return {period_start:`${month}-01`,period_end:end,due_date:addDays(end,10)}
}
export function previousMonth(today){const d=new Date(`${today.slice(0,7)}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)}
export function validateBillingDates({month,period_start,period_end,due_date},historical,today){
  if(!billingDates(month).period_start)return 'Select a valid billing month.'
  if(historical ? month>=today.slice(0,7) : month<today.slice(0,7))return historical?'Past SOAs must use a previous month.':'New SOAs cannot use a past billing month.'
  if(!period_start||!period_end||!due_date)return 'Complete the billing period and due date.'
  if(period_end<period_start)return 'Period end cannot be before period start.'
  if(due_date<period_end)return 'Due date cannot be before the billing period ends.'
  return ''
}
