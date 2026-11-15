import { useEffect, useMemo, useState } from 'react'
import { downloadBillPdf } from '../../lib/billPdf.js'
import { billPreviewImage } from '../../lib/billPreview.js'
import './customer-scrollbars.css'
import { useNavigate } from 'react-router-dom'
import reference from '../../assets/landing-reference.html?raw'
import './reference-landing.css'
import { useAuth } from '../../context/AuthContext.jsx'

// Adapt the supplied, local HTML reference without executing its inline handlers.
export default function ReferenceLanding() {
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const [sampleUrl, setSampleUrl] = useState('')
  useEffect(() => {
    const blob = downloadBillPdf({bill_no:'SAMPLE-0001',billing_month:'2026-10-01',bill_date:'2026-11-01',due_date:'2026-11-15',status:'unpaid',previous_reading:128,current_reading:140,water_used:12,water_charge:225,amount:225,amount_paid:0,balance:225,total_amount:225,previous_balance:0,customer:{full_name:'Sample Customer',address:'Sample service address',can:'DEMO-0001',meter_no:'DEMO-METER'},items:[]}, {copies:'customer',paperSize:'half',returnBlob:true})
    let active = true
    billPreviewImage(blob).then(url => { if (active) setSampleUrl(url) })
    return () => { active = false }
  }, [])
  const account = user ? (role === 'admin' ? '/admin' : role === 'cashier' ? '/cashier' : '/customer/dashboard') : '/login'
  const content = useMemo(() => {
    const doc = new DOMParser().parseFromString(reference, 'text/html')
    const css = [...doc.querySelectorAll('style')].map(style => style.textContent).join('\n').replace(/:root/g, ':scope').replace(/\bhtml\s*\{/g, ':scope {').replace(/\bbody\s*\{/g, ':scope {')
    doc.querySelectorAll('script').forEach(node => node.remove())
    doc.body.querySelectorAll('*').forEach(node => {
      for (const attr of [...node.attributes]) if (attr.name.startsWith('on')) node.removeAttribute(attr.name)
    })
    const logo = doc.querySelector('.nav-logo')
    logo.innerHTML = '<img src="/isabel-water-logo.png" alt="Isabel Water" width="220" height="73" />'
    logo.setAttribute('href', '/')
    doc.querySelector('.nav-actions')?.remove()
    const sectionLinks = [
      ['Services', '#services'],
      ['Ways to pay', '#payment-options'],
      ['New connection', '#new-connection'],
      ['Service advisories', '#advisories'],
      ['Contact', '#contact'],
      ['FAQs', '#faqs'],
    ]
    const headerList = doc.querySelector('.nav-links')
    headerList.replaceChildren(...sectionLinks.map(([label, href]) => {
      const item = doc.createElement('li')
      const link = doc.createElement('a')
      link.textContent = label; link.href = href
      item.append(link)
      return item
    }))
    doc.querySelector('.pay-section').id = 'payment-options'
    doc.querySelector('.steps-section').id = 'new-connection'
    const soa = doc.querySelector('.soa-card')
    soa.innerHTML = '<div class="soa-badge">Sample statement · Demonstration only</div>'
    if (sampleUrl) {
      const preview = doc.createElement('img')
      preview.src = sampleUrl
      preview.alt = 'Sample Isabel Waters SOA: meter readings, charges, and PHP 225.00 total due. Demonstration only.'
      preview.width = 792; preview.height = 1224
      preview.style.cssText = 'width:100%;height:auto;display:block;margin-top:12px;background:white'
      soa.append(preview)
      soa.style.cssText = 'width:100%;max-width:440px;padding:16px;transform:none'
    }
    const routeFor = label => {
      if (/create|register/i.test(label)) return '/register'
      if (/log in|my account|view invoices|download|e-soa/i.test(label)) return account
      if (/track|check status/i.test(label)) return '/track'
      if (/application|connection/i.test(label)) return '/apply'
      if (/concern|report|emergency|inquiry|dispute/i.test(label)) return '/concerns'
      if (/advisories/i.test(label)) return '#advisories'
      if (/faq/i.test(label)) return '#faqs'
      if (/contact|office hours|directions/i.test(label)) return '#contact'
      if (/pay|payment|bill/i.test(label)) return '/pay'
      if (/services/i.test(label)) return '#services'
      return '/concerns'
    }
    doc.querySelectorAll('a[href="#"]').forEach(link => link.setAttribute('href', routeFor(link.textContent)))
    const footerLogo = doc.querySelector('.footer-logo')
    if (footerLogo) { footerLogo.innerHTML = '<img src="/iw-logo.png" alt="" width="32" height="32" /> Isabel Water'; footerLogo.setAttribute('href', '/') }
    for (const [selector, id] of [['.bento-section','services'],['.advisories-section','advisories'],['.faq-section','faqs'],['.emergency-section','contact']]) doc.querySelector(selector)?.setAttribute('id', id)
    doc.querySelectorAll('.faq-item').forEach(item => {
      const details = doc.createElement('details')
      details.className = 'faq-item'
      details.setAttribute('name', 'landing-faq')
      const summary = doc.createElement('summary')
      summary.className = 'faq-q'
      summary.innerHTML = item.querySelector('.faq-q').innerHTML
      details.append(summary, item.querySelector('.faq-a'))
      item.replaceWith(details)
    })
    const configuredAdvisory = import.meta.env.VITE_SERVICE_ADVISORY
    const advisory = configuredAdvisory || 'Scheduled water maintenance · November 20, 2026, 8:00 AM–12:00 PM · Barangay Central · Please store enough water before the scheduled work.'
    const ticker = doc.querySelector('.ticker-inner')
    ticker.replaceChildren(...[false, true].map(duplicate => {
      const item = doc.createElement('span')
      item.className = 'advisory-ticker-copy'
      item.textContent = advisory
      if (duplicate) item.setAttribute('aria-hidden', 'true')
      return item
    }))
    doc.querySelector('.advisories-grid').innerHTML = ''
    const notice = doc.createElement('article'); notice.className = 'advisory-card'
    if (configuredAdvisory) {
      notice.textContent = configuredAdvisory
    } else {
      notice.classList.add('advisory-poster')
      notice.innerHTML = '<img src="/water-maintenance-advisory.png" width="1536" height="1024" loading="lazy" alt="Scheduled water maintenance: November 20, 2026, 8 AM to 12 PM, Barangay Central. Temporary water interruption or low pressure may occur. Store enough water before maintenance; supply will resume gradually." />'
    }
    doc.querySelector('.advisories-grid').append(notice)
    doc.querySelector('.stats-bar')?.remove()
    doc.querySelector('.cta-section')?.remove()
    doc.querySelector('.hero h1 em')?.remove()
    doc.querySelector('.hero h1 br')?.remove()
    doc.querySelector('.bento-section .section-eyebrow')?.remove()
    doc.querySelector('.pay-section .section-eyebrow')?.remove()
    doc.querySelectorAll('.pay-section .pay-card-icon').forEach(icon => icon.remove())
    doc.querySelector('.pay-section > a.btn-primary')?.remove()
    doc.querySelector('.steps-section .section-eyebrow')?.remove()
    doc.querySelector('.advisories-section .section-eyebrow')?.remove()
    doc.querySelector('.advisories-section .section-title').textContent = 'Service advisories'
    doc.querySelector('.faq-section .section-eyebrow')?.remove()
    doc.querySelector('.faq-section .section-title').textContent = 'Frequently Asked Questions'
    const stepSub = doc.querySelector('.steps-section .section-sub')
    stepSub.textContent = 'Apply online or visit the office. Our team will guide you through inspection, payment, and connection.'
    const connectionSteps = [
      ['Apply online or walk in', 'Submit your property and contact details online or at the office. Keep your reference and tracking code.'],
      ['Site inspection', 'Our team schedules a visit, checks the meter location and pipe route, and prepares your cost estimate.'],
      ['Pay and connect', 'Accept the service agreement and settle the approved charges through available payment channels or at the office. Your CAN is issued after installation.'],
    ]
    doc.querySelectorAll('.steps-section .step').forEach((step, index) => {
      step.querySelector('h4').textContent = connectionSteps[index][0]
      step.querySelector('p').textContent = connectionSteps[index][1]
    })
    doc.querySelectorAll('.faq-a').forEach(el => {
      if (/5–10|5 business days/.test(el.textContent)) el.textContent = 'Contact the office for the schedule and requirements for your request. Keep your reference and tracking code to follow its progress.'
      if (/Search for "Isabel Waters"/.test(el.textContent)) el.textContent = 'Confirm accepted e-wallet channels and biller details with the office before making a payment.'
    })
    const urgent = doc.querySelector('.emergency-card.urgent p')
    urgent.textContent = 'Send the location and your contact details.'
    const contactDescriptions = ['Send the location and your contact details.', 'Get help with connections, bills, and meters.', 'Contact us for billing and service questions.']
    doc.querySelectorAll('.emergency-card p').forEach((el, index) => { el.textContent = contactDescriptions[index] })
    doc.querySelectorAll('.pay-card p').forEach(el => {
      if (/GCash, Maya/.test(el.textContent)) el.textContent = 'Confirm accepted e-wallets and the verified payment details with the office before paying.'
      if (/settle payments directly/.test(el.textContent)) el.textContent = 'Log in to view your balance, invoices, and available payment options.'
    })
    const font = 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
    const contactSection = doc.querySelector('.emergency-section')
    const faqSection = doc.querySelector('.faq-section')
    if (contactSection && faqSection) {
      const contactItems = doc.createElement('div')
      contactItems.id = 'contact'
      contactItems.className = 'faq-contact-items'
      contactItems.append(...contactSection.children)
      faqSection.append(contactItems)
      contactSection.remove()
    }
    return { html: doc.body.innerHTML, css, font }
  }, [account, sampleUrl])
  return <div className="blue-reference-landing" onClick={event => {
    const link = event.target.closest('a')
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const href = link.getAttribute('href')
    if (href?.startsWith('/')) { event.preventDefault(); navigate(href) }
  }}>
    <link rel="stylesheet" href={content.font}/>
    <style>{`@scope (.blue-reference-landing) { ${content.css}\n:scope{font-family:'Plus Jakarta Sans',sans-serif;color:var(--text);background:var(--white);line-height:1.6} h1,h2,h3,h4,h5{letter-spacing:normal} a{color:inherit} .nav-logo img{width:220px;height:auto;max-height:72px;object-fit:contain} nav{height:auto;min-height:76px} .nav-logo{max-width:42%;flex-shrink:0} .nav-logo img{max-width:100%} .faq-item[open] .faq-a{display:block}.faq-q{list-style:none}.faq-q::-webkit-details-marker{display:none}.faq-item[open]{background:var(--teal-light)} .ticker-inner{animation:none;white-space:normal} section[id]{scroll-margin-top:90px} a:focus-visible,summary:focus-visible{outline:3px solid var(--teal);outline-offset:4px} @media(max-width:600px){nav{padding:8px 16px;gap:10px;flex-wrap:wrap}.nav-actions{gap:6px}.nav-actions a{padding:8px 12px;font-size:12px}.nav-logo img{width:180px}} @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}} }`}</style>
    <div dangerouslySetInnerHTML={{ __html: content.html }}/>
  </div>
}
