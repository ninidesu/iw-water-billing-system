import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { dateLabel, peso } from '../../lib/format.js'
import './account-record-details.css'

const time = value => value ? new Date(value).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',second:'2-digit',timeZone:'Asia/Manila'}) + ' PHT' : 'Not recorded'
const display = value => value == null || value === '' ? 'Not recorded' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const labels = {name:'Full name',account_name:'Full name',full_name:'Full name',mobile:'Mobile number',phone:'Mobile number',email:'Email',address:'Service address',service_address:'Service address',type:'Property type',property_type:'Property type',number:'Original number',month:'Billing month',date:'Original date',due:'Due date',previous:'Previous reading',current:'Current reading',amount:'Amount (PHP)',method:'Payment method',bill:'Bill ID'}
export function activityTitle(row) { return {profile:'Customer information updated',bill:'Historical bill added',payment:'Historical payment added'}[row?.action] || row?.action || 'Account activity' }

function Field({label,children,wide=false}) { return <div className={wide?'record-detail-wide':''}><dt>{label}</dt><dd>{children ?? 'Not recorded'}</dd></div> }
export default function AccountRecordDetails({payment,activity,base,bills=[],showReceiptHeading=false}) {
  const actor = payment?.collected_by || activity?.actor
  const [staff,setStaff] = useState(null)
  const [allocations,setAllocations] = useState([])
  const [allocationError,setAllocationError] = useState('')
  useEffect(()=>{
    let live=true; setStaff(null)
    if(actor) supabase.from('profiles').select('id,full_name,role').eq('id',actor).maybeSingle().then(({data})=>{if(live)setStaff(data)})
    return ()=>{live=false}
  },[actor])
  useEffect(()=>{
    let live=true;setAllocations([]);setAllocationError('')
    if(payment?.id) supabase.from('payment_allocations').select('bill_id,amount').eq('payment_id',payment.id).then(({data,error})=>{if(live){setAllocations(data||[]);setAllocationError(error?.message||'')}})
    return ()=>{live=false}
  },[payment?.id])
  if(!payment && !activity) return <aside className="panel customer-record-detail"><p>Select a record to view its details.</p></aside>
  const entered=activity?.details?.entered || activity?.details?.after || {}
  const before=activity?.details?.before || activity?.details?.previous_account || {}
  const aliases={name:'account_name',mobile:'phone',address:'service_address',type:'property_type'}
  const changes=Object.entries(entered).filter(([key,value])=>!Object.hasOwn(before,aliases[key]||key)||display(before[aliases[key]||key])!==display(value))
  return <aside className="panel customer-record-detail expanded-record-detail">
    <span>{payment?(showReceiptHeading?payment.or_number||'OR not recorded':'Selected payment'):'Selected activity'}</span>
    <h2>{payment?peso(payment.amount):activityTitle(activity)}</h2>
    <dl>
      <Field label={payment?'Payment date':'Recorded date'}>{dateLabel(payment?.paid_at || activity?.created_at)}</Field>
      <Field label="Time">{time(payment?.paid_at || activity?.created_at)}</Field>
      {payment && <Field label="Applied to bill no.">{allocations.length ? allocations.map(item => bills.find(b => b.id === item.bill_id)?.bill_no || 'Not recorded').join(', ') : bills.find(b => b.id === payment.bill_id)?.bill_no || 'Not recorded'}</Field>}
      <Field label={payment?'Recorded by':'Changed by'} wide={!payment}>{staff?.full_name ? `${staff.full_name}${staff.role ? ` (${staff.role === 'admin' ? 'Admin' : staff.role === 'cashier' ? 'Cashier' : staff.role})` : ''}` : (actor?'Name unavailable':'Not recorded')}</Field>
      {payment ? <>
        <Field label="Official receipt">{payment.or_number || 'Not recorded'}</Field>
        <Field label="Payment method">{payment.method || 'Not recorded'}</Field>
        <Field label="Transaction reference">{payment.reference_no || 'Not recorded'}</Field>
        <Field label="Record type">{payment.historical?'Past Payment':'Counter Payment'}</Field>
        <Field label="Payment status">{payment.status || 'Not recorded'}</Field>
        <Field label="Balance after payment">{payment.balance_after == null?'Not recorded':peso(payment.balance_after)}</Field>
        {payment.method==='Cash' && <><Field label="Cash received">{payment.tendered == null?'Not recorded':peso(payment.tendered)}</Field><Field label="Change">{payment.change_amount == null?'Not recorded':peso(payment.change_amount)}</Field></>}
      </> : <><Field label="Action">{activityTitle(activity)}</Field><Field label="Activity ID" wide>{activity.id}</Field></>}
    </dl>
    {payment ? <>
      {allocationError && <p className="record-detail-note">Could not load allocations: {allocationError}</p>}
      <Link className="button button-full" to={`${base}/receipts/${payment.id}`}>View / print receipt</Link>
    </>:<>
      <h3>{activity.action==='profile'?'Field changes':'Recorded information'}</h3>
      {changes.length?<div className="record-change-list">{changes.map(([key,value])=>{
        const oldKey=aliases[key]||key
        const hasBefore=Object.hasOwn(before,oldKey)
        return <div key={key}><strong>{labels[key]||key.replaceAll('_',' ')}</strong>{activity.action==='profile'&&<p><span>From</span>{hasBefore?display(before[oldKey]):'Previous value not recorded'}</p>}<p><span>{activity.action==='profile'?'To':'Value'}</span>{display(value)}</p></div>
      })}</div>:<p className="record-detail-note">No field-level changes were stored for this activity.</p>}
      {Object.keys(activity.details||{}).filter(key=>!['entered','after','before','previous_account'].includes(key)).map(key=><div className="record-change-list" key={key}><strong>{key.replaceAll('_',' ')}</strong><p>{display(activity.details[key])}</p></div>)}
    </>}
  </aside>
}
