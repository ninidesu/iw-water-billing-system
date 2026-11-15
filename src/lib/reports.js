import { billStatus, dateISOManila } from './format.js'

export const reportTypes = {
  collections:{title:'Collections',dateLabel:'Payment date',date:'paid_at',columns:[['reference','Receipt'],['name','Customer'],['can','CAN'],['date','Payment date','date'],['method','Method'],['collector','Recorded by'],['recordType','Record type'],['amount','Amount','money']],filters:['method','collector','recordType','status']},
  billing:{title:'Billing',dateLabel:'Issue date',date:'bill_date',columns:[['reference','Bill no.'],['name','Customer'],['can','CAN'],['month','Billing month'],['usage','Usage (m³)','number'],['amount','Charges','money'],['paid','Paid','money'],['balance','Balance','money'],['status','Status']],filters:['month','status','property']},
  overdue:{title:'Outstanding & Overdue',dateLabel:'Current balances',columns:[['name','Customer'],['can','CAN'],['barangay','Barangay'],['openBills','Open bills','number'],['oldestDue','Oldest due','date'],['days','Days overdue','number'],['aging','Age bracket'],['balance','Balance','money']],filters:['aging','barangay','status']},
  customers:{title:'Customer Accounts',dateLabel:'Account creation date',date:'created_at',columns:[['can','CAN'],['name','Customer'],['address','Service address'],['meter','Meter'],['property','Property type'],['status','Status'],['date','Account created','date']],filters:['barangay','property','status']},
  applications:{title:'Service Applications',dateLabel:'Submission date',date:'created_at',columns:[['reference','Reference'],['name','Applicant'],['address','Address'],['channel','Channel'],['status','Stage'],['date','Submitted','date']],filters:['status','channel','property']},
  concerns:{title:'Concerns & Complaints',dateLabel:'Reported date',date:'created_at',columns:[['reference','Reference'],['name','Requester'],['category','Category'],['address','Location'],['channel','Channel'],['status','Status'],['date','Reported','date']],filters:['category','status','channel']},
}
export const filterLabels={method:'Payment method',collector:'Recorded by',recordType:'Record type',status:'Status',month:'Billing month',property:'Property type',barangay:'Barangay',aging:'Age bracket',channel:'Channel',category:'Category'}
export function periodRange(period,anchor,from,to){
  if(period==='custom') return {from,to}
  if(period==='daily') return {from:anchor,to:anchor}
  const d=new Date(`${anchor}T12:00:00Z`)
  if(period==='weekly'){
    d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const start=d.toISOString().slice(0,10)
    d.setUTCDate(d.getUTCDate()+6);return {from:start,to:d.toISOString().slice(0,10)}
  }
  const year=d.getUTCFullYear(),month=d.getUTCMonth()
  return {from:new Date(Date.UTC(year,month,1)).toISOString().slice(0,10),to:new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10)}
}
const day=value=>value?String(value).slice(0,10):''
export function buildReportRows(type,data,today){
  const customers=new Map(data.customers.map(c=>[c.id,c]))
  const profiles=new Map(data.profiles.map(p=>[p.id,p]))
  const bills=new Map(data.bills.map(b=>[b.id,b]))
  const base=c=>({name:c?.full_name||'Not recorded',can:c?.can||'',address:c?.address||'',meter:c?.meter_no||'',property:c?.property_type||'Not recorded',barangay:c?.barangay||'Not recorded'})
  if(type==='collections')return data.payments.map(p=>{
    const customer=customers.get(p.customer_id)||bills.get(p.bill_id)?.customer
    const collector=profiles.get(p.collected_by)
    return {...base(customer),id:p.id,raw:p,date:p.paid_at?dateISOManila(p.paid_at):'',reference:p.or_number||'Not recorded',method:p.method||'Not recorded',collector:collector?`${collector.full_name} (${collector.role})`:'Not recorded',recordType:p.historical?'Past Payment':'Counter Payment',amount:Number(p.amount||0),status:p.status||'Not recorded'}
  })
  if(type==='billing')return data.bills.map(b=>({...base(customers.get(b.customer_id)),id:b.id,raw:b,date:day(b.bill_date||b.created_at),reference:b.bill_no,month:day(b.billing_month).slice(0,7),usage:Number(b.usage_m3??b.water_used??0),amount:Number(b.amount||0),paid:Number(b.amount_paid||0),balance:Number(b.balance||0),status:billStatus(b)}))
  if(type==='overdue')return data.customers.flatMap(c=>{
    const open=data.bills.filter(b=>b.customer_id===c.id&&Number(b.balance)>0).sort((a,b)=>a.due_date.localeCompare(b.due_date))
    if(!open.length)return []
    const days=Math.max(0,Math.floor((Date.parse(today)-Date.parse(day(open[0].due_date)))/86400000))
    return [{...base(c),id:c.id,raw:c,openBills:open.length,bills:open,oldestDue:open[0].due_date,days,aging:days===0?'Not overdue':days<=30?'1–30 days':days<=60?'31–60 days':days<=90?'61–90 days':'90+ days',balance:open.reduce((s,b)=>s+Number(b.balance),0),status:c.status}]
  })
  if(type==='customers')return data.customers.map(c=>({...base(c),id:c.id,raw:c,status:c.status,date:c.created_at?dateISOManila(c.created_at):''}))
  const source=type==='applications'?data.applications:data.cases
  return source.map(r=>({id:r.id,raw:r,reference:r.reference_no,name:r.applicant_name||r.requester_name||r.reporter_name||'Not recorded',address:r.service_address||r.location_text||r.location||r.address||'',category:r.case_type||r.category||'Not recorded',property:r.property_type||(['Residential','Commercial','Institutional','Government','Other'].find(value=>r.notes?.toLowerCase().includes(value.toLowerCase())))||'Not recorded',channel:r.channel||'Not recorded',status:r.status,date:r.created_at?dateISOManila(r.created_at):''}))
}
export function filterReportRows(rows,{range,search,filters,current=false}){
  return rows.filter(row=>(current||row.date>=range.from&&row.date<=range.to)&&Object.entries(filters).every(([key,value])=>!value||row[key]===value)&&Object.entries(row).filter(([key])=>!['raw','bills'].includes(key)).some(([,value])=>String(value??'').toLowerCase().includes(search.trim().toLowerCase())))
}
