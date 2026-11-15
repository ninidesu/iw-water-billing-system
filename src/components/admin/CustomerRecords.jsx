import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2 } from 'lucide-react'
import Modal from '../Modal.jsx'
import './customer-record-modal.css'
import TablePagination, { TableEmptyRows, useTablePagination } from '../TablePagination.jsx'
import AccountRecordDetails from './AccountRecordDetails.jsx'
import PastBillFields from './PastBillFields.jsx'
import { validateBillingDates } from '../../lib/billingDates.js'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Notice } from '../UI.jsx'
import { peso, dateLabel, todayISO } from '../../lib/format.js'

export default function CustomerRecords({customer,bills,payments,onSaved,tab,setTab,mode:extMode,setMode:setExtMode,base='/admin'}) {
 const {profile}=useAuth()
 const [localMode,setLocalMode]=useState('')
 const mode = extMode !== undefined ? extMode : localMode
 const setMode = setExtMode || setLocalMode
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[activity,setActivity]=useState([])
 const [selectedPaymentId,setSelectedPaymentId]=useState(''),[selectedActivityId,setSelectedActivityId]=useState('')
 const [paymentSearch,setPaymentSearch]=useState(''),[paymentMethod,setPaymentMethod]=useState('')
 const [activitySearch,setActivitySearch]=useState(''),[activityAction,setActivityAction]=useState('')
 useEffect(()=>{let live=true; if(tab==='activity') supabase.from('account_activity').select('*').eq('customer_id',customer.id).order('created_at',{ascending:false}).then(r=>{if(live){setActivity(r.data||[]);setError(r.error?.message||'')}});return()=>{live=false}},[tab,customer.id,mode])
 const activityLabel=a=>({profile:'Customer information updated',bill:'Historical bill added',payment:'Historical payment added'}[a?.action]||a?.action||'Account activity')
 const filteredPayments=useMemo(()=>payments.filter(p=>`${p.or_number||''} ${p.method||''}`.toLowerCase().includes(paymentSearch.toLowerCase())&&(!paymentMethod||p.method===paymentMethod)),[payments,paymentSearch,paymentMethod])
 const filteredActivity=useMemo(()=>activity.filter(a=>`${activityLabel(a)} ${a.actor||''}`.toLowerCase().includes(activitySearch.toLowerCase())&&(!activityAction||a.action===activityAction)),[activity,activitySearch,activityAction])
 const paymentPages=useTablePagination(filteredPayments,10,[customer.id,paymentSearch,paymentMethod])
 const activityPages=useTablePagination(filteredActivity,10,[customer.id,activitySearch,activityAction])
 const selectedPayment=paymentPages.visibleRows.find(p=>p.id===selectedPaymentId)||paymentPages.visibleRows[0]
 const selectedActivity=activityPages.visibleRows.find(a=>a.id===selectedActivityId)||activityPages.visibleRows[0]
 async function save(e){e.preventDefault();setBusy(true);setError('');const values=Object.fromEntries(new FormData(e.currentTarget));if(mode==='bill'){const issue=validateBillingDates({month:values.month,period_start:values.period_start,period_end:values.period_end,due_date:values.due},true,todayISO());if(issue){setError(issue);setBusy(false);return}values.month+='-01';}try{const r=await supabase.rpc(mode==='bill'?'save_customer_record_period':'save_customer_record',{p_customer:customer.id,p_action:mode,p_data:values});if(r.error)throw r.error;await onSaved();setMode('')}catch(err){setError(err.message)}finally{setBusy(false)}}
 const field=(label,name,type='text',value='',required=true)=><label key={name}>{label}<input name={name} type={type} defaultValue={value} required={required} min={type==='number'?'0':undefined} step={type==='number'?'0.01':undefined} max={type==='date'?todayISO():undefined}/></label>
 const toggleMode=next=>{setError('');setMode(current=>current===next?'':next)}
 return <>
 <div className="account-record-toolbar">
   <nav aria-label="Account records">{[['billing','Billing History'],['payments','Payment History'],['activity','Account Activity']].map(([key,label])=><button className="button button-ghost" aria-pressed={tab===key} onClick={()=>{setTab(key);setError('')}} key={key}>{label}</button>)}</nav>
   <div>
     {customer.status === 'active' && (
       <Link className="button button-outline" to={`${base}/billing?customer=${customer.id}`}>
         <FilePlus2 size={16} /> Encode New Bill
       </Link>
     )}
     {profile?.role==='admin'&&<>
       <button className={`button ${mode==='bill'?'':'button-outline'}`} onClick={()=>toggleMode('bill')}>+ Add Past Billing</button>
       <button className={`button ${mode==='payment'?'':'button-outline'}`} onClick={()=>toggleMode('payment')}>+ Add Past Payment</button>
     </>}
   </div>
 </div>
 {Boolean(!mode && error) && <Notice type="error">{error}</Notice>}
 {Boolean(mode) && <Modal title={mode==='bill'?'Add Past Billing':'Add Past Payment'} className="customer-record-modal" onClose={()=>{if(!busy)setMode('')}}>
   <p className="record-modal-customer">{customer.full_name} · CAN {customer.can || 'Not assigned'}</p>
   <div className="record-modal-body">
     <Notice type="error">{error}</Notice>
     <form className="form-grid" onSubmit={save}>
       {mode==='bill'&&<PastBillFields key={customer.id}/>}
       {mode==='payment'&&<><label className="span-2">Historical Bill<select name="bill" required><option value="">Select bill</option>{bills.filter(b=>b.historical&&Number(b.balance)>0).map(b=><option value={b.id} key={b.id}>{b.bill_no} · Balance {peso(b.balance)}</option>)}</select></label>{field('Original Payment Date','date','date')}{field('Original OR No. (optional)','number','text','',false)}{field('Amount Paid (PHP)','amount','number')}<label>Method<select name="method">{['Cash','GCash','Bank Transfer','Other'].map(x=><option key={x}>{x}</option>)}</select></label></>}
       <div className="form-actions span-2"><button type="button" className="button button-ghost" disabled={busy} onClick={()=>setMode('')}>Cancel</button><button className="button" disabled={busy}>{busy?'Saving…':'Save Record'}</button></div>
     </form>
   </div>
 </Modal>}
 {tab==='payments'&&<div className="customer-record-layout"><section className="panel"><div className="record-table-filters"><label><span>Search Payments</span><input value={paymentSearch} onChange={e=>setPaymentSearch(e.target.value)} placeholder="Receipt or method" /></label><label><span>Method</span><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="">All methods</option>{['Cash','GCash','Bank Transfer','Other'].map(x=><option key={x}>{x}</option>)}</select></label></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Official Receipt</th><th>Amount</th><th>Method</th><th>Record Type</th></tr></thead><tbody>{paymentPages.visibleRows.map(p=><tr className={`clickable-row ${selectedPayment?.id===p.id?'selected-row':''}`} key={p.id} tabIndex="0" onClick={()=>setSelectedPaymentId(p.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setSelectedPaymentId(p.id)}}><td>{dateLabel(p.paid_at)}</td><td><strong>{p.or_number||'Not recorded'}</strong></td><td>{peso(p.amount)}</td><td>{p.method}</td><td>{p.historical?'Past Payment':'Counter Payment'}</td></tr>)}<TableEmptyRows count={paymentPages.emptyRowsCount} colSpan={5} /></tbody></table>{!filteredPayments.length&&<p className="record-empty">{payments.length?'No matching payments.':'No payments recorded.'}</p>}</div><TablePagination {...paymentPages} total={filteredPayments.length}/></section><AccountRecordDetails payment={selectedPayment} base={base} bills={bills}/></div>}
 {tab==='activity'&&<div className="customer-record-layout"><section className="panel"><div className="record-table-filters"><label><span>Search Activity</span><input value={activitySearch} onChange={e=>setActivitySearch(e.target.value)} placeholder="Action or administrator" /></label><label><span>Action</span><select value={activityAction} onChange={e=>setActivityAction(e.target.value)}><option value="">All actions</option><option value="profile">Customer update</option><option value="bill">Historical billing</option><option value="payment">Historical payment</option></select></label></div><div className="table-scroll"><table><thead><tr><th>Date Recorded</th><th>Action</th><th>Administrator ID</th></tr></thead><tbody>{activityPages.visibleRows.map(a=><tr className={`clickable-row ${selectedActivity?.id===a.id?'selected-row':''}`} key={a.id} tabIndex="0" onClick={()=>setSelectedActivityId(a.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setSelectedActivityId(a.id)}}><td>{dateLabel(a.created_at)}</td><td><strong>{activityLabel(a)}</strong></td><td>{a.actor}</td></tr>)}<TableEmptyRows count={activityPages.emptyRowsCount} colSpan={3} /></tbody></table>{!filteredActivity.length&&<p className="record-empty">{activity.length?'No matching activity.':'No recorded account activity.'}</p>}</div><TablePagination {...activityPages} total={filteredActivity.length}/></section><AccountRecordDetails activity={selectedActivity} base={base}/></div>}
 </>
}

