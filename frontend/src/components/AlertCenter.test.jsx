import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AlertCenter from './AlertCenter';
import { get, patch } from '../services/api';

vi.mock('../services/api', () => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../utils/businessDate', () => ({ getBusinessDateInput: () => '2026-11-16' }));

const stockReady = {
  id_transaction: 42,
  nom_client: 'Client livraison',
  date_livraison_prevue: '2026-11-20',
  quantite_en_attente: 5,
  quantite_reservee: 2,
};

describe('AlertCenter', () => {
  let deliveries;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    deliveries = [];
    get.mockImplementation(async (url) => {
      if (url === '/alerts') {
        return [{ id_alerte: 3, titre: 'Paiement en retard', message: 'Transaction échue.' }];
      }
      if (url === '/transactions/deferred-sales') return deliveries;
      return { unread_count: 3 };
    });
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

  it('includes ready and due deliveries in the unread count and links to order details', async () => {
    deliveries = [
      stockReady,
      { ...stockReady, id_transaction: 43, date_livraison_prevue: '2026-11-16', quantite_reservee: 0 },
      { ...stockReady, id_transaction: 44, quantite_reservee: 0 },
      { ...stockReady, id_transaction: 45, quantite_en_attente: 0 },
    ];
    render(<AlertCenter userId={1} />);

    expect(await screen.findByText('5', { exact: true })).toBeVisible();
    fireEvent.click(screen.getByLabelText('Ouvrir les alertes'));
    const ready = await screen.findByRole('link', { name: 'Stock prêt à compléter' });
    expect(ready).toHaveAttribute('href', '/transactions/42?from=deliveries');
    expect(screen.getByText(/2 prêts · 3 à produire/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Livraison à traiter' }))
      .toHaveAttribute('href', '/transactions/43?from=deliveries');
    expect(screen.queryByText(/Vente #4[45]/)).not.toBeInTheDocument();
  });

  it('keeps a dismissal across reloads for that account and shows newly reserved stock', async () => {
    deliveries = [stockReady];
    const open = (userId) => {
      const view = render(<AlertCenter userId={userId} />);
      fireEvent.click(screen.getByLabelText('Ouvrir les alertes'));
      return view;
    };
    const beforeReload = open(1);
    const ready = await screen.findByRole('link', { name: 'Stock prêt à compléter' });
    fireEvent.click(within(ready.closest('li')).getByRole('button', { name: 'Lu' }));
    expect(screen.queryByRole('link', { name: 'Stock prêt à compléter' })).not.toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
    beforeReload.unmount();

    const afterReload = open(1);
    expect(await screen.findByText('Paiement en retard')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Stock prêt à compléter' })).not.toBeInTheDocument();
    afterReload.unmount();

    const otherAccount = open(2);
    expect(await screen.findByRole('link', { name: 'Stock prêt à compléter' })).toBeVisible();
    otherAccount.unmount();

    deliveries = [{ ...stockReady, quantite_reservee: 4 }];
    open(1);
    expect(await screen.findByText(/4 prêts · 1 à produire/)).toBeVisible();
  });
});
