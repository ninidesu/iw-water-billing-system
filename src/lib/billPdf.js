const ascii = (value = '') => String(value).normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
const escapePdf = (value) => ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
const money = (value = 0) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const shortDate = (value) => value ? new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : '-'
const month = (value) => value ? new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : '-'

function buildPdfFile(contentStream, { width, height }) {
  const streamObject = `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    streamObject,
  ]

  let output = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(output.length)
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([output], { type: 'application/pdf' })
}

function renderBillColumn(commands, bill, copyLabel, { left, width, top, vatableSale, vatAmount, waterCharge }) {
  const isPending = bill.status === 'pending' || bill.water_used == null || bill.amount == null
  const text = (x, y, value, size = 10, bold = false) => commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`)
  const line = (x1, y1, x2, y2, w = 0.6) => commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`)
  const customer = bill.customer || {}
  const items = bill.items || []
  const right = left + width

  // 1. Copy label badge
  commands.push('0.10 0.25 0.45 rg')
  text(right - 75, top, copyLabel.toUpperCase(), 7.5, true)

  // 2. Header: Brand & Bill Number
  let y = top - 14
  commands.push('0.05 0.22 0.36 rg')
  text(left, y, 'ISABEL WATERS', 13, true)
  text(left, y - 11, 'Billing & Collection', 7)
  text(right - 88, y, 'MONTHLY WATER BILL', 7, true)
  text(right - 88, y - 12, bill.bill_no || '-', 12, true)
  commands.push('0.75 0.82 0.88 RG')
  line(left, y - 20, right, y - 20, 1)

  // 3. Statement Period
  y -= 36
  commands.push('0.05 0.22 0.36 rg')
  text(left, y, 'STATEMENT PERIOD', 6.5, true)
  text(left, y - 14, month(bill.billing_month), 13, true)
  text(right - 80, y - 8, isPending ? 'STATUS: PENDING ENCODING' : `STATUS: ${String(bill.status || 'unpaid').toUpperCase()}`, 7, true)

  // 4. Billed To & Bill Details
  y -= 28
  commands.push('0.85 0.88 0.92 RG')
  line(left, y + 6, right, y + 6, 0.5)
  commands.push('0.35 0.43 0.50 rg')
  text(left, y, 'BILLED TO', 6.5, true)
  text(left + Math.round(width * 0.52), y, 'BILL DETAILS', 6.5, true)

  commands.push('0.05 0.15 0.23 rg')
  text(left, y - 11, customer.full_name || 'Customer', 9.5, true)
  text(left, y - 22, customer.address || '-', 7)
  text(left, y - 32, `CAN ${customer.can || 'Pending assignment'}`, 7)
  text(left, y - 42, `Meter no. ${customer.meter_no || '-'}`, 7)

  text(left + Math.round(width * 0.52), y - 11, `Bill date: ${shortDate(bill.bill_date)}`, 7)
  text(left + Math.round(width * 0.52), y - 22, `Due date: ${shortDate(bill.due_date)}`, 7)
  text(left + Math.round(width * 0.52), y - 32, `Bill no.: ${bill.bill_no || '-'}`, 7)

  y -= 52
  commands.push('0.85 0.88 0.92 RG')
  line(left, y + 4, right, y + 4, 0.5)

  // 5. Consumption Table
  y -= 14
  commands.push('0.93 0.96 0.98 rg')
  commands.push(`${left} ${y - 4} ${width} 16 re f`)
  commands.push('0.30 0.40 0.48 rg')
  text(left + 4, y, 'WATER CONSUMPTION', 6.5, true)
  text(left + Math.round(width * 0.48), y, 'READING / RATE', 6.5, true)
  text(right - 40, y, 'AMOUNT', 6.5, true)

  y -= 16
  commands.push('0.05 0.15 0.23 rg')
  text(left + 4, y, isPending ? 'Monthly water service (Pending)' : 'Monthly water service', 7.5, true)
  text(left + Math.round(width * 0.48), y, `Prev ${bill.previous_reading != null ? Number(bill.previous_reading).toFixed(2) : '-'} | Curr ${isPending || bill.current_reading == null ? '-' : Number(bill.current_reading).toFixed(2)}`, 6.5)
  text(left + Math.round(width * 0.48), y - 9, `Used ${isPending || bill.water_used == null ? '-' : `${Number(bill.water_used).toFixed(2)} m3`}`, 6.5)
  if (!items.length) text(right - 45, y, isPending ? '-' : money(bill.amount), 7.5, true)

  y -= 22
  items.slice(0, 5).forEach((item) => {
    commands.push('0.88 0.92 0.95 RG')
    line(left + 4, y + 8, right - 4, y + 8, 0.25)
    commands.push('0.10 0.20 0.30 rg')
    text(left + 4, y, item.description, 7)
    text(left + Math.round(width * 0.48), y, item.quantity == null ? '-' : `${Number(item.quantity).toFixed(2)} m3`, 6.5)
    text(right - 45, y, money(item.amount), 7, true)
    y -= 14
  })

  // 6. Totals
  const totals = [
    ['VATable Sale', isPending ? '-' : money(vatableSale)],
    ['12% VAT (Inclusive)', isPending ? '-' : money(vatAmount)],
    ['Water charge (VAT Inclusive)', isPending ? '-' : money(waterCharge)],
    ['Penalty', Number(bill.penalty_amount || 0) > 0 ? money(bill.penalty_amount) : '-'],
    ['Previous unpaid balance', Number(bill.previous_balance || 0) > 0 ? money(bill.previous_balance) : '-'],
    ['Amount paid', isPending ? '-' : money(-Number(bill.amount_paid || 0))],
  ]
  let ty = Math.min(y - 6, 320)
  totals.forEach(([label, valueStr]) => {
    commands.push('0.30 0.40 0.48 rg')
    text(left + Math.round(width * 0.36), ty, label, 7)
    commands.push('0.05 0.15 0.23 rg')
    text(right - 45, ty, valueStr, 7, true)
    ty -= 12
  })

  commands.push('0.70 0.80 0.86 RG')
  line(left + Math.round(width * 0.36), ty + 7, right, ty + 7, 0.8)
  commands.push('0.05 0.22 0.36 rg')
  text(left + Math.round(width * 0.36), ty - 6, 'TOTAL DUE AT ISSUE', 7.5, true)
  text(right - 52, ty - 6, isPending ? (Number(bill.previous_balance || 0) > 0 ? money(bill.previous_balance) : '-') : money(bill.total_amount ?? bill.amount), 9.5, true)
  ty -= 22
  text(left + Math.round(width * 0.36), ty, 'CURRENT BILL BALANCE', 7.5, true)
  text(right - 52, ty, isPending ? (Number(bill.balance || 0) > 0 ? money(bill.balance) : '-') : money(bill.balance), 9.5, true)

  // 7. Footer
  commands.push('0.85 0.88 0.92 RG')
  line(left, 130, right, 130, 0.5)
  commands.push('0.05 0.22 0.36 rg')
  text(left, 118, `Payment status: ${isPending ? 'PENDING ENCODING' : (bill.status === 'paid' ? 'PAID' : 'UNPAID')}`, 7, true)
  commands.push('0.35 0.43 0.50 rg')
  text(left, 106, 'Keep your bill number when paying or asking about this statement.', 6.5)
  text(left, 96, 'Generated by Isabel Waters Billing & Collection.', 6.5)
}

function renderFullPageCopy(commands, bill, copyLabel, { width, height, isHalf, vatableSale, vatAmount, waterCharge }) {
  const isPending = bill.status === 'pending' || bill.water_used == null || bill.amount == null
  const text = (x, y, value, size = 10, bold = false) => commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`)
  const line = (x1, y1, x2, y2, w = 0.7) => commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`)
  const customer = bill.customer || {}
  const items = bill.items || []

  if (isHalf) {
    const ml = 28
    const mr = 368
    commands.push('0.10 0.25 0.45 rg')
    text(mr - 75, height - 26, copyLabel.toUpperCase(), 8, true)

    commands.push('0.05 0.22 0.36 rg')
    text(ml, 565, 'ISABEL WATERS', 14, true)
    text(ml, 551, 'Billing & Collection', 8)
    text(250, 565, 'MONTHLY WATER BILL', 8, true)
    text(250, 549, bill.bill_no || '-', 12, true)
    commands.push('0.65 0.78 0.86 RG')
    line(ml, 538, mr, 538, 1)

    commands.push('0.05 0.22 0.36 rg')
    text(ml, 518, 'STATEMENT PERIOD', 7, true)
    text(ml, 498, month(bill.billing_month), 14, true)
    text(260, 504, isPending ? 'STATUS: PENDING ENCODING' : `STATUS: ${String(bill.status || 'unpaid').toUpperCase()}`, 8, true)

    commands.push('0.35 0.43 0.50 rg')
    text(ml, 474, 'BILLED TO', 7, true)
    text(220, 474, 'BILL DETAILS', 7, true)
    commands.push('0.05 0.15 0.23 rg')
    text(ml, 458, customer.full_name || 'Customer', 10, true)
    text(ml, 444, customer.address || '-', 8)
    text(ml, 431, `CAN ${customer.can || 'Pending assignment'}`, 8)
    text(ml, 418, `Meter no. ${customer.meter_no || '-'}`, 8)
    text(220, 458, `Bill date: ${shortDate(bill.bill_date)}`, 8)
    text(220, 444, `Due date: ${shortDate(bill.due_date)}`, 8)
    text(220, 431, `Bill no.: ${bill.bill_no || '-'}`, 8)
    commands.push('0.78 0.84 0.88 RG')
    line(ml, 408, mr, 408, 0.5)

    commands.push('0.93 0.96 0.98 rg')
    commands.push(`${ml} 384 ${mr - ml} 20 re f`)
    commands.push('0.30 0.40 0.48 rg')
    text(ml + 6, 390, 'DESCRIPTION', 7, true)
    text(220, 390, 'READING / QUANTITY', 7, true)
    text(320, 390, 'AMOUNT', 7, true)

    commands.push('0.05 0.15 0.23 rg')
    let y = 368
    text(ml + 6, y, isPending ? 'Monthly water service (Pending)' : 'Monthly water service', 8, true)
    text(220, y, `Prev ${bill.previous_reading != null ? Number(bill.previous_reading).toFixed(2) : '-'} | Curr ${isPending || bill.current_reading == null ? '-' : Number(bill.current_reading).toFixed(2)}`, 7)
    text(220, y - 11, `Used ${isPending || bill.water_used == null ? '-' : `${Number(bill.water_used).toFixed(2)} m3`}`, 7)
    if (!items.length) text(320, y, isPending ? '-' : money(bill.amount), 8, true)
    y -= 30

    items.slice(0, 4).forEach((item) => {
      line(ml + 6, y + 10, mr - 6, y + 10, 0.3)
      text(ml + 6, y, item.description, 7)
      text(220, y, item.quantity == null ? '-' : `${Number(item.quantity).toFixed(2)} m3`, 7)
      text(320, y, money(item.amount), 7, true)
      y -= 18
    })

    const totals = [
      ['VATable Sale', isPending ? '-' : money(vatableSale)],
      ['12% VAT (Inclusive)', isPending ? '-' : money(vatAmount)],
      ['Water charge (VAT Inclusive)', isPending ? '-' : money(waterCharge)],
      ['Penalty', Number(bill.penalty_amount || 0) > 0 ? money(bill.penalty_amount) : '-'],
      ['Previous unpaid balance', Number(bill.previous_balance || 0) > 0 ? money(bill.previous_balance) : '-'],
      ['Amount paid', isPending ? '-' : money(-Number(bill.amount_paid || 0))],
    ]
    let ty = Math.min(y - 6, 260)
    totals.forEach(([label, valueStr]) => {
      text(190, ty, label, 7.5)
      text(315, ty, valueStr, 7.5, true)
      ty -= 13
    })
    line(190, ty + 7, mr, ty + 7, 0.8)
    text(190, ty - 6, 'TOTAL DUE AT ISSUE', 8, true)
    text(305, ty - 6, isPending ? (Number(bill.previous_balance || 0) > 0 ? money(bill.previous_balance) : '-') : money(bill.total_amount ?? bill.amount), 10, true)
    ty -= 24
    text(190, ty, 'CURRENT BILL BALANCE', 8, true)
    text(305, ty, isPending ? (Number(bill.balance || 0) > 0 ? money(bill.balance) : '-') : money(bill.balance), 10, true)

    commands.push('0.35 0.43 0.50 rg')
    text(ml, 44, 'Keep your bill number when paying or asking about this statement.', 7)
    text(ml, 32, 'Generated by Isabel Waters Billing & Collection.', 7)
  } else {
    commands.push('0.10 0.25 0.45 rg')
    text(475, height - 26, copyLabel.toUpperCase(), 9, true)

    commands.push('0.05 0.22 0.36 rg')
    text(44, 792, 'ISABEL WATERS', 18, true)
    text(44, 775, 'Billing & Collection', 9)
    text(390, 792, 'MONTHLY WATER BILL', 9, true)
    text(390, 773, bill.bill_no || '-', 15, true)
    commands.push('0.65 0.78 0.86 RG')
    line(44, 752, 551, 752, 1.2)

    commands.push('0.05 0.22 0.36 rg')
    text(44, 720, 'STATEMENT PERIOD', 8, true)
    text(44, 696, month(bill.billing_month), 20, true)
    text(420, 704, isPending ? 'STATUS: PENDING ENCODING' : `STATUS: ${String(bill.status || 'unpaid').toUpperCase()}`, 9, true)

    commands.push('0.35 0.43 0.50 rg')
    text(44, 656, 'BILLED TO', 8, true)
    text(315, 656, 'BILL DETAILS', 8, true)
    commands.push('0.05 0.15 0.23 rg')
    text(44, 635, customer.full_name || 'Customer', 12, true)
    text(44, 617, customer.address || '-', 9)
    text(44, 601, `CAN ${customer.can || 'Pending assignment'}`, 9)
    text(44, 585, `Meter no. ${customer.meter_no || '-'}`, 9)
    text(315, 635, `Bill date: ${shortDate(bill.bill_date)}`, 9)
    text(315, 617, `Due date: ${shortDate(bill.due_date)}`, 9)
    text(315, 599, `Bill no.: ${bill.bill_no || '-'}`, 9)
    commands.push('0.78 0.84 0.88 RG')
    line(44, 566, 551, 566)

    commands.push('0.93 0.96 0.98 rg')
    commands.push('44 532 507 26 re f')
    commands.push('0.30 0.40 0.48 rg')
    text(54, 541, 'DESCRIPTION', 8, true)
    text(335, 541, 'READING / QUANTITY', 8, true)
    text(492, 541, 'AMOUNT', 8, true)
    commands.push('0.05 0.15 0.23 rg')
    let y = 510
    text(54, y, isPending ? 'Monthly water service (Pending)' : 'Monthly water service', 10, true)
    text(335, y, `Previous ${bill.previous_reading != null ? Number(bill.previous_reading).toFixed(2) : '-'} m3`, 8)
    text(335, y - 14, `Current ${isPending || bill.current_reading == null ? '-' : `${Number(bill.current_reading).toFixed(2)} m3`}`, 8)
    text(335, y - 28, `Used ${isPending || bill.water_used == null ? '-' : `${Number(bill.water_used).toFixed(2)} m3`}`, 8)
    if (!items.length) text(478, y, isPending ? '-' : money(bill.amount), 9, true)
    y -= 52
    items.slice(0, 8).forEach((item) => {
      line(54, y + 13, 541, y + 13, 0.35)
      text(54, y, item.description, 8)
      text(335, y, item.quantity == null ? '-' : `${Number(item.quantity).toFixed(2)} m3`, 8)
      text(478, y, money(item.amount), 8, true)
      y -= 24
    })

    const totalsY = Math.min(y - 10, 380)
    const totals = [
      ['VATable Sale', isPending ? '-' : money(vatableSale)],
      ['12% VAT (Inclusive)', isPending ? '-' : money(vatAmount)],
      ['Water charge (VAT Inclusive)', isPending ? '-' : money(waterCharge)],
      ['Penalty', Number(bill.penalty_amount || 0) > 0 ? money(bill.penalty_amount) : '-'],
      ['Previous unpaid balance', Number(bill.previous_balance || 0) > 0 ? money(bill.previous_balance) : '-'],
      ['Amount paid', isPending ? '-' : money(-Number(bill.amount_paid || 0))],
    ]
    let ty = totalsY
    totals.forEach(([label, valueStr]) => { text(315, ty, label, 9); text(470, ty, valueStr, 9, true); ty -= 18 })
    line(315, ty + 10, 551, ty + 10, 1)
    text(315, ty - 8, 'TOTAL DUE AT ISSUE', 9, true)
    text(455, ty - 8, isPending ? (Number(bill.previous_balance || 0) > 0 ? money(bill.previous_balance) : '-') : money(bill.total_amount ?? bill.amount), 13, true)
    ty -= 34
    text(315, ty, 'CURRENT BILL BALANCE', 9, true)
    text(455, ty, isPending ? (Number(bill.balance || 0) > 0 ? money(bill.balance) : '-') : money(bill.balance), 13, true)

    commands.push('0.35 0.43 0.50 rg')
    text(44, 72, 'Keep your bill number when paying or asking about this statement.', 8)
    text(44, 54, 'Generated by Isabel Waters Billing & Collection.', 8)
  }
}

export function downloadBillPdf(bill, options = {}) {
  const paperSize = options.paperSize || 'letter'
  const isHalf = paperSize === 'half'
  const copiesOption = options.copies || 'both'
  const copyList = copiesOption === 'office'
    ? ['Office Copy']
    : copiesOption === 'customer'
      ? ['Customer Copy']
      : ['Office Copy', 'Customer Copy']

  const commands = []
  const waterCharge = Number(bill.water_charge ?? bill.amount ?? 0)
  const vatableSale = Math.round((waterCharge / 1.12) * 100) / 100
  const vatAmount = Math.round((waterCharge - vatableSale) * 100) / 100

  let width = isHalf ? 396 : 612
  let height = isHalf ? 612 : 792

  if (copyList.length === 2) {
    if (isHalf) {
      // 2 Half-Letter copies side-by-side on Letter Landscape (792 x 612 pt)
      width = 792
      height = 612
      renderBillColumn(commands, bill, copyList[0], {
        left: 26,
        width: 340,
        top: 585,
        vatableSale,
        vatAmount,
        waterCharge,
      })

      // Center cutting guide line
      commands.push('0.75 0.82 0.88 RG')
      commands.push('[4 3] 0 d')
      commands.push('0.5 w 396 30 m 396 585 l S')
      commands.push('[] 0 d')

      renderBillColumn(commands, bill, copyList[1], {
        left: 426,
        width: 340,
        top: 585,
        vatableSale,
        vatAmount,
        waterCharge,
      })
    } else {
      // 2 Letter copies side-by-side in one row on Letter Portrait (612 x 792 pt)
      width = 612
      height = 792
      renderBillColumn(commands, bill, copyList[0], {
        left: 22,
        width: 272,
        top: 760,
        vatableSale,
        vatAmount,
        waterCharge,
      })

      // Center cutting guide line
      commands.push('0.75 0.82 0.88 RG')
      commands.push('[4 3] 0 d')
      commands.push('0.5 w 306 40 m 306 760 l S')
      commands.push('[] 0 d')

      renderBillColumn(commands, bill, copyList[1], {
        left: 318,
        width: 272,
        top: 760,
        vatableSale,
        vatAmount,
        waterCharge,
      })
    }
  } else {
    // Single copy on full page
    renderFullPageCopy(commands, bill, copyList[0], {
      width,
      height,
      isHalf,
      vatableSale,
      vatAmount,
      waterCharge,
    })
  }

  const blob = buildPdfFile(commands.join('\n'), { width, height })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${bill.bill_no || 'water-bill'}-${String(bill.billing_month || '').slice(0, 7)}-${paperSize}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
