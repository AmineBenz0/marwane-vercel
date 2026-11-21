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

    expect(screen.getAllByRole('combobox').map((select) => select.textContent)).toEqual([
      'Espèces',
      'Espèces',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un autre paiement' }));
    expect(props.append).toHaveBeenCalledWith(expect.objectContaining({ montant: 20, type_paiement: 'cash' }));

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le paiement 1' }));
    expect(props.remove).toHaveBeenCalledWith(0);
  });

  it('does not add a row while a payment is unfilled', () => {
    const props = makeProps([{ id: 'payment-1' }, { id: 'payment-2' }]);
    props.watch = vi.fn((name) => (name === 'paiements'
      ? [{ montant: 40, type_paiement: 'cash' }, { montant: 0, type_paiement: 'cash' }]
      : 'cash'));
    render(<MultiPaiementForm {...props} />);

    const add = screen.getByRole('button', { name: 'Ajouter un autre paiement' });
    expect(add).toBeDisabled();
    expect(screen.getByText('Complétez d’abord le paiement en cours.')).toBeInTheDocument();
    fireEvent.click(add);
    expect(props.append).not.toHaveBeenCalled();
  });

  it('does not add a row once the amount due is covered', () => {
    const props = makeProps([{ id: 'payment-1' }]);
    props.watch = vi.fn((name) => (name === 'paiements' ? [{ montant: 100, type_paiement: 'cash' }] : 'cash'));
    render(<MultiPaiementForm {...props} />);

    expect(screen.getByRole('button', { name: 'Ajouter un autre paiement' })).toBeDisabled();
    expect(screen.getByText('Le montant dû est déjà couvert.')).toBeInTheDocument();
  });

  it('asks to confirm an overpayment and refuses one larger than the transaction', () => {
    const props = makeProps([{ id: 'payment-1' }]);
    props.register = vi.fn((name) => ({ name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() }));
    props.transaction = { montant_restant: 100, montant_total: 100, id_client: 4 };
    props.watch = vi.fn((name) => (name === 'paiements' ? [{ montant: 150, type_paiement: 'cash' }] : name === 'confirmer_trop_paye' ? false : 'cash'));
    const { unmount } = render(<MultiPaiementForm {...props} />);
    expect(screen.getByRole('checkbox', { name: /Je confirme ce trop-payé : le client aura un crédit de 50,00/ })).toBeInTheDocument();
    const rule = props.register.mock.calls.find(([name]) => name === 'confirmer_trop_paye')[1];
    expect(rule.validate(false)).toBe('Cochez la case pour confirmer ce trop-payé.');
    expect(rule.validate(true)).toBe(true);
    unmount();

    props.watch = vi.fn((name) => (name === 'paiements' ? [{ montant: 1000, type_paiement: 'cash' }] : 'cash'));
    render(<MultiPaiementForm {...props} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/plus que le montant de la transaction/)).toBeInTheDocument();
    const blocked = props.register.mock.calls.filter(([name]) => name === 'confirmer_trop_paye').pop()[1];
    expect(blocked.validate(true)).toBe('Montant trop élevé : vérifiez le montant saisi.');
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
