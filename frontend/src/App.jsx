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

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import NotificationProvider from './components/NotificationProvider';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Login from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const TransactionDetail = lazy(() => import('./pages/Transactions/TransactionDetail'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientProfile = lazy(() => import('./pages/Clients/ClientProfile'));
const Fournisseurs = lazy(() => import('./pages/Fournisseurs'));
const FournisseurProfile = lazy(() => import('./pages/Fournisseurs/FournisseurProfile'));
const Produits = lazy(() => import('./pages/Produits'));
const ProduitDetail = lazy(() => import('./pages/Produits/ProduitDetail'));
const Caisse = lazy(() => import('./pages/Caisse'));
const LettresCreditList = lazy(() => import('./pages/LettresCredit/LettresCreditList'));
const LettreCreditDetail = lazy(() => import('./pages/LettresCredit/LettreCreditDetail'));
const ProductionDashboard = lazy(() => import('./pages/Production/ProductionDashboard'));
const BatimentProductionPage = lazy(() => import('./pages/Production/BatimentProductionPage'));
const ChargesList = lazy(() => import('./pages/Charges/ChargesList'));
const CompteBancaireList = lazy(() => import('./pages/ComptesBancaires/CompteBancaireList'));
const CalendarView = lazy(() => import('./pages/Calendar/CalendarView'));
const TasksList = lazy(() => import('./pages/Tasks/TasksList'));
const ReceivablesPage = lazy(() => import('./pages/Finance/FinancialLedgerPage').then((module) => ({ default: module.ReceivablesPage })));
const PayablesPage = lazy(() => import('./pages/Finance/FinancialLedgerPage').then((module) => ({ default: module.PayablesPage })));
const ProductBomsPage = lazy(() => import('./pages/Production/ProductBomsPage'));
const MonthlyReportPage = lazy(() => import('./pages/Reports/MonthlyReportPage'));

function PageLoading() {
  return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}><CircularProgress aria-label="Chargement de la page" /></Box>;
}

function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<PageLoading />}>
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
          path="/calendar"
          element={
            <ProtectedRoute>
              <AppLayout>
                <CalendarView />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <AppLayout>
                <TasksList />
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
          path="/creances"
          element={
            <ProtectedRoute>
              <AppLayout><ReceivablesPage /></AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dettes"
          element={
            <ProtectedRoute>
              <AppLayout><PayablesPage /></AppLayout>
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
          path="/produits/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProduitDetail />
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
                <ProductionDashboard />
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
          path="/production/boms"
          element={
            <ProtectedRoute>
              <AppLayout><ProductBomsPage /></AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/production/batiment/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <BatimentProductionPage />
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
          path="/rapports/mensuel"
          element={
            <ProtectedRoute>
              <AppLayout><MonthlyReportPage /></AppLayout>
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
          path="/lettres-credit/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <LettreCreditDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Redirection par défaut : vers /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Route catch-all : redirige vers /login pour les routes inconnues */}
        <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;
