import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import TransactionDetail from './TransactionDetail';
import { get, post, del, patch } from '../../services/api';

vi.mock('../../services/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }));
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '7' }), useLocation: () => ({ search: '' }), useNavigate: () => navigateMock }));
vi.mock('../../hooks/useNotification', () => ({ default: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../components/PaiementForm', () => ({ default: () => null }));
vi.mock('../../components/PaiementForm/MultiPaiementForm', () => ({ default: () => null }));
const sale = {
  id_transaction: 7, id_client: 1, id_produit: 1, id_batiment: 1,
  est_actif: true, est_promesse: true, allocation_automatique: true,
  quantite_reservee: 300, quantite: 1000, quantite_couverte: 900, quantite_completee: 600, quantite_en_attente: 400,
  prix_unitaire: 1.5, montant_total: 1500, montant_paye: 1500, montant_restant: 0,
  statut_paiement: 'paye', pourcentage_paye: 100, date_transaction: '2026-10-25',
  date_livraison_prevue: '2026-10-26', repartition_stock: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async path => {
    if (path === '/transactions/7') return sale;
    if (path === '/paiements/transaction/7/statut') return sale;
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Oeufs - Moyen' }];
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client payé' }];
    if (path === '/paiements') return [{ id_paiement: 15, id_transaction: 7, date_paiement: '2026-10-25', montant: 1500, type_paiement: 'cash', statut: 'valide' }];
    if (path === '/transactions/7/completion-history') return [];
    return [];
  });
});
afterEach(cleanup);

it('shows reserved stock on a paid deferred sale without presenting it as delivered', async () => {
  render(<TransactionDetail />);
  expect(await screen.findByRole('heading', { name: 'Vente n° 7 · Client payé' })).toBeVisible();
  expect(screen.getByText('Vendue le 25/10/26')).toBeVisible();
  expect(screen.getByText('Déjà fournis')).toBeVisible();
  expect(screen.getByText('600 œufs')).toBeVisible();
  expect(screen.getByText('300 œufs')).toBeVisible();
  expect(screen.getByText('100 œufs')).toBeVisible();
  expect(screen.queryByText('Stock partiellement réservé')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Historique du stock et des modifications/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /Compléter avec le stock disponible/i })).toBeVisible();
  expect(screen.queryByRole('dialog', { name: /Compléter la livraison/i })).not.toBeInTheDocument();
});

