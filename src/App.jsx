import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import CustomerLayout from './pages/customer/CustomerLayout.jsx'
import Accounts from './pages/customer/Accounts.jsx'
import Pay from './pages/customer/Pay.jsx'
import { RequestForm, TrackRequest } from './pages/public/Requests.jsx'
import RoleRedirect from './components/RoleRedirect.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import CashierLayout from './components/CashierLayout.jsx'
import { Loading } from './components/UI.jsx'
import Landing, { WaysToPay } from './pages/public/Landing.jsx'
import Login from './pages/public/Login.jsx'
import { SocialReturn } from './pages/public/SocialSignIn.jsx'
import Register from './pages/public/Register.jsx'
import ResetPassword from './pages/public/ResetPassword.jsx'
import PortalLogin from './pages/admin/PortalLogin.jsx'
import CashierDashboard from './pages/admin/Dashboard.jsx'
import Billing from './pages/admin/Billing.jsx'
import AdminBilling from './pages/admin/AdminBilling.jsx'
import Collection from './pages/admin/Collection.jsx'
import Customers from './pages/admin/Customers.jsx'
import CashierBillPrint, { AdminBillPrint } from './pages/admin/BillPrint.jsx'
import Receipt from './pages/admin/Receipt.jsx'
import AdminDashboard from './pages/admin/Monitoring.jsx'
import Requests from './pages/admin/Requests.jsx'
import ServiceApplications from './pages/admin/ServiceApplications.jsx'
import ConcernsComplaints from './pages/admin/ConcernsComplaints.jsx'
import AdminModule from './pages/admin/AdminModule.jsx'
import RatesCharges from './pages/admin/RatesCharges.jsx'
import CustomerAccount from './pages/admin/CustomerAccount.jsx'
import AddExistingCustomer from './pages/admin/AddExistingCustomer.jsx'
import DelinquentAccounts from './pages/admin/DelinquentAccounts.jsx'
import CustomerDashboard from './pages/customer/Dashboard.jsx'
import MyBills from './pages/customer/MyBills.jsx'
import PaymentHistory from './pages/customer/PaymentHistory.jsx'
import Profile from './pages/customer/Profile.jsx'
import CustomerBillPrint from './pages/customer/BillPrint.jsx'

export function GuestRoute({ children }) {
  const { user, profile, loading, guestFlow } = useAuth()
  if (loading && !guestFlow) return <Loading label="Loading…" />
  if (user && profile && !guestFlow) return <Navigate replace to={profile.role === 'admin' ? '/admin' : profile.role === 'cashier' ? '/cashier' : '/customer/dashboard'} />
  return children
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/pay" element={<WaysToPay />} />
    <Route path="/reconnect" element={<RequestForm key="reconnect" connectionChange />} />
    <Route path="/apply" element={<RequestForm key="application" application />} />
    <Route path="/concerns" element={<RequestForm key="concern" />} />
    <Route path="/track" element={<TrackRequest />} />
    <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
    <Route path="/auth/return" element={<SocialReturn />} />
    <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/portal" element={<GuestRoute><PortalLogin /></GuestRoute>} />
    <Route path="/staff" element={<RoleRedirect />} />
    <Route element={<ProtectedRoute allowedRoles={['admin']} />}><Route path="/admin" element={<AdminLayout />}>
      <Route index element={<AdminDashboard />} />
      <Route path="customers" element={<Customers />} />
      <Route path="customers/:id" element={<CustomerAccount />} />
      <Route path="customers/new" element={<AddExistingCustomer />} />
      <Route path="billing" element={<AdminBilling />} />
      <Route path="collections" element={<Collection />} />
      <Route path="receipts/:id" element={<Receipt />} />
      <Route path="adjustments" element={<AdminModule module="adjustments" />} />
      <Route path="delinquent" element={<DelinquentAccounts />} />
      <Route path="rates" element={<RatesCharges />} />
      <Route path="service-requests" element={<ServiceApplications />} />
      <Route path="concerns" element={<ConcernsComplaints />} />
      <Route path="users-audit" element={<AdminModule module="usersAudit" />} />
      <Route path="settings" element={<AdminModule module="settings" />} />
      <Route path="bills/:id/print" element={<AdminBillPrint />} />
      <Route path="*" element={<Navigate replace to="/admin" />} />
    </Route></Route>
    <Route element={<ProtectedRoute allowedRoles={['cashier']} />}><Route path="/cashier" element={<CashierLayout />}>
      <Route index element={<AdminDashboard area="cashier" />} />
      <Route path="dashboard" element={<Navigate replace to="/cashier" />} />
      <Route path="billing" element={<Billing />} />
      <Route path="collection" element={<Collection />} />
      <Route path="collections" element={<Navigate replace to="/cashier/collection" />} />
      <Route path="customers" element={<Customers />} />
      <Route path="customers/new" element={<AddExistingCustomer />} />
      <Route path="customers/:id" element={<CustomerAccount />} />
      <Route path="service-requests" element={<ServiceApplications />} />
      <Route path="concerns" element={<ConcernsComplaints />} />
      <Route path="requests" element={<Navigate replace to="/cashier/service-requests" />} />
      <Route path="bills/:id/print" element={<CashierBillPrint />} />
      <Route path="receipts/:id" element={<Receipt />} />
      <Route path="*" element={<Navigate replace to="/cashier" />} />
    </Route></Route>
    <Route element={<ProtectedRoute allowedRoles={['customer']} />}><Route path="/customer" element={<CustomerLayout />}>
      <Route path="accounts" element={<Accounts />} /><Route path="pay" element={<Pay />} />
      <Route index element={<Navigate replace to="dashboard" />} />
      <Route path="dashboard" element={<CustomerDashboard />} />
      <Route path="bills" element={<MyBills />} />
      <Route path="payments" element={<PaymentHistory />} />
      <Route path="profile" element={<Profile />} />
      <Route path="bills/:id/print" element={<CustomerBillPrint />} />
    </Route></Route>
    <Route path="*" element={<RoleRedirect />} />
  </Routes>
}
