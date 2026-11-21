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
import AdminRoute from './admin/AdminRoute';
import AdminLayout from './admin/AdminLayout';
import AdminLogin from './admin/pages/AdminLogin';
import ComingSoon from './admin/pages/ComingSoon';
import AdminOverview from './admin/pages/Overview';

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
            <Route path="marchands" element={<ComingSoon title="E-commerçants" step={3} icon="ti-building-store" />} />
            <Route path="marchands/:id" element={<ComingSoon title="Fiche e-commerçant" step={3} icon="ti-building-store" />} />
            <Route path="paiements" element={<ComingSoon title="Paiements et abonnements" step={4} icon="ti-credit-card" />} />
            <Route path="plans" element={<AdminRoute permission="plans.view"><ComingSoon title="Plans et tarifs" step={5} icon="ti-tags" /></AdminRoute>} />
            <Route path="parametres" element={<AdminRoute permission="settings.view"><ComingSoon title="Paramètres et équipe" step={6} icon="ti-settings" /></AdminRoute>} />
            <Route path="journal" element={<ComingSoon title="Journal d'activité" step={6} icon="ti-history" />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
