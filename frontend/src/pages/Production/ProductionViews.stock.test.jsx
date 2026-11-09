import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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


it('keeps the stock breakdown compact and accessible, with readable per-product totals', async () => {
  render(<StockSummary available={1200} reserved={250} physical={1450} categories={[
    { type_oeuf: 'normal', calibre: 'moyen', label: 'Œufs moyens', available_eggs: 1200, reserved_eggs: 250 },
    { type_oeuf: 'casse', calibre: 'moyen', label: 'Œufs cassés', available_eggs: 60, reserved_eggs: 0 },
  ]} />);
  const details = screen.getByRole('button', { name: 'Détail du stock' });
  expect(details).toBeVisible();
  expect(screen.getByText('1 produit')).toBeVisible();
  expect(screen.queryByText('Stock total')).not.toBeInTheDocument();
  fireEvent.click(details);
  const table = await screen.findByRole('table', { name: 'Stock par produit' });
  expect(table).toBeVisible();
  expect(screen.getByRole('rowheader', { name: 'Œufs moyens' })).toBeVisible();
  expect(screen.queryByRole('rowheader', { name: 'Œufs cassés' })).not.toBeInTheDocument();
  expect(screen.getByText('Stock total')).toBeVisible();
  expect(screen.getByText('1 450 œufs')).toBeVisible();
  expect(screen.getByText('Disponible + réservé')).toBeVisible();
  fireEvent.click(details);
  await waitFor(() => expect(screen.queryByText('Stock total')).not.toBeInTheDocument());
});

it('shows movement counts in the daily activity panel without changing the signed quantities', async () => {
  const { DailyActivity } = await import('./ProductionViews');
  render(<DailyActivity movements={[
    { type: 'production', time: '08:30', label: 'Collecte', nom_batiment: 'Bâtiment A', detail: 'Normaux', quantity: 12 },
    { type: 'loss', time: '09:00', label: 'Perdus', nom_batiment: 'Bâtiment B', detail: 'Casse', quantity: 3 },
  ]} />);
  expect(screen.getByRole('button', { name: 'Activité de la journée' })).toBeVisible();
  expect(screen.getByText('2 mouvements')).toBeVisible();
  expect(screen.queryByText('Collecte')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Activité de la journée' }));
  expect(await screen.findByText('Collecte')).toBeVisible();
  expect(screen.getByText('Œufs cassés')).toBeVisible();
  expect(screen.getByText('+12 œufs')).toBeVisible();
  expect(screen.getByText('-3 œufs')).toBeVisible();
  expect(screen.getByText('08:30')).toBeVisible();
});

it('shows the empty daily activity count and preserves the empty state', async () => {
  const { DailyActivity } = await import('./ProductionViews');
  render(<DailyActivity movements={[]} />);
  expect(screen.getByText('0 mouvements')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Activité de la journée' }));
  expect(await screen.findByText('Aucun mouvement pour cette date.')).toBeVisible();
});

it('keeps the default disclosure style available for unrelated pages', async () => {
  const { default: ExpandableDetails } = await import('../../components/ExpandableDetails');
  render(<ExpandableDetails label="Informations complémentaires"><span>Contenu existant</span></ExpandableDetails>);
  expect(screen.getByRole('button', { name: 'Informations complémentaires' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Informations complémentaires' }));
  expect(await screen.findByText('Contenu existant')).toBeVisible();
});

it('shows uncovered deferred demand as eggs to produce even when other categories have stock', () => {
  render(<StockSummary available={600} reserved={100} physical={700}
    promisedPending={250} toProduce={150} balanceAfterPromises={450} />);
  expect(screen.getByText('À produire pour les commandes')).toBeVisible();
  expect(screen.getByText('150 œufs')).toBeVisible();
  expect(screen.queryByText('450 œufs')).not.toBeInTheDocument();
});

it('shows remaining free stock when all pending orders are already reserved', () => {
  render(<StockSummary available={80} reserved={200} physical={280}
    promisedPending={100} toProduce={0} balanceAfterPromises={80} />);
  expect(screen.getByText('Stock après les commandes')).toBeVisible();
  expect(within(screen.getByRole('status')).getByText('80 œufs')).toBeVisible();
  expect(screen.queryByText('À produire pour les commandes')).not.toBeInTheDocument();
});

it('does not show an order balance when there are no outstanding orders or the API has no demand fields', () => {
  const { rerender } = render(<StockSummary available={100} reserved={0} physical={100} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<StockSummary available={100} reserved={0} physical={100} promisedPending={0} toProduce={0} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
