import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TransactionForm from './TransactionForm';
import { get, getProduitsParType } from '../../services/api';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../services/api', () => ({ get: vi.fn(), getProduitsParType: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('keeps purchase products when the earlier sales request arrives after opening from a supplier', async () => {
  let finishClient;
  const delayedClient = new Promise(resolve => { finishClient = resolve; });
  get.mockImplementation(async path => path === '/fournisseurs'
    ? [{ id_fournisseur: 6, nom_fournisseur: 'Fournisseur test' }] : []);
  getProduitsParType.mockImplementation(type => type === 'client' ? delayedClient
    : Promise.resolve([{ id_produit: 2, nom_produit: 'Aliment acheté' }]));
  render(<TransactionForm open prefillFournisseurId={6} onClose={vi.fn()} onSubmit={vi.fn()} />);
  await waitFor(() => expect(getProduitsParType).toHaveBeenCalledWith('fournisseur', expect.any(Object)));
  await screen.findByRole('spinbutton', { name: /^Quantite/ });
  await act(async () => { finishClient([{ id_produit: 1, nom_produit: 'Œufs vendus' }]); await delayedClient; });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Produit acheté *' }));
  expect(await screen.findByRole('option', { name: 'Aliment acheté' })).toBeVisible();
  expect(screen.queryByRole('option', { name: 'Œufs vendus' })).not.toBeInTheDocument();
});

it('loads purchase products once when switching from a sale to a purchase', async () => {
  get.mockResolvedValue([]);
  getProduitsParType.mockImplementation(async type => [{ id_produit: 2, nom_produit: type === 'client' ? 'Œufs vendus' : 'Aliment acheté' }]);
  render(<TransactionForm open onClose={vi.fn()} onSubmit={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Achat fournisseur/ }));
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Produit acheté *' }));
  expect(await screen.findByRole('option', { name: 'Aliment acheté' })).toBeVisible();
  expect(getProduitsParType.mock.calls.filter(([type]) => type === 'fournisseur')).toHaveLength(1);
});
