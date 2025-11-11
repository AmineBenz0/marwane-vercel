/**
 * Composant principal de l'application.
 * 
 * Configure toutes les routes de l'application avec react-router-dom :
 * - /login : Page de connexion (publique)
 * - /dashboard : Dashboard (protégée)
 * - /transactions : Transactions (protégée)
 * - /transactions/:id : Détails d'une transaction (protégée)
 * - /clients : Clients (protégée)
 * - /fournisseurs : Fournisseurs (protégée)
 * - /produits : Produits (protégée)
 * - /caisse : Caisse (protégée)
 * - /audit : Audit (protégée, admin uniquement)
 * 
 * Redirection par défaut : /login
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import NotificationProvider from './components/NotificationProvider';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import TransactionDetail from './pages/Transactions/TransactionDetail';
import Clients from './pages/Clients';
import Fournisseurs from './pages/Fournisseurs';
import Produits from './pages/Produits';
import Caisse from './pages/Caisse';
import Audit from './pages/Audit';

function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
        {/* Route publique : Login */}
        <Route path="/login" element={<Login />} />

        {/* Routes protégées : nécessitent une authentification */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Transactions />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <TransactionDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Clients />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/fournisseurs"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Fournisseurs />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/produits"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Produits />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/caisse"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Caisse />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Route protégée admin : nécessite le rôle admin */}
        <Route
          path="/audit"
          element={
            <AdminProtectedRoute>
              <AppLayout>
                <Audit />
              </AppLayout>
            </AdminProtectedRoute>
          }
        />

        {/* Redirection par défaut : vers /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Route catch-all : redirige vers /login pour les routes inconnues */}
        <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;

