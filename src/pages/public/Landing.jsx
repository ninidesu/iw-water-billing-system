import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { PortalFrame,PublicPage } from './PortalFrame.jsx'
import ReferenceLanding from './ReferenceLanding.jsx'

const faqs=[
  ['How do I view my water bill?','Log in, open Billing accounts, and enter your Contract Account Number (CAN). Select the account to see invoices, balance, and posted payments.'],
  ['Can two people link the same CAN?','Yes. Each person uses their own login and can link the same CAN to view or pay its bills.'],
  ['How do I apply for a new connection?','Apply online, visit the office, call, or email. Keep your reference and tracking code to check progress and submit requested documents.'],
  ['Do I need to log in to report a leak?','No. Open Report a concern and include the location or nearest landmark. You can send a report without a CAN.'],
]
function PaymentMethods(){
  return <div className="help four">{[
    ['Office counter','Present your CAN or invoice at the service desk.'],
    ['Banks','Ask the office for its accepted bank payment channels.'],
    ['E-wallets','Confirm the biller and account details with the office before paying.'],
    ['Online account','Open your linked account to view the balance and available payment options.'],
  ].map(([title,detail])=><div key={title}><b>{title}</b><span>{detail}</span></div>)}</div>
}
export function WaysToPay(){
  return <PublicPage title="Ways to pay" intro="Keep your Contract Account Number (CAN) handy when paying your bill."><PaymentMethods/>
    <div className="iw-card" style={{marginTop:24}}><h2>Before you pay</h2><ul className="ck"><li>Check your CAN and the amount due.</li><li>Check the due date on your invoice.</li><li>Keep your proof of payment.</li></ul>
      <div className="row"><Link className="btn" to="/customer/pay">Open my account to pay</Link><Link className="btn ghost" to="/concerns" state={{topic:'Billing'}}>Question about a charge</Link></div></div>
  </PublicPage>
}
function SampleStatement() {
  return <figure className="sample-statement" aria-labelledby="sample-title">
    <figcaption>
      <div className="statement-brand"><strong>Isabel Waters</strong><span>Sample e-SOA</span></div>
      <h2 id="sample-title">Statement of Account</h2>
      <div className="statement-period">October 1–31, 2026</div>
    </figcaption>
    <dl className="statement-account"><dt>Contract account number</dt><dd>DEMO-0001</dd></dl>
    <div className="statement-readings" aria-label="Actual meter readings in cubic meters">
      <div><span>Previous</span><strong>128 m³</strong></div>
      <div><span>Current</span><strong>140 m³</strong></div>
      <div><span>Consumption</span><strong>12 m³</strong></div>
    </div>
    <dl className="statement-charges">
      <div><dt>Water charge</dt><dd>₱225.00</dd></div>
      <div><dt>Previous balance</dt><dd>₱0.00</dd></div>
    </dl>
    <div className="statement-total"><div><strong>Amount due</strong><span>Due November 15, 2026</span></div><b>₱225.00</b></div>
  </figure>
}

export default function Landing(){ return <ReferenceLanding/> }

function PreviousLanding(){
  const {user}=useAuth()
  const inbox=user?'/customer/dashboard':'/login'
  const {VITE_OFFICE_ADDRESS:address,VITE_OFFICE_EMAIL:email,VITE_OFFICE_CONTACT:phone,VITE_SERVICE_ADVISORY:advisory}=import.meta.env
  return <PortalFrame><div className="iw-intro"><div className="ripples" aria-hidden="true"><span/><span/><span/></div>
    <div className="w"><div><h1>Pay your bill. Get connected. Report a leak.</h1><p>Manage your water accounts, service applications, and concerns in one place.</p>
    <div className="row"><Link className="btn aq" to={inbox}>{user?'Open my account':'Log in to my account'}</Link>{!user && <Link className="btn ghost" to="/register">Create a login</Link>}</div>
    <Link className="status" to="/#advisories"><span className="dot"/>{advisory?'View the latest service advisory':'View service advisories'}</Link></div>
    <SampleStatement/></div></div>
    <section className="sec"><div className="w"><h2>What do you need today?</h2><div className="tiles">{[
      [inbox,'Pay or view bills','Invoices, balances, and payment history for every account you link.',user?'Open account':'Log in to continue'],
      ['/apply','Apply for a connection','Request service for a home or business.','Start application'],
      ['/concerns','Report a concern','Leak, low pressure, or a billing question. No login required.','Send a report'],
      ['/track','Track a request','Use your reference and tracking code to check progress.','Check status'],
    ].map(([url,title,detail,cta],i)=><Link key={title} className={'tile'+(i===0?' lead':'')} to={url}><h3>{title}</h3><p>{detail}</p><b>{cta} →</b></Link>)}</div></div></section>
    <section className="sec"><div className="w"><h2>Ways to pay</h2><p>Find your CAN on your water bill.</p><PaymentMethods/><div className="row"><Link className="btn" to="/pay">All payment options</Link></div></div></section>
    <section id="advisories" className="sec band"><div className="w"><h2>Service advisories</h2><p>{advisory || 'No advisories are posted here.'}</p></div></section>
    <section className="sec band"><div className="w"><h2>Getting a new connection</h2><div className="steps">{[
      ['Apply online','Provide your property and contact details. Keep your reference and tracking code.'],
      ['Site inspection','The office checks the meter location and pipe route, then prepares an estimate.'],
      ['Pay and connect','Accept the service agreement and settle the approved charges. Use your CAN after installation.'],
    ].map(([title,detail])=><div key={title}><h3>{title}</h3><p>{detail}</p></div>)}</div></div></section>
    <section className="sec" id="faqs"><div className="w cols"><div><h2>Common questions</h2><p>Can't find yours? <Link to="/concerns"><u>Send us a message.</u></Link></p></div><div>{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></div></section>
    <section className="sec band" id="contact"><div className="w"><h2>Reach the office</h2><p>Isabel Waters handles water connections, meter readings, billing, and service requests online and at the office.</p>
    <div className="help"><div className="urgent"><b>Burst pipe or no water</b><Link to="/concerns" state={{topic:'Leak'}}>Report the location or nearest landmark →</Link></div><div><b>Visit</b><span>{address || 'Visit the Isabel Waters customer service desk.'}</span></div><div><b>Call or email</b>{phone && <p><a href={'tel:'+phone}>{phone}</a></p>}{email && <p><a href={'mailto:'+email}>{email}</a></p>}<Link to="/concerns">Send an inquiry →</Link></div></div></div></section>
  </PortalFrame>
}
