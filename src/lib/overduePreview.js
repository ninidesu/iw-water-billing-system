const households = [
  ['Maribel Dacillo', 'Brgy. Libertad, Isabel, Leyte', 'Libertad', [14.5]],
  ['Ramon Villareal', 'Brgy. Marvel, Isabel, Leyte', 'Marvel', [19.25]],
  ['Liza Montellano', 'Brgy. Matlang, Isabel, Leyte', 'Matlang', [13, 16.75]],
  ['Ernesto Calapano', 'Brgy. Tolingon, Isabel, Leyte', 'Tolingon', [21.5, 17, 19]],
]

export function overduePreview(today) {
  const customers = households.map(([full_name, address, barangay], index) => ({
    id: `preview-${index}`,
    full_name,
    address,
    barangay,
    can: String(740285361 + index * 37),
    meter_no: `IW-${4182 + index * 11}`,
    status: 'active',
  }))
  const bills = households.flatMap(([, , , usage], index) =>
    usage.map((volume, cycle) => ({
      id: `preview-${index}-${cycle}`,
      customer_id: customers[index].id,
      bill_no: `IW-${String(471 + index + cycle * 4).padStart(6, '0')}`,
      due_date: new Date(Date.parse(today + 'T00:00:00Z') - (8 + index * 4 + cycle * 30) * 86400000).toISOString().slice(0, 10),
      balance: volume * 8,
      status: 'unpaid',
    })),
  )
  return { customers, bills }
}
