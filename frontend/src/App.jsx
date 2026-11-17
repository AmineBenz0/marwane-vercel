import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import NotificationProvider from './components/NotificationProvider';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Login from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const DeferredSalesPage = lazy(() => import('./pages/Transactions/DeferredSalesPage'));
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
const GlobalOverviewPage = lazy(() => import('./pages/Production/GlobalOverviewPage'));
const BatimentProductionPage = lazy(() => import('./pages/Production/BatimentProductionPage'));
const LotsManagementPage = lazy(() => import('./pages/Production/LotsManagementPage'));
const ChargesList = lazy(() => import('./pages/Charges/ChargesList'));
const CompteBancaireList = lazy(() => import('./pages/ComptesBancaires/CompteBancaireList'));
const CalendarView = lazy(() => import('./pages/Calendar/CalendarView'));
const TasksList = lazy(() => import('./pages/Tasks/TasksList'));
const ReceivablesPage = lazy(() => import('./pages/Finance/FinancialLedgerPage').then((module) => ({ default: module.ReceivablesPage })));
const PayablesPage = lazy(() => import('./pages/Finance/FinancialLedgerPage').then((module) => ({ default: module.PayablesPage })));
const MonthlyReportPage = lazy(() => import('./pages/Reports/MonthlyReportPage'));

function PageLoading() {
  return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}><CircularProgress aria-label="Chargement de la page" /></Box>;
}

function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Suspense fallback={<PageLoading />}>
                      <Outlet />
                    </Suspense>
                  </AppLayout>
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/tasks" element={<TasksList />} />
              <Route path="/livraisons-a-suivre" element={<DeferredSalesPage />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/transactions/:id" element={<TransactionDetail />} />
              <Route path="/creances" element={<ReceivablesPage />} />
              <Route path="/dettes" element={<PayablesPage />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/:id/profile" element={<ClientProfile />} />
              <Route path="/fournisseurs" element={<Fournisseurs />} />
              <Route path="/fournisseurs/:id/profile" element={<FournisseurProfile />} />
              <Route path="/produits" element={<Produits />} />
              <Route path="/produits/:id" element={<ProduitDetail />} />
              <Route path="/caisse" element={<Caisse />} />
              <Route path="/production" element={<ProductionDashboard />} />
              <Route path="/production/dashboard" element={<ProductionDashboard />} />
              <Route path="/production/suivi-global" element={<GlobalOverviewPage />} />
              <Route path="/production/lots" element={<LotsManagementPage />} />
              <Route path="/production/batiment/:id" element={<BatimentProductionPage />} />
              <Route path="/charges" element={<ChargesList />} />
              <Route path="/comptes-bancaires" element={<CompteBancaireList />} />
              <Route path="/rapports/mensuel" element={<MonthlyReportPage />} />
              <Route path="/lettres-credit" element={<LettresCreditList />} />
              <Route path="/lettres-credit/:id" element={<LettreCreditDetail />} />
            </Route>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;
