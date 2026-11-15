const safe=value=>typeof value==='string'&&/^[\s]*[=+@-]/.test(value)?`'${value}`:value
const timestamp=()=>new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' PHT'
const valueFor=(row,[key,,type])=>type==='date'&&row[key]?new Date(`${String(row[key]).slice(0,10)}T00:00:00Z`):row[key]??''
function save(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
async function logoData(grayscale=false){
  const response=await fetch('/isabel-water-logo.png');if(!response.ok)throw Error('Could not load report logo')
  const blob=await response.blob()
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})
  if(!grayscale)return data
  const image=new Image();image.src=data;await image.decode()
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
  const context=canvas.getContext('2d');context.drawImage(image,0,0)
  const pixels=context.getImageData(0,0,canvas.width,canvas.height)
  for(let i=0;i<pixels.data.length;i+=4){const gray=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray}
  context.putImageData(pixels,0,0);return canvas.toDataURL('image/png')
}
export async function exportReport(format,{config,rows,period,filters,preparedBy,summary,printTarget,returnBlob=false,preferences={}}){
  const grayscale=preferences.printColorMode==='grayscale'
  const outputLogo=()=>logoData(grayscale)
  const name=`Isabel-Water-${config.title.replaceAll(/[^a-z0-9]+/gi,'-')}-${new Date().toISOString().slice(0,10)}`
  const generated=timestamp()
  if(format==='csv'){
    const quote=v=>'"'+String(safe(v)??'').replaceAll('"','""')+'"'
    const lines=[...[[config.title+' Report'],['Reporting period',period],['Applied filters',filters],['Generated',generated],['Prepared by',preparedBy],[],['Summary'],...summary,[],['Report data']].map(row=>row.map(quote).join(',')),config.columns.map(c=>quote(c[1])).join(','),...rows.map(row=>config.columns.map(([key])=>quote(row[key])).join(','))]
    save(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),name+'.csv');return
  }
  if(format==='xlsx'){
    const {default:ExcelJS}=await import('exceljs')
    const wb=new ExcelJS.Workbook();wb.creator=preparedBy;wb.created=new Date()
    const summarySheet=wb.addWorksheet('Summary',{views:[{showGridLines:false}]})
    summarySheet.columns=[{width:28},{width:28},{width:22},{width:22},{width:20},{width:20}]
    if(preferences.printUtilityLogo !== false){const logo=wb.addImage({base64:await outputLogo(),extension:'png'});summarySheet.addImage(logo,{tl:{col:0,row:0},ext:{width:240,height:80}})}
    summarySheet.mergeCells('A6:F6');summarySheet.getCell('A6').value=config.title+' Report';summarySheet.getRow(6).height=32;summarySheet.getCell('A6').font={size:23,bold:true,color:{argb:'FF16335A'}}
    const meta=[['Reporting period',period],['Applied filters',filters],['Generated',generated],['Prepared by',preparedBy],...summary.map(([label,value])=>[label,value])]
    meta.forEach(([label,value],i)=>{const n=8+i;summarySheet.getCell(n,1).value=label;summarySheet.mergeCells(n,2,n,6);const cell=summarySheet.getCell(n,2);cell.value=value;cell.alignment={vertical:'middle',wrapText:true};summarySheet.getRow(n).height=30;summarySheet.getCell(n,1).font={bold:true,color:{argb:'FF49617E'}};if(typeof value==='number')cell.numFmt='#,##0.00'})
    const summaryTableRow=meta.length+10
    summarySheet.name='Summary and Data'
    config.columns.forEach(([key],i)=>{summarySheet.getColumn(i+1).width=key==='address'?45:24})
    summarySheet.addTable({name:'SummaryReportData',ref:`A${summaryTableRow}`,headerRow:true,style:{theme:preferences.printColorMode==='grayscale'?'TableStyleMedium1':'TableStyleMedium2',showRowStripes:true},columns:config.columns.map(([,label])=>({name:label,filterButton:true})),rows:rows.map(row=>config.columns.map(c=>safe(valueFor(row,c))))})
    for(let r=summaryTableRow;r<=summaryTableRow+rows.length;r++){summarySheet.getRow(r).height=30;summarySheet.getRow(r).alignment={wrapText:true,vertical:'middle'}}
    summarySheet.pageSetup={paperSize:preferences.reportPaperSize==='letter'?1:9,orientation:preferences.reportOrientation||'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}
    const sheet=wb.addWorksheet('Report Data',{views:[{state:'frozen',ySplit:5,showGridLines:false}]})
    const n=config.columns.length
    sheet.mergeCells(1,1,1,n);sheet.getCell(1,1).value='ISABEL WATER · '+config.title.toUpperCase();sheet.getRow(1).height=30;sheet.getCell(1,1).font={bold:true,size:17,color:{argb:'FFFFFFFF'}};sheet.getCell(1,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:preferences.printColorMode==='grayscale'?'FF555555':'FF16335A'}}
    sheet.mergeCells(2,1,2,n);sheet.getCell(2,1).value=period+' | '+filters;sheet.getRow(2).height=32;sheet.getCell(2,1).alignment={wrapText:true}
    sheet.mergeCells(3,1,3,n);sheet.getCell(3,1).value=`Generated ${generated} · ${preparedBy}`;sheet.getCell(3,1).font={size:10,color:{argb:'FF657B95'}}
    sheet.addTable({name:'ReportData',ref:'A5',headerRow:true,totalsRow:true,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:config.columns.map(([,label,type])=>({name:label,filterButton:true,totalsRowFunction:['money','number'].includes(type)?'sum':undefined})),rows:rows.map(row=>config.columns.map(c=>safe(valueFor(row,c))))})
    config.columns.forEach(([key,,type],i)=>{const col=sheet.getColumn(i+1);col.width=key==='address'?45:['name','collector'].includes(key)?28:20;if(type==='money')col.numFmt='"PHP "#,##0.00;[Red]("PHP "#,##0.00)';else if(type==='number')col.numFmt='#,##0.00';else if(type==='date')col.numFmt='mmm d, yyyy';col.alignment={vertical:'middle',wrapText:true}})
    for(let r=5;r<=rows.length+6;r++)sheet.getRow(r).height=30
    sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5'}
    sheet.headerFooter.oddFooter='&LIsabel Water&CPage &P of &N&R'+config.title
    if(grayscale)wb.eachSheet(sheet=>{sheet.pageSetup.blackAndWhite=true;sheet.eachRow(row=>row.eachCell(cell=>{
      const grayColor=color=>{if(!color?.argb)return color;const hex=color.argb.slice(-6),g=Math.round(.299*parseInt(hex.slice(0,2),16)+.587*parseInt(hex.slice(2,4),16)+.114*parseInt(hex.slice(4,6),16)).toString(16).padStart(2,'0');return {argb:'FF'+g.repeat(3)}}
      if(cell.font?.color)cell.font={...cell.font,color:grayColor(cell.font.color)}
      if(cell.fill?.type==='pattern')cell.fill={...cell.fill,fgColor:grayColor(cell.fill.fgColor),bgColor:grayColor(cell.fill.bgColor)}
      if(cell.numFmt)cell.numFmt=cell.numFmt.replace('[Red]','')
    }));sheet.getTables().forEach(table=>{table.style={...table.style,theme:'TableStyleMedium1'};table.commit()})})
    save(new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');return
  }
  const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')])
  const orientation=preferences.reportOrientation || 'landscape'
  const formatSize=preferences.reportPaperSize || 'a4'
  const doc=new jsPDF({orientation,unit:'mm',format:formatSize})
  if(preferences.printUtilityLogo !== false) doc.addImage(await outputLogo(),'PNG',14,8,54,18)
  doc.setFontSize(18);doc.setTextColor(...(grayscale?[45,45,45]:[22,51,90]));doc.text(config.title+' Report',14,36)
  const contentWidth=doc.internal.pageSize.width-28
  doc.setFontSize(9);doc.text(period,14,43)
  const filterLines=doc.splitTextToSize('Filters: '+filters,contentWidth)
  doc.text(filterLines,14,49)
  const summaryY=53+filterLines.length*4
  const cardCount=Math.max(1,summary.length),cardGap=3,cardWidth=(contentWidth-cardGap*(cardCount-1))/cardCount
  const labelSize=Math.min(8,cardWidth<38?6.5:8)
  const labelLines=summary.map(([label])=>{doc.setFontSize(labelSize);return doc.splitTextToSize(label,cardWidth-6)})
  const cardHeight=Math.max(20,Math.max(0,...labelLines.map(lines=>lines.length))*3.5+13)
  summary.forEach(([label,value],index)=>{
    const x=14+index*(cardWidth+cardGap),y=summaryY
    doc.setFillColor(245,245,245);doc.roundedRect(x,y,cardWidth,cardHeight,1,1,'F')
    doc.setTextColor(70);doc.setFontSize(labelSize);doc.text(labelLines[index],x+3,y+6)
    const displayValue=typeof value==='number'?value.toLocaleString('en-PH',{maximumFractionDigits:2}):String(value)
    doc.setTextColor(25);doc.setFontSize(12)
    const valueWidth=doc.getTextWidth(displayValue)
    if(valueWidth>cardWidth-6)doc.setFontSize(12*(cardWidth-6)/valueWidth)
    doc.text(displayValue,x+3,y+cardHeight-4)
  })
  // Keep the table below the summary cards for every report and paper size.
  const tableY=summaryY+(summary.length?cardHeight+5:0)
  const renderTable=options=>autoTable(doc,{...options,startY:tableY})
  const ink=preferences.printColorMode==='grayscale'?[85,85,85]:[22,51,90]
  renderTable({startY:70,head:[config.columns.map(c=>c[1])],body:rows.map(row=>config.columns.map(([key,,type])=>type==='money'?`PHP ${Number(row[key]).toLocaleString('en-PH',{minimumFractionDigits:2})}`:String(row[key]??''))),styles:{fontSize:8,cellPadding:3,overflow:'linebreak'},headStyles:{fillColor:ink},alternateRowStyles:{fillColor:preferences.printColorMode==='grayscale'?[245,245,245]:[242,247,252]},margin:{top:18,bottom:18},didDrawPage:()=>{doc.setFontSize(8);doc.setTextColor(90);doc.text(`Generated ${generated} · ${preparedBy}`,14,doc.internal.pageSize.height-9)}})
  for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);doc.text(`Page ${p} of ${doc.getNumberOfPages()}`,doc.internal.pageSize.width-37,doc.internal.pageSize.height-9)}
  if(returnBlob)return doc.output('blob')
  if(format==='print'){doc.autoPrint();const url=doc.output('bloburl');if(!printTarget)throw Error('Allow pop-ups to print this report.');printTarget.location.href=url;return}
  doc.save(name+'.pdf')
}

