/**
 * Composant principal de l'application.
 * 
 * Configure toutes les routes de l'application avec react-router-dom :
 * - /login : Page de connexion (publique)
 * - /dashboard : Dashboard (protégée)
 * - /transactions : Transactions (protégée)
 * - /transactions/:id : Détails d'une transaction (protégée)
 * - /clients : Clients (protégée)
 * - /clients/:id/profile : Profil client (protégée)
 * - /fournisseurs : Fournisseurs (protégée)
 * - /fournisseurs/:id/profile : Profil fournisseur (protégée)
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
import ClientProfile from './pages/Clients/ClientProfile';
import Fournisseurs from './pages/Fournisseurs';
import FournisseurProfile from './pages/Fournisseurs/FournisseurProfile';
import Produits from './pages/Produits';
import Caisse from './pages/Caisse';
import Audit from './pages/Audit';
import LettresCreditList from './pages/LettresCredit/LettresCreditList';
import LettreCreditDetail from './pages/LettresCredit/LettreCreditDetail';
import LCFormPage from './pages/LettresCredit/LCFormPage';
import CederLCPage from './pages/LettresCredit/CederLCPage';
import ProductionList from './pages/Production/ProductionList';
import ProductionDashboard from './pages/Production/ProductionDashboard';
import ChargesList from './pages/Charges/ChargesList';
import CompteBancaireList from './pages/ComptesBancaires/CompteBancaireList';

function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
          path="/clients/:id/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ClientProfile />
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
          path="/fournisseurs/:id/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <FournisseurProfile />
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
        <Route
          path="/production"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProductionList />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/production/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProductionDashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/charges"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ChargesList />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/comptes-bancaires"
          element={
            <ProtectedRoute>
              <AppLayout>
                <CompteBancaireList />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lettres-credit"
          element={
            <ProtectedRoute>
              <AppLayout>
                <LettresCreditList />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lettres-credit/nouvelle"
          element={
            <ProtectedRoute>
              <AppLayout>
                <LCFormPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lettres-credit/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <LettreCreditDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lettres-credit/:id/modifier"
          element={
            <ProtectedRoute>
              <AppLayout>
                <LCFormPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lettres-credit/:id/ceder"
          element={
            <ProtectedRoute>
              <AppLayout>
                <CederLCPage />
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

