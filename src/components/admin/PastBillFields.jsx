import { useState } from 'react'
import { billingDates, addDays, previousMonth } from '../../lib/billingDates.js'
import { todayISO, peso } from '../../lib/format.js'

export default function PastBillFields(){
  const [month,setMonth]=useState(''),[dates,setDates]=useState(billingDates('')),[dueEdited,setDueEdited]=useState(false)
  const [previous,setPrevious]=useState(''),[current,setCurrent]=useState(''),[amount,setAmount]=useState('')
  const [billDate,setBillDate]=useState('')
  const invalid=previous!==''&&current!==''&&Number(current)<Number(previous)
  const changeMonth=value=>{const defaults=billingDates(value);setMonth(value);setDates(defaults);setBillDate(defaults.period_end);setDueEdited(false)}
  return <>
    <label>Original Bill No. (optional)<input name="number"/></label>
    <label>Billing Month<input name="month" type="month" required max={previousMonth(todayISO())} value={month} onChange={e=>changeMonth(e.target.value)}/></label>
    <label>Period Start<input name="period_start" type="date" required value={dates.period_start} onChange={e=>setDates({...dates,period_start:e.target.value})}/></label>
    <label>Period End<input name="period_end" type="date" required min={dates.period_start} value={dates.period_end} onChange={e=>{const end=e.target.value;setDates({...dates,period_end:end,...(!dueEdited&&end?{due_date:addDays(end,10)}:{})})}}/></label>
    <label>Original Bill Date<input name="date" type="date" required max={todayISO()} value={billDate} onChange={e=>setBillDate(e.target.value)}/></label>
    <label>Due Date<input name="due" type="date" required min={dates.period_end} value={dates.due_date} onChange={e=>{setDueEdited(true);setDates({...dates,due_date:e.target.value})}}/></label>
    <button className="link-button span-2" type="button" onClick={()=>changeMonth(month)} disabled={!month}>Reset dates</button>
    <label>Previous Reading (m³)<input name="previous" type="number" required min="0" step="0.01" value={previous} onChange={e=>setPrevious(e.target.value)}/></label>
    <label>Current Reading (m³)<input name="current" type="number" required min={previous||0} step="0.01" value={current} onChange={e=>setCurrent(e.target.value)}/></label>
    <label className="span-2">Original Total Water Charge (PHP)<input name="amount" type="number" required min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <div className="past-bill-preview span-2" aria-live="polite"><div><span>Usage</span><strong>{invalid?'Invalid readings':previous===''||current===''?'—':`${(Number(current)-Number(previous)).toFixed(2)} m³`}</strong></div><div><span>Original amount due</span><strong>{amount===''?'—':peso(amount)}</strong></div></div>
    {invalid&&<p className="span-2" role="alert">Current reading must be at least the previous reading.</p>}
    <p className="span-2 muted">Enter the total charge from the original bill, not a rate per m³. Record past payments separately.</p>
  </>
}
