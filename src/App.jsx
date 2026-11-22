import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

import Landing from './pages/Landing';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Subscribe from './pages/Subscribe';
import PaymentReturn from './pages/PaymentReturn';
import AdminRoute from './admin/AdminRoute';
import AdminLayout from './admin/AdminLayout';
import AdminLogin from './admin/pages/AdminLogin';
import AdminOverview from './admin/pages/Overview';
import AdminMerchants from './admin/pages/Merchants';
import AdminMerchantDetail from './admin/pages/MerchantDetail';
import AdminPayments from './admin/pages/Payments';
import AdminPlans from './admin/pages/Plans';
import AdminSettings from './admin/pages/Settings';
import AdminAuditLog from './admin/pages/AuditLog';

import Dashboard from './pages/app/Dashboard';
import Products from './pages/app/Products';
import Sales from './pages/app/Sales';
import Ads from './pages/app/Ads';
import Expenses from './pages/app/Expenses';
import Investments from './pages/app/Investments';
import Settings from './pages/app/Settings';
import Notes from './pages/app/Notes';
import Challenges from './pages/app/Challenges';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/inscription" element={<Signup />} />
          <Route path="/connexion" element={<Login />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
          <Route path="/reinitialiser-mot-de-passe" element={<ResetPassword />} />

          {/* Subscription — logged in but not necessarily active yet */}
          <Route
            path="/abonnement"
            element={
              <ProtectedRoute requireActiveSub={false}>
                <Subscribe />
              </ProtectedRoute>
            }
          />
          {/* Retour de la page de paiement Bictorys */}
          <Route
            path="/abonnement/retour"
            element={
              <ProtectedRoute requireActiveSub={false}>
                <PaymentReturn />
              </ProtectedRoute>
            }
          />

          {/* Private business area — requires active subscription */}
          <Route
            path="/app"
            element={
              <ProtectedRoute requireActiveSub={true}>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="produits" element={<Products />} />
            <Route path="ventes" element={<Sales />} />
            <Route path="pubs" element={<Ads />} />
            <Route path="depenses" element={<Expenses />} />
            <Route path="investissements" element={<Investments />} />
            <Route path="notes" element={<Notes />} />
            <Route path="challenges" element={<Challenges />} />
            <Route path="parametres" element={<Settings />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Platform operator */}
          {/* Espace super admin (séparé de /app) */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminOverview />} />
            <Route path="marchands" element={<AdminMerchants />} />
            <Route path="marchands/:id" element={<AdminMerchantDetail />} />
            <Route path="paiements" element={<AdminPayments />} />
            <Route path="plans" element={<AdminRoute permission="plans.view"><AdminPlans /></AdminRoute>} />
            <Route path="parametres" element={<AdminRoute permission="settings.view"><AdminSettings /></AdminRoute>} />
            <Route path="journal" element={<AdminRoute permission="audit.view"><AdminAuditLog /></AdminRoute>} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
