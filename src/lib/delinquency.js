export function getOverdueStage(days, billCount = 1) {
  if (days > 60 || billCount >= 3) {
    return {
      level: 3,
      key: '3mo',
      label: '3+ Months Late',
      shortLabel: '3+ Mos · For Restriction',
      badgeLabel: 'Notice of Restriction',
      tone: 'red',
      noticeTitle: 'NOTICE OF SERVICE RESTRICTION',
      noticeHeadline: 'FINAL NOTICE PRIOR TO WATER SERVICE RESTRICTION',
      noticeWarning:
        'Your water service account is overdue for three (3) or more billing periods. Please settle your full outstanding balance within five (5) business days to prevent temporary restriction of your water connection.',
      reconnectionNotice:
        'Notice on Reconnection: Once a connection is restricted or placed on inactive status, service will only be restored upon full settlement of all overdue accounts plus the approved Reconnection Fee.',
      buttonLabel: 'Print Restriction Notice',
      urgencyBadge: '3+ Months: Service Restriction Risk',
    }
  }
  if (days > 30 || billCount >= 2) {
    return {
      level: 2,
      key: '2mo',
      label: '2 Months Late',
      shortLabel: '2 Mos · Warning',
      badgeLabel: 'Second Warning',
      tone: 'yellow',
      noticeTitle: 'SECOND OVERDUE WARNING',
      noticeHeadline: 'SECOND NOTICE OF OVERDUE WATER BILL',
      noticeWarning:
        'Our records indicate that your account has unpaid water bills across two consecutive billing cycles. Please settle your balance promptly to avoid referral for service restriction.',
      reconnectionNotice:
        'Please settle your account promptly to prevent escalating to service restriction and incurring reconnection fees.',
      buttonLabel: 'Print Warning Notice',
      urgencyBadge: '2 Months: Overdue Warning',
    }
  }
  return {
    level: 1,
    key: '1mo',
    label: '1 Month Late',
    shortLabel: '1 Mo · Reminder',
    badgeLabel: 'Payment Reminder',
    tone: 'blue',
    noticeTitle: 'WATER BILL PAYMENT REMINDER',
    noticeHeadline: 'FRIENDLY PAYMENT REMINDER',
    noticeWarning:
      'Our records show an unsettled water bill past its due date. Please pay at your earliest convenience or contact our office to keep your account current.',
    reconnectionNotice: 'Paying on time avoids service interruptions and late fees.',
    buttonLabel: 'Print Reminder Notice',
    urgencyBadge: '1 Month: First Reminder',
  }
}

export function overdueAccounts(customers, bills, today) {
  return customers
    .map((customer) => {
      const overdue = bills.filter((b) => b.customer_id === customer.id && Number(b.balance) > 0 && b.due_date < today)
      const oldest = overdue.reduce((date, b) => (date < b.due_date ? date : b.due_date), today)
      const days = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(oldest + 'T00:00:00Z')) / 86400000)
      const stage = getOverdueStage(days, overdue.length)
      return {
        customer,
        bills: overdue,
        amount: overdue.reduce((n, b) => n + Number(b.balance), 0),
        days,
        stage,
        bucket: stage.key,
      }
    })
    .filter((row) => row.bills.length)
    .sort((a, b) => b.days - a.days)
}
