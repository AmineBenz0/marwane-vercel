import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AlertCenter from './AlertCenter';
import { get, patch } from '../services/api';

vi.mock('../services/api', () => ({ get: vi.fn(), patch: vi.fn() }));

describe('AlertCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((url) => url === '/alerts'
      ? Promise.resolve([{ id_alerte: 3, titre: 'Paiement en retard', message: 'Transaction échue.' }])
      : Promise.resolve({ unread_count: 3 }));
    patch.mockResolvedValue({});
  });

  it('shows unread alerts and marks them read', async () => {
    render(<AlertCenter />);
    expect(await screen.findByText('3')).toBeVisible();
    fireEvent.click(await screen.findByLabelText('Ouvrir les alertes'));
    expect(await screen.findByText('Paiement en retard')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lu' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/alerts/3/read'));
    await waitFor(() => expect(screen.queryByText('Paiement en retard')).not.toBeInTheDocument());
  });

  it('falls back to the loaded alert count when the summary is unavailable', async () => {
    get.mockImplementation((url) => url === '/alerts'
      ? Promise.resolve([{ id_alerte: 4, titre: 'Alerte de secours', message: 'Compteur local.' }])
      : Promise.reject(new Error('summary unavailable')));
    render(<AlertCenter />);
    expect(await screen.findByText('1')).toBeVisible();
  });

  it('keeps an alert visible when marking it read fails', async () => {
    patch.mockRejectedValueOnce(new Error('network error'));
    render(<AlertCenter />);
    fireEvent.click(await screen.findByLabelText('Ouvrir les alertes'));
    expect(await screen.findByText('Paiement en retard')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lu' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/alerts/3/read'));
    expect(screen.getByText('Paiement en retard')).toBeVisible();
  });

  it('offers due promise notifications and lets users open the matching sale', async () => {
    get.mockImplementation((url) => {
      if (url === '/alerts') return Promise.resolve([]);
      if (url === '/alerts/summary') return Promise.resolve({ unread_count: 0 });
      return Promise.resolve([{ id_transaction: 42, nom_client: 'Client B', quantite_reservee: 120, quantite_en_attente: 300, date_livraison_prevue: '2026-10-26' }]);
    });
    render(<AlertCenter />);
    fireEvent.click(await screen.findByLabelText('Ouvrir les alertes'));
    const link = await screen.findByRole('link', { name: 'Stock prêt à compléter' });
    expect(link).toHaveAttribute('href', '/transactions/42?from=deliveries');
    expect(screen.getByText('Client B · Vente #42 · 120 œufs')).toBeVisible();
  });
});