it('keeps canceled sale payments visible as read-only history', async () => {
  get.mockImplementation(async path => {
    if (path === '/transactions/7') return { ...sale, est_actif: false, est_promesse: false };
    if (path === '/paiements/transaction/7/statut') return sale;
    if (path === '/produits') return [{ id_produit: 1, nom_produit: 'Oeufs - Moyen' }];
    if (path === '/clients') return [{ id_client: 1, nom_client: 'Client payé' }];
    if (path === '/paiements') return [{ id_paiement: 15, id_transaction: 7, date_paiement: '2026-10-25', montant: 1500, type_paiement: 'cash', statut: 'annule' }];
    return [];
  });

  render(<TransactionDetail />);

  expect(await screen.findByText('Vente annulée')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Paiements enregistrés' })).toBeVisible();
  expect(await screen.findByText(/Annulé/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Ajouter un paiement' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Modifier le paiement' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Supprimer le paiement' })).not.toBeInTheDocument();
});

it('explains unavailable completion and keeps payment separate from stock', async () => {
  const original = get.getMockImplementation();
  get.mockImplementation(path => path === '/transactions/7'
    ? Promise.resolve({ ...sale, quantite_reservee: 0 }) : original(path));
  render(<TransactionDetail />);
  expect(await screen.findByRole('button', { name: /Compléter avec le stock disponible/i })).toBeDisabled();
  expect(screen.getByText('Aucun stock réservé disponible pour compléter cette vente.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Ajouter un paiement' })).not.toBeInTheDocument();
});

it('shows a purchase and outstanding balance without sale stock controls', async () => {
  const original = get.getMockImplementation();
  get.mockImplementation(path => {
    if (path === '/transactions/7') return Promise.resolve({ ...sale, id_client: null, id_fournisseur: 2, est_promesse: false });
    if (path === '/fournisseurs') return Promise.resolve([{ id_fournisseur: 2, nom_fournisseur: 'Fournisseur local' }]);
    if (path === '/paiements/transaction/7/statut') return Promise.resolve({ montant_paye: 500, montant_restant: 1000, statut_paiement: 'partiel' });
    return original(path);
  });
  render(<TransactionDetail />);
  expect(await screen.findByRole('heading', { name: 'Achat n° 7 · Fournisseur local' })).toBeVisible();
  expect(screen.getByText('Reste à payer')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ajouter un paiement' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Quantités à fournir' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Autres actions' })).toBeVisible();
});

it('preserves server proposal and concurrency guards when completing reserved stock', async () => {
  const original = get.getMockImplementation();
  get.mockImplementation(path => path === '/transactions/7/completion'
    ? Promise.resolve({ quantite_proposee: 300, quantite_couverte: 900, empreinte_stock: 'stock-fingerprint', repartition_stock: [] })
    : original(path));
  post.mockResolvedValue({});
  render(<TransactionDetail />);
  fireEvent.click(await screen.findByRole('button', { name: /Compléter avec le stock disponible/i }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmer' })); });
  expect(post).toHaveBeenCalledWith('/transactions/7/completion', {
    quantite: 300, quantite_couverte_attendue: 900, empreinte_stock: 'stock-fingerprint',
  });
});

it('shows the latest payments first and expands older history on request', async () => {
  const original = get.getMockImplementation();
  get.mockImplementation(path => path === '/paiements' ? Promise.resolve([1, 2, 3, 4].map(id => ({
    id_paiement: id, date_paiement: `2026-10-${20 + id}`, montant: id * 100,
    type_paiement: 'virement', statut: 'valide', reference_virement: `REFERENCE-${id}`,
  }))) : original(path));
  render(<TransactionDetail />);
  expect(await screen.findByText('Référence : REFERENCE-4')).toBeVisible();
  expect(screen.queryByText('Référence : REFERENCE-1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voir tous les paiements (4)' }));
  expect(screen.getByText('Référence : REFERENCE-1')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Voir les 3 derniers paiements' }));
  expect(screen.queryByText('Référence : REFERENCE-1')).not.toBeInTheDocument();
});

it('keeps a closed remainder distinct from quantities actually supplied', async () => {
  const original = get.getMockImplementation();
  get.mockImplementation(path => path === '/transactions/7' ? Promise.resolve({
    ...sale, quantite_en_attente: 0, quantite_annulee: 400, quantite_reservee: 0,
  }) : original(path));
  render(<TransactionDetail />);
  expect(await screen.findByText('Reste clôturé')).toBeVisible();
  expect(screen.getByText('600 œufs')).toBeVisible();
  expect(screen.getByText('Quantité annulée : 400 œufs')).toBeVisible();
  expect(screen.queryByText('Quantité entièrement fournie')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Compléter avec le stock disponible/i })).not.toBeInTheDocument();
});

it('opens the existing transaction editor from the details menu', async () => {
  render(<TransactionDetail />);
  fireEvent.click(await screen.findByRole('button', { name: 'Autres actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Modifier la transaction' }));
  expect(await screen.findByRole('dialog', { name: 'Modifier la transaction n° 7' })).toBeVisible();
  expect(navigateMock).not.toHaveBeenCalled();
});

it('requires confirmation before removing an ordinary transaction', async () => {
  const original = get.getMockImplementation();
  get.mockImplementation(path => path === '/transactions/7' ? Promise.resolve({ ...sale, est_promesse: false }) : original(path));
  del.mockResolvedValue({});
  render(<TransactionDetail />);
  fireEvent.click(await screen.findByRole('button', { name: 'Autres actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Retirer du registre' }));
  expect(del).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retirer du registre' })));
  expect(del).toHaveBeenCalledExactlyOnceWith('/transactions/7');
});

it('offers reactivation for an inactive purchase', async () => {
  const original = get.getMockImplementation();
  get.mockImplementation(path => path === '/transactions/7' ? Promise.resolve({ ...sale, est_actif: false, id_client: null, id_fournisseur: 2, est_promesse: false }) : original(path));
  patch.mockResolvedValue({});
  render(<TransactionDetail />);
  fireEvent.click(await screen.findByRole('button', { name: 'Autres actions' }));
  expect(screen.queryByRole('menuitem', { name: 'Modifier la transaction' })).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Réactiver l’achat' })));
  expect(patch).toHaveBeenCalledExactlyOnceWith('/transactions/7/reactivate', {});
});
