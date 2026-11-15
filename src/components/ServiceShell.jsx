import '../customer-theme.css'
import { CustomerSiteHeader, CustomerSiteFooter } from './CustomerBrandFrame.jsx'

export function ServiceShell({ children, footer }) {
  return <div className="service-site customer-brand-pages">
    <CustomerSiteHeader/>
    <main className="service-main">{children}</main>
    {footer || <CustomerSiteFooter/>}
  </div>
}

export function OfficeContact() {
  const { VITE_OFFICE_ADDRESS: address, VITE_OFFICE_CONTACT: phone, VITE_OFFICE_EMAIL: email } = import.meta.env
  return <aside className="office-contact"><strong>Visit or contact the office</strong>
    {address && <span>{address}</span>}{phone && <a href={'tel:' + phone}>{phone}</a>}
    {email && <a href={'mailto:' + email}>{email}</a>}
    {!address && !phone && !email && <span>Walk-in, phone and email requests use the same application process.</span>}
  </aside>
}
