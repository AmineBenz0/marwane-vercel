/**
 * Tests simples pour FournisseurProfile
 * 
 * Tests rapides pour vérifier :
 * - Import du composant
 * - Structure de base
 * - Routes configurées
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import FournisseurProfile from './FournisseurProfile';
import { get } from '../../services/api';

// Mock des dépendances
vi.mock('../../services/api', () => ({
  get: vi.fn(),
}));

vi.mock('../../hooks/useNotification', () => ({
  default: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
  };
});

// Mock des composants Material-UI
vi.mock('@mui/material', () => ({
  Box: ({ children, ...props }) => <div data-testid="box" {...props}>{children}</div>,
  Typography: ({ children, ...props }) => <div data-testid="typography" {...props}>{children}</div>,
  Button: ({ children, ...props }) => <button data-testid="button" {...props}>{children}</button>,
  Chip: ({ label, ...props }) => <span data-testid="chip" {...props}>{label}</span>,
  Grid: ({ children, ...props }) => <div data-testid="grid" {...props}>{children}</div>,
  Card: ({ children, ...props }) => <div data-testid="card" {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div data-testid="card-content" {...props}>{children}</div>,
  CircularProgress: () => <div data-testid="circular-progress">Loading...</div>,
  Alert: ({ children, ...props }) => <div data-testid="alert" {...props}>{children}</div>,
  useTheme: () => ({
    palette: {
      primary: { main: '#1976d2' },
    },
  }),
  Divider: () => <hr data-testid="divider" />,
}));

vi.mock('@mui/icons-material', () => ({
  ArrowBack: () => <span data-testid="arrow-back-icon">←</span>,
  Edit: () => <span data-testid="edit-icon">✏️</span>,
  Add: () => <span data-testid="add-icon">+</span>,
  FileDownload: () => <span data-testid="file-download-icon">⬇️</span>,
  AttachMoney: () => <span data-testid="attach-money-icon">💰</span>,
  Receipt: () => <span data-testid="receipt-icon">🧾</span>,
  TrendingUp: () => <span data-testid="trending-up-icon">📈</span>,
}));

vi.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
}));

vi.mock('../../components/StatCard/StatCard', () => ({
  default: ({ title, value }) => (
    <div data-testid="stat-card">
      <span data-testid="stat-title">{title}</span>
      <span data-testid="stat-value">{value}</span>
    </div>
  ),
}));

vi.mock('../../components/DataGrid/DataGrid', () => ({
  default: ({ rows, columns }) => (
    <div data-testid="data-grid">
      <div data-testid="rows-count">{rows?.length || 0}</div>
      <div data-testid="columns-count">{columns?.length || 0}</div>
    </div>
  ),
}));

describe('FournisseurProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait importer le composant sans erreur', () => {
    expect(FournisseurProfile).toBeDefined();
    expect(typeof FournisseurProfile).toBe('function');
  });

  it('devrait afficher un loader pendant le chargement', async () => {
    // Mock de l'API qui prend du temps
    get.mockImplementation(() => new Promise(() => {}));

    render(
      <BrowserRouter>
        <FournisseurProfile />
      </BrowserRouter>
    );

    expect(screen.getByTestId('circular-progress')).toBeInTheDocument();
  });

  it('devrait appeler l\'API pour récupérer le profil', async () => {
    const mockProfileData = {
      fournisseur: {
        id_fournisseur: 1,
        nom_fournisseur: 'Test Fournisseur',
        est_actif: true,
      },
      statistiques: {
        total_transactions: 10,
        montant_total_achats: 5000,
        montant_moyen_transaction: 500,
      },
      transactions: [],
    };

    const mockStatsMensuelles = {
      data: [
        { mois: '2024-01', montant: 1000, nb_transactions: 2 },
        { mois: '2024-02', montant: 2000, nb_transactions: 4 },
      ],
    };

    get
      .mockResolvedValueOnce(mockProfileData)
      .mockResolvedValueOnce(mockStatsMensuelles);

    render(
      <BrowserRouter>
        <FournisseurProfile />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/fournisseurs/1/profile', {
        params: { limit: 1000 },
      });
      expect(get).toHaveBeenCalledWith('/fournisseurs/1/stats-mensuelles', {
        params: { periode: 6 },
      });
    });
  });

  it('devrait afficher le nom du fournisseur une fois chargé', async () => {
    const mockProfileData = {
      fournisseur: {
        id_fournisseur: 1,
        nom_fournisseur: 'Test Fournisseur',
        est_actif: true,
      },
      statistiques: {
        total_transactions: 10,
        montant_total_achats: 5000,
        montant_moyen_transaction: 500,
      },
      transactions: [],
    };

    const mockStatsMensuelles = {
      data: [],
    };

    get
      .mockResolvedValueOnce(mockProfileData)
      .mockResolvedValueOnce(mockStatsMensuelles);

    render(
      <BrowserRouter>
        <FournisseurProfile />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Fournisseur')).toBeInTheDocument();
    });
  });

  it('devrait afficher les statistiques une fois chargées', async () => {
    const mockProfileData = {
      fournisseur: {
        id_fournisseur: 1,
        nom_fournisseur: 'Test Fournisseur',
        est_actif: true,
      },
      statistiques: {
        total_transactions: 10,
        montant_total_achats: 5000,
        montant_moyen_transaction: 500,
      },
      transactions: [],
    };

    const mockStatsMensuelles = {
      data: [],
    };

    get
      .mockResolvedValueOnce(mockProfileData)
      .mockResolvedValueOnce(mockStatsMensuelles);

    render(
      <BrowserRouter>
        <FournisseurProfile />
      </BrowserRouter>
    );

    await waitFor(() => {
      const statCards = screen.getAllByTestId('stat-card');
      expect(statCards.length).toBeGreaterThan(0);
    });
  });

  it('devrait afficher un message d\'erreur en cas d\'échec', async () => {
    get.mockRejectedValueOnce(new Error('Erreur API'));

    render(
      <BrowserRouter>
        <FournisseurProfile />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('alert')).toBeInTheDocument();
    });
  });

  it('devrait afficher un message si le fournisseur n\'existe pas', async () => {
    get.mockResolvedValueOnce({
      fournisseur: null,
      statistiques: null,
      transactions: [],
    });

    render(
      <BrowserRouter>
        <FournisseurProfile />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Fournisseur introuvable/i)).toBeInTheDocument();
    });
  });
});

