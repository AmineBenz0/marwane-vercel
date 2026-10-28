import { ThemeProvider, createTheme } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionsExcelRegister from './TransactionsExcelRegister';

const { useMediaQueryMock } = vi.hoisted(() => ({ useMediaQueryMock: vi.fn() }));

vi.mock('@mui/material', async (importOriginal) => ({
  ...(await importOriginal()),
  useMediaQuery: useMediaQueryMock,
}));

const transaction = {
  id_transaction: 25,
  id_client: 4,
  id_produit: 12,
  id_batiment: 2,
  date_transaction: '2026-10-27',
  montant_total: 100,
  montant_paye: 30,
  montant_restant: 70,
  statut_paiement: 'partiel',
  est_actif: true,
};

const renderRegister = (props = {}) => render(
  <ThemeProvider theme={createTheme()}>
    <TransactionsExcelRegister
      rows={[transaction]}
      getClientOuFournisseur={() => 'Ferme du Nord'}
      formatMontant={(amount) => `${amount} MAD`}
      onView={vi.fn()}
      title="Résultat filtré"
      description=""
      {...props}
    />
  </ThemeProvider>,
);

describe('TransactionsExcelRegister responsive layout', () => {
  beforeEach(() => {
    useMediaQueryMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the essential fields and direct detail action in a compact desktop table', () => {
    renderRegister();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
    expect(screen.getByText('Ferme du Nord')).toBeVisible();
    expect(screen.getByText('+100 MAD')).toBeVisible();
    expect(screen.getByText('70 MAD')).toBeVisible();
    expect(screen.getByText('Partiel')).toBeVisible();
    expect(screen.getByRole('link', { name: /Consulter la transaction n° 25/ })).toHaveAttribute('href', '/transactions/25');
    expect(screen.queryByRole('columnheader', { name: 'Action' })).not.toBeInTheDocument();
    expect(screen.queryByText('Produit')).not.toBeInTheDocument();
  });

  it('shows the same essentials as readable cards on mobile', () => {
    useMediaQueryMock.mockReturnValue(true);
    renderRegister();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Ferme du Nord')).toBeVisible();
    expect(screen.getByText('+100 MAD')).toBeVisible();
    expect(screen.getByText('70 MAD')).toBeVisible();
    expect(screen.getByText('Partiel')).toBeVisible();
    expect(screen.getByRole('link', { name: /Consulter la transaction n° 25/ })).toHaveAttribute('href', '/transactions/25');
  });

  it('shows a loading message instead of empty zero counts while fetching', () => {
    renderRegister({ rows: [], loading: true });

    expect(screen.getByText('Chargement des transactions...')).toBeVisible();
    expect(screen.getByText('Chargement…')).toBeVisible();
    expect(screen.queryByText('0 opérations')).not.toBeInTheDocument();
  });
});


it('opens a row or its accessible link once, but never a date group', () => {
  const onView = vi.fn();
  renderRegister({ onView, rows: [{ ...transaction, est_actif: false }] });
  fireEvent.click(screen.getByText('+100 MAD'));
  expect(onView).toHaveBeenCalledTimes(1);
  expect(onView).toHaveBeenLastCalledWith(expect.objectContaining({ id_transaction: 25 }));
  fireEvent.click(screen.getByRole('link', { name: /Consulter la transaction/ }));
  expect(onView).toHaveBeenCalledTimes(2);
  fireEvent.click(within(screen.getByRole('table')).getByText('1 opération'));
  expect(onView).toHaveBeenCalledTimes(2);
});

it('opens a mobile card by tapping its amount', () => {
  useMediaQueryMock.mockReturnValue(true);
  const onView = vi.fn();
  renderRegister({ onView });
  fireEvent.click(screen.getByText('+100 MAD'));
  expect(onView).toHaveBeenCalledExactlyOnceWith(transaction);
});
