import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Sidebar from './Sidebar.jsx'

export default function AdminLayout() {
  const { role } = useAuth()
  if (role && role !== 'admin') {
    return <Navigate to={role === 'cashier' ? '/cashier' : '/customer/dashboard'} replace />
  }
  return <Sidebar area="admin" />
}
