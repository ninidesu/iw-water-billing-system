import { Link } from 'react-router-dom'
import '../customer-theme.css'
const sections = [['Services','services'],['Ways to pay','payment-options'],['New connection','new-connection'],['Service advisories','advisories'],['Contact','contact'],['FAQs','faqs']]
export function CustomerSiteHeader() {
  return <header className="customer-site-header"><div className="customer-site-bar"><Link className="customer-site-logo" to="/" aria-label="Isabel Water home"><img src="/isabel-water-logo.png" alt="Isabel Water" width="220" height="73"/></Link><nav aria-label="Main navigation">{sections.map(([label,id])=><Link key={id} to={`/#${id}`}>{label}</Link>)}</nav></div></header>
}
export function CustomerSiteFooter() {
  return <footer className="customer-site-footer"><div className="customer-footer-grid"><div><Link className="customer-footer-brand" to="/"><img src="/iw-logo.png" alt="" width="36" height="36"/>Isabel Water</Link><p>Water connections, meter readings, billing, and service requests online and at the office.</p></div><div><h2>Billing</h2><Link to="/customer/pay">Pay your bill</Link><Link to="/customer/bills">View invoices</Link><Link to="/pay">Payment options</Link></div><div><h2>Services</h2><Link to="/apply">New connection</Link><Link to="/reconnect">Connection changes</Link><Link to="/concerns">Report a concern</Link><Link to="/track">Track a request</Link></div><div><h2>Help</h2><Link to="/#faqs">FAQs</Link><Link to="/#contact">Contact the office</Link><Link to="/#advisories">Service advisories</Link></div></div><div className="customer-footer-bottom">© {new Date().getFullYear()} Isabel Water. All rights reserved.</div></footer>
}
