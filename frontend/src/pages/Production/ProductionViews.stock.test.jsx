import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StockSummary } from './ProductionViews';
afterEach(cleanup);
it('shows free and reserved stock, keeps the combined balance in details, and links to ready sales', async () => {
  const view = vi.fn();
  render(<StockSummary available={0} reserved={100} physical={100} onViewReservations={view}
    categories={[{ type_oeuf: 'normal', calibre: 'moyen', label: 'Œufs moyens', available_eggs: 0, reserved_eggs: 100 }]} />);
  expect(screen.getByRole('heading', { name: 'Disponible à la vente' })).toBeVisible();
  expect(screen.getByText('Réservé aux clients')).toBeVisible();
  expect(screen.queryByText('Disponible + réservé')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voir les ventes avec stock réservé' }));
  expect(view).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Détail du stock' }));
  expect(await screen.findByText('Disponible + réservé')).toBeVisible();
  expect(screen.getByRole('table', { name: 'Stock par produit' })).toBeVisible();
});

it('explains a negative balance after outstanding promises', () => {
  render(<StockSummary available={100} reserved={300} physical={400} promisedPending={150} balanceAfterPromises={-50} />);
  expect(screen.getByText('Solde après promesses')).toBeVisible();
  expect(screen.getByText('-50 œufs')).toBeVisible();
  expect(screen.getByText(/c’est la quantité qu’il reste à produire/i)).toBeVisible();
});
