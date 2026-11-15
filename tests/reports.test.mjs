import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { periodRange, buildReportRows, filterReportRows, reportTypes } from '../src/lib/reports.js'
import { exportReport } from '../src/lib/reportExports.js'

assert.deepEqual(periodRange('weekly','2026-11-15'),{from:'2026-11-09',to:'2026-11-15'})
assert.deepEqual(periodRange('monthly','2028-02-15'),{from:'2028-02-01',to:'2028-02-29'})
assert.deepEqual(periodRange('custom','', '2026-10-01','2026-11-15'),{from:'2026-10-01',to:'2026-11-15'})
const data={customers:[{id:'c',full_name:'Consumer',can:'012345678',status:'active'}],profiles:[{id:'p',full_name:'Admin',role:'admin'}],bills:[{id:'b',customer_id:'c',bill_no:'IW-1',due_date:'2026-10-01',balance:200,amount:300,amount_paid:100}],payments:[{id:'pay',customer_id:'c',bill_id:'b',paid_at:'2026-11-14T16:30:00Z',amount:100,collected_by:'p',status:'valid'}],applications:[],cases:[]}
const collections=buildReportRows('collections',data,'2026-11-15')
assert.equal(collections[0].date,'2026-11-15','UTC payment must map to Manila date')
assert.equal(collections[0].can,'012345678')
assert.equal(buildReportRows('overdue',data,'2026-11-15')[0].balance,200,'Carry-forward snapshots must not be added to debt')
assert.equal(filterReportRows(collections,{range:{from:'2026-11-15',to:'2026-11-15'},search:'012345',filters:{status:'valid'}}).length,1)
assert.equal(filterReportRows(collections,{range:{from:'2026-11-14',to:'2026-11-14'},search:'',filters:{}}).length,0)

// Capture browser downloads in memory to inspect real generated workbook bytes.
const blobs=[]
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL
URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:test'}
URL.revokeObjectURL=()=>{}
globalThis.document={createElement:()=>({click(){}})}
globalThis.FileReader=class{async readAsDataURL(blob){this.result='data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload()}}
globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob([await readFile(new URL('../public/isabel-water-logo.png',import.meta.url))],{type:'image/png'})})
const rows=Array.from({length:27},(_,i)=>({...collections[0],id:String(i),name:i===0?'=HYPERLINK("bad")':'Consumer '+i,reference:'OR-'+i,amount:100+i}))
const options={config:reportTypes.collections,rows,period:'Nov 1–30, 2026 PHT',filters:'All records',preparedBy:'Test Admin',summary:[['Records',27],['Valid payments total',3051]]}
await exportReport('xlsx',options)
const wb=new ExcelJS.Workbook();await wb.xlsx.load(await blobs.at(-1).arrayBuffer())
assert.deepEqual(wb.worksheets.map(s=>s.name),['Summary','Report Data'])
const sheet=wb.getWorksheet('Report Data')
assert.equal(sheet.getCell('H32').value,126,'All 27 records must be exported beyond page 1')
assert.equal(typeof sheet.getCell('H6').value,'number')
assert.ok(sheet.getCell('D6').value instanceof Date)
assert.equal(sheet.getCell('C6').value,'012345678')
assert.ok(sheet.getCell('B6').value.startsWith("'="),'Spreadsheet formula injection must be escaped')
assert.equal(sheet.views[0].ySplit,5)
assert.equal(sheet.getTables().length,1)
assert.equal(wb.getWorksheet('Summary').getImages().length,1)
await exportReport('csv',options)
const csv=await blobs.at(-1).text();assert.equal(csv.split('\r\n').length,28);assert.ok(csv.includes("'=HYPERLINK"))
URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke
const pdf=await exportReport('pdf',{...options,returnBlob:true})
const pdfText=await pdf.text()
assert.ok(pdfText.startsWith('%PDF-'))
assert.ok(pdfText.includes('OR-26'),'PDF includes all records')
assert.ok((pdfText.match(/\/Type \/Page\b/g)||[]).length>=2,'Report flows over multiple pages')
console.log('Reports checks passed: Manila periods, filtering, debt totals, 27-row XLSX/CSV exports, typed cells, branding, frozen headers, and formula safety.')
