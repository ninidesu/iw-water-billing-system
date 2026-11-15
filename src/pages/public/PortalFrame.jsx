import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import './portal.css'
import '../../customer-theme.css'
import { CustomerSiteHeader, CustomerSiteFooter } from '../../components/CustomerBrandFrame.jsx'

export function PortalFrame({children}) {
  const location=useLocation()
  useEffect(()=>{
    if(location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0,0)
  },[location.pathname,location.hash])
  return <div className="reference-portal customer-brand-pages"><CustomerSiteHeader/><main>{children}</main><CustomerSiteFooter/></div>
}

export function PublicPage({title,intro,children}){
  return <PortalFrame><div className="page"><div className="w"><h1>{title}</h1><p className="lede">{intro}</p>{children}</div></div></PortalFrame>
}

export function AuthTabs(){
  return <nav className="auth-tabs" aria-label="Login options"><NavLink to="/login">Log in</NavLink><NavLink to="/register">Create a login</NavLink></nav>
}
