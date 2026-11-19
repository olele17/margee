import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

import Landing from './pages/Landing';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Subscribe from './pages/Subscribe';
import SuperAdmin from './pages/SuperAdmin';

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
          <Route path="/admin" element={<SuperAdmin />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
