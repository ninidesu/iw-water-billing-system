import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronDown, Download, Search, X, ArrowUpRight } from 'lucide-react'
import { PageHeader, Loading, Notice } from '../../components/UI.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../../components/TablePagination.jsx'
import AccountRecordDetails from '../../components/admin/AccountRecordDetails.jsx'
import RequestDocuments from '../../components/RequestDocuments.jsx'
import { useAdminData } from '../../hooks/useAdminData.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { usePreferences } from '../../lib/preferences.js'
import { supabase } from '../../lib/supabaseClient.js'
import { todayISO, dateLabel, peso } from '../../lib/format.js'
import { reportTypes, filterLabels, periodRange, buildReportRows, filterReportRows } from '../../lib/reports.js'
import { exportReport } from '../../lib/reportExports.js'
import './reports.css'

async function fetchRows(table){
  const rows=[];let after=null
  for(;;){let query=supabase.from(table).select('*').order('id').limit(1000);if(after)query=query.gt('id',after);const {data,error}=await query;if(error)throw error;rows.push(...data);if(data.length<1000)return rows;after=data[data.length-1].id}
}
const printable=value=>value==null||value===''?'Not recorded':typeof value==='object'?JSON.stringify(value):String(value).replaceAll('_',' ')
function DetailField({label,value}){return <div><dt>{label}</dt><dd>{printable(value)}</dd></div>}

function ReportDrawer({row,type,data,close}){
  const ref=useRef(null),closeButton=useRef(null)
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow
    document.body.style.overflow='hidden';closeButton.current?.focus()
    const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){
      const nodes=[...ref.current.querySelectorAll('a[href],button:not(:disabled),input,select,textarea,[tabindex="0"]')];const first=nodes[0],last=nodes[nodes.length-1]
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }}
    document.addEventListener('keydown',key)
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.focus()}
  },[close])
  const raw=row.raw
  const excluded=new Set(['id','tracking_token','request_id','customer_id','account_id','linked_account_id','created_by','collected_by','actor','assigned_to'])
  const isDate=key=>/(?:_at|_date)$/.test(key)
  return createPortal(<div className="report-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><aside ref={ref} className="report-drawer" role="dialog" aria-modal="true" aria-labelledby="report-detail-title">
    <header><div><small>{reportTypes[type].title}</small><h2 id="report-detail-title">{type==='collections'?row.name:row.reference||row.name}</h2></div><button ref={closeButton} type="button" onClick={close} aria-label="Close report details"><X size={20}/></button></header>
    <div className="report-drawer-body">
      {type==='collections'?<>
        <section><h3>{row.name}</h3><dl><DetailField label="CAN" value={row.can}/><DetailField label="Payment status" value={row.status}/><DetailField label="Address" value={row.address}/><DetailField label="Amount paid" value={peso(row.amount)}/></dl></section>
        <div className="report-collection-details"><AccountRecordDetails payment={raw} base="/admin" bills={data.bills} showReceiptHeading/></div>
        {raw.customer_id&&<Link className="button" to={`/admin/customers/${raw.customer_id}`}>Customer account <ArrowUpRight size={15}/></Link>}
      </>:<>
        <section><h3>{row.name}</h3><dl><DetailField label="CAN" value={row.can}/><DetailField label="Status" value={row.status}/><DetailField label="Address" value={row.address}/>{row.balance!=null&&<DetailField label="Balance" value={peso(row.balance)}/>}</dl></section>
        {type==='overdue'&&<section><h3>Unpaid bills</h3>{row.bills.map(b=><div className="report-open-bill" key={b.id}><span>{b.bill_no}<small>Due {dateLabel(b.due_date)}</small></span><strong>{peso(b.balance)}</strong></div>)}</section>}
        <section><h3>Full record details</h3><dl>{Object.entries(raw).filter(([key,value])=>!excluded.has(key)&&key!=='customer'&&value!==null&&typeof value!=='object').map(([key,value])=><DetailField key={key} label={key.replaceAll('_',' ')} value={isDate(key)&&value?`${dateLabel(value)}${key.endsWith('_at')?' · '+new Date(value).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'})+' PHT':''}`:value}/>)}</dl></section>
        {['billing','customers','overdue'].includes(type)&&<div className="report-detail-links"><Link className="button" to={`/admin/customers/${type==='billing'?raw.customer_id:raw.id}`}>Customer account <ArrowUpRight size={15}/></Link>{type==='billing'&&<Link className="button button-outline" to={`/admin/bills/${raw.id}/print`}>View bill PDF</Link>}</div>}
        {type==='applications'&&<><RequestDocuments applicationId={raw.id} closed/><Link className="button" to="/admin/service-requests">Open Service Applications</Link></>}
        {type==='concerns'&&<Link className="button" to="/admin/concerns">Open Concerns & Complaints</Link>}
      </>}
    </div>
  </aside></div>,document.body)
}

