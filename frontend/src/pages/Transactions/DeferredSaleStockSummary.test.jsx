import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeferredSaleStockSummary from './DeferredSaleStockSummary';

it('reports delivered versus canceled eggs without calling the canceled remainder fulfilled', () => {
  render(<DeferredSaleStockSummary sale={{
    est_promesse: true, est_actif: true, quantite: 1000,
    quantite_couverte: 600, quantite_completee: 600,
    quantite_en_attente: 0, quantite_annulee: 400,
  }} />);
  expect(screen.getByText('600 / 600 œufs à fournir')).toBeVisible();
  expect(screen.getByText(/400 œufs clôturés sur/)).toBeVisible();
  expect(screen.getByText('Reste clôturé')).toBeVisible();
});
