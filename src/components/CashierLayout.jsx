import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Sidebar from './Sidebar.jsx'

export default function CashierLayout() {
  const { role } = useAuth()
  if (role && role !== 'cashier') {
    return <Navigate to={role === 'admin' ? '/admin' : '/customer/dashboard'} replace />
  }
  return <Sidebar area="cashier" />
}