export default function Reports(){
  const {data,loading,error,refresh}=useAdminData(),{profile}=useAuth(),{prefs}=usePreferences()
  const [type,setType]=useState('collections'),[period,setPeriod]=useState('monthly'),[anchor,setAnchor]=useState(todayISO()),[from,setFrom]=useState(todayISO().slice(0,7)+'-01'),[to,setTo]=useState(todayISO())
  const [search,setSearch]=useState(''),[filters,setFilters]=useState({}),[selected,setSelected]=useState(null),[busy,setBusy]=useState(''),[exportError,setExportError]=useState('')
  const [extras,setExtras]=useState(null),[sourceError,setSourceError]=useState(''),[revision,setRevision]=useState(0)
  const exportMenu=useRef(null)
  // Keep the local result responsive, then refresh the source after filter edits.
  useEffect(()=>{
    const timer=window.setTimeout(()=>{refresh();setRevision(n=>n+1)},350)
    return()=>window.clearTimeout(timer)
  },[type,period,anchor,from,to,search,filters,refresh])
  useEffect(()=>{
    let timer
    const reload=()=>{
      window.clearTimeout(timer)
      timer=window.setTimeout(()=>{refresh();setRevision(n=>n+1)},400)
    }
    const channel=supabase.channel('admin-reports-live')
    for(const table of ['payments','bills','customers','contract_accounts','account_contacts','service_applications','service_cases']){
      channel.on('postgres_changes',{event:'*',schema:'public',table},reload)
    }
    channel.subscribe()
    const onFocus=()=>reload()
    const poll=window.setInterval(()=>{if(document.visibilityState==='visible')reload()},30000)
    window.addEventListener('focus',onFocus)
    return()=>{window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener('focus',onFocus);supabase.removeChannel(channel)}
  },[refresh])
  useEffect(()=>{let live=true;setSourceError('');Promise.all([fetchRows('service_applications'),fetchRows('service_cases')]).then(([applications,cases])=>{if(live)setExtras({applications,cases})}).catch(e=>{if(live)setSourceError(e.message)});return()=>{live=false}},[revision])
  const config=reportTypes[type],range=periodRange(period,anchor,from,to),current=type==='overdue'
  const reportData=useMemo(()=>data?{...data,...extras}:null,[data,extras])
  const allRows=useMemo(()=>reportData?buildReportRows(type,reportData,todayISO()):[],[type,reportData])
  const invalidRange=!current&&(!range.from||!range.to||range.from>range.to)
  const rows=useMemo(()=>invalidRange?[]:filterReportRows(allRows,{range,search,filters,current}),[allRows,range.from,range.to,search,filters,current,invalidRange])
  const pagination=useTablePagination(rows,10,[type,period,anchor,from,to,search,JSON.stringify(filters)])
  const numericColumns=config.columns.filter(c=>['money','number'].includes(c[2])&&c[0]!=='days')
  const validRows=type==='collections'?rows.filter(row=>row.status==='valid'):rows
  const summary=type==='collections'?[
    ['Total collected',validRows.reduce((total,row)=>total+row.amount,0)],
    ['Payment count',validRows.length],
    ['Cash collected',validRows.filter(row=>row.method==='Cash').reduce((total,row)=>total+row.amount,0)],
    ['Digital payments collected',validRows.filter(row=>['GCash','Bank Transfer'].includes(row.method)).reduce((total,row)=>total+row.amount,0)],
  ]:type==='customers'?[
    ['Total Accounts',rows.length],
    ['Active',rows.filter(row=>row.status==='active').length],
    ['Inactive',rows.filter(row=>['inactive','disconnected','closed'].includes(row.status)).length],
    ['Accounts with Balance',rows.filter(row=>data?.bills.some(b=>b.customer_id===row.id&&Number(b.balance)>0)).length],
  ]:type==='applications'?[
    ['Total Applications',rows.length],
    ['In Progress',rows.filter(row=>!['activated','rejected','cancelled'].includes(row.status)).length],
    ['Activated',rows.filter(row=>row.status==='activated').length],
    ['Rejected / Cancelled',rows.filter(row=>['rejected','cancelled'].includes(row.status)).length],
  ]:type==='concerns'?[
    ['Total Concerns',rows.length],
    ['Open',rows.filter(row=>['received','triage'].includes(row.status)).length],
    ['In Progress',rows.filter(row=>['assigned','investigating','waiting'].includes(row.status)).length],
    ['Resolved / Closed',rows.filter(row=>['resolved','closed'].includes(row.status)).length],
  ]:[['Records',rows.length],...numericColumns.map(([key,label])=>[label,validRows.reduce((total,row)=>total+Number(row[key]||0),0)])]
  const periodText=current?`Current balances as of ${todayISO()}`:`${config.dateLabel}: ${range.from} to ${range.to}`
  const filterText=[search&&`Search: ${search}`,...Object.entries(filters).filter(([,v])=>v).map(([k,v])=>`${filterLabels[k]}: ${v}`)].filter(Boolean).join('; ')||'All records'
  const missingSource=['applications','concerns'].includes(type)&&!extras
  const doExport=async format=>{exportMenu.current.open=false;setExportError('');setBusy(format);const printTarget=format==='print'?window.open('about:blank','_blank'):null;if(printTarget)printTarget.opener=null;try{await exportReport(format,{config,rows,period:periodText,filters:filterText,preparedBy:profile?.full_name||'Administrator',summary,printTarget,preferences:prefs})}catch(e){printTarget?.close();setExportError(e.message||'Export failed. Please try again.')}finally{setBusy('')}}
  return <div className="page-content reports-page"><PageHeader title="Reports" />
    <Notice type="error">{error||exportError||(missingSource?sourceError:'')}</Notice>
    <div className="report-toolbar"><div className="report-type-toggles" role="group" aria-label="Report type">{Object.entries(reportTypes).map(([key,c])=><button type="button" key={key} aria-pressed={type===key} onClick={()=>{setType(key);setFilters({});setSearch('');setSelected(null)}}>{c.title}</button>)}</div>
    </div>
    <div className="report-summary">{summary.slice(0,5).map(([label,value])=><div key={label}><span>{label}</span><small>{type==='collections' ? ({'Total collected':'Valid payments in the selected period','Payment count':'Valid payment transactions','Cash collected':'Cash payments received','Digital payments collected':'GCash and bank transfers'}[label]) : label==='Records' ? 'Records matching the current filters' : 'Total for the filtered report'}</small><strong>{(['customers','applications','concerns'].includes(type)||['Records','Payment count'].includes(label))?value.toLocaleString():numericColumns.find(c=>c[1]===label)?.[2]==='number'?value.toLocaleString():peso(value)}</strong></div>)}</div>
    <section className="report-filter-panel" aria-label="Report filters">
      {!current&&<div className="report-period-row"><label>Period<select value={period} onChange={e=>setPeriod(e.target.value)}>{['daily','weekly','monthly','custom'].map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label>{period==='custom'?<><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>:<label>{period==='monthly'?'Month':period==='weekly'?'Week containing':'Date'}<input type={period==='monthly'?'month':'date'} value={period==='monthly'?anchor.slice(0,7):anchor} onChange={e=>{if(e.target.value)setAnchor(period==='monthly'?e.target.value+'-01':e.target.value)}}/></label>}<p>{periodText}</p></div>}
      {current&&<p className="report-current-note">Current balances only. Future-due bills are included and labeled “Not overdue.” Historical balances are not reconstructed.</p>}
      <div className="report-filter-row"><label className="report-search"><span className="sr-only">Search {config.title.toLowerCase()}</span><div><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer, CAN, or reference…"/></div></label>{config.filters.map(key=><label key={key}><span className="sr-only">{filterLabels[key]}</span><select aria-label={filterLabels[key]} value={filters[key]||''} onChange={e=>setFilters({...filters,[key]:e.target.value})}><option value="">{{"method":"All methods","collector":"All staff","recordType":"All record types","status":"All statuses","month":"All months","property":"All property types","barangay":"All barangays","aging":"All ages","channel":"All channels","category":"All categories"}[key] || 'All'}</option>{[...new Set(allRows.map(row=>row[key]).filter(Boolean))].sort().map(value=><option key={value} value={value}>{printable(value)}</option>)}</select></label>)}<button className="button button-ghost" onClick={()=>{setSearch('');setFilters({})}}>Clear filters</button><details ref={exportMenu} className="report-export" onKeyDown={e=>{if(e.key==='Escape')exportMenu.current.open=false}}><summary aria-disabled={Boolean(busy)||!rows.length||missingSource} onClick={e=>{if(busy||!rows.length||missingSource)e.preventDefault()}}><Download size={16}/>{busy?'Preparing export…':'Export'}<ChevronDown size={16}/></summary><div>{[['csv','CSV'],['pdf','PDF'],['xlsx','Excel (.xlsx)'],['print','Print']].map(([value,label])=><button key={value} onClick={()=>doExport(value)}>{label}</button>)}</div></details></div>
      {invalidRange&&<Notice type="error">Choose a valid date range. The start date must be on or before the end date.</Notice>}
    </section>
    {loading&&!data||missingSource&&!sourceError?<Loading/>:<section className="panel report-table-panel"><div className="table-scroll"><table><thead><tr>{config.columns.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{pagination.visibleRows.map(row=><tr key={row.id} tabIndex={0} aria-label={`View details for ${row.reference||row.name}`} onClick={()=>setSelected(row)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(row)}}}>{config.columns.map(([key,,format])=><td key={key}>{format==='money'?peso(row[key]):format==='date'?dateLabel(row[key]):printable(row[key])}</td>)}</tr>)}<TableEmptyRows count={pagination.emptyRowsCount} colSpan={config.columns.length}/></tbody></table></div>{!rows.length&&<p className="report-empty">No records match this report and its filters.</p>}<TablePagination {...pagination} total={rows.length}/></section>}
    {selected&&<ReportDrawer row={selected} type={type} data={reportData} close={()=>setSelected(null)}/>}
  </div>
}
