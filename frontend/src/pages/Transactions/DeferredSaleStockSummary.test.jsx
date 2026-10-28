import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeferredSaleStockSummary from './DeferredSaleStockSummary';

it('summarizes a closed remainder without an unfinished progress bar', () => {
  render(<DeferredSaleStockSummary sale={{
    est_promesse: true,
    est_actif: true,
    quantite: 1000,
    quantite_completee: 600,
    quantite_en_attente: 0,
    quantite_annulee: 400,
    repartition_stock: [],
  }} />);

  expect(screen.getByText('Clôturée · 600 fournis · 400 annulés')).toBeVisible();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
