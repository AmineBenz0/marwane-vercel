import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MultiPaiementForm from './MultiPaiementForm';

vi.mock('date-fns', () => ({
  format: vi.fn(() => '2026-09-08'),
}));

const makeProps = (fields, paymentType = 'cash') => ({
  transaction: { montant_restant: 100 },
  fields,
  append: vi.fn(),
  remove: vi.fn(),
  register: vi.fn((name) => ({ name })),
  errors: {},
  watch: vi.fn((name) => {
    if (name === 'paiements') return fields.map(() => ({ montant: 40, type_paiement: paymentType }));
    if (name.endsWith('.type_paiement')) return paymentType;
    return undefined;
  }),
  setValue: vi.fn(),
  availableLcs: [],
  loadingLcs: false,
});

describe('MultiPaiementForm', () => {
  it('supports adding and removing multiple payment rows', () => {
    const props = makeProps([{ id: 'payment-1' }, { id: 'payment-2' }]);
    render(<MultiPaiementForm {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une ligne de paiement' }));
    expect(props.append).toHaveBeenCalledWith(expect.objectContaining({ montant: 20, type_paiement: 'cash' }));

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le paiement 1' }));
    expect(props.remove).toHaveBeenCalledWith(0);
  });

  it('initializes an empty editor with one payment', async () => {
    const props = makeProps([]);
    render(<MultiPaiementForm {...props} />);

    await waitFor(() => expect(props.append).toHaveBeenCalledWith(expect.objectContaining({
      date_paiement: '2026-09-08',
      type_paiement: 'cash',
    })));
  });

  it('exposes cheque details when a payment row is expanded', async () => {
    const props = makeProps([{ id: 'payment-1' }], 'cheque');
    render(<MultiPaiementForm {...props} />);

    const expandButton = screen.getByRole('button', { name: 'Développer le paiement 1' });
    fireEvent.click(expandButton);
    expect(await screen.findByLabelText('N° Chèque')).toBeVisible();
  });
});
