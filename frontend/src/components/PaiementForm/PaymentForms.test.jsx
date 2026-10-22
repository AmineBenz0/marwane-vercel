import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFieldArray, useForm } from 'react-hook-form';
import MultiPaiementForm from './MultiPaiementForm';
import PaiementForm from './PaiementForm';

vi.mock('../../services/api', () => ({
  get: vi.fn(async () => [
    { id_compte: 1, nom_banque: 'Bank A', numero_compte: '001' },
    { id_compte: 2, nom_banque: 'Bank B', numero_compte: '002' },
  ]),
}));

afterEach(cleanup);
const payment = { date_paiement: '2026-10-13', montant: 40, type_paiement: 'cash' };
const lc = { id_lc: 7, numero_reference: 'LC-7', montant: '100.00' };

function BatchForm({ onSubmit, payments = [payment], lcs = [lc], supplierSource = null }) {
  const form = useForm({ defaultValues: { paiements: payments } });
  const rows = useFieldArray({ control: form.control, name: 'paiements' });
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <MultiPaiementForm
        supplierSource={supplierSource}
        transaction={{ montant_restant: 100, date_transaction: '2026-10-11' }}
        {...rows}
        register={form.register}
        watch={form.watch}
        setValue={form.setValue}
        errors={form.formState.errors}
        availableLcs={lcs}
        loadingLcs={false}
      />
      <button type="submit">Enregistrer le paiement</button>
    </form>
  );
}

function EditForm({ existing = payment, onSubmit = vi.fn() }) {
  const form = useForm({ defaultValues: existing });
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <PaiementForm defaultValues={existing} isEditing
        transaction={{ montant_restant: 60, id_client: 3 }}
        register={form.register} watch={form.watch} setValue={form.setValue}
        errors={form.formState.errors}
      />
      <button type="submit">Enregistrer les détails</button>
    </form>
  );
}

describe('Unpaid transaction payment forms', () => {
  it('keeps bank funding and the chosen account when the supplier payment method changes to cash', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} supplierSource="banque" payments={[{ ...payment, type_paiement: 'virement' }]} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compte bancaire à débiter' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Bank B · 002' }));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByRole('option', { name: /Espèces/ }));
    expect(screen.getByRole('combobox', { name: 'Compte bancaire à débiter' })).toHaveTextContent('Bank B');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].paiements[0]).toMatchObject({ type_paiement: 'cash', source_reglement: 'banque', id_compte: 2 });
  });

  it('requires an account for a bank-funded supplier cash payment', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} supplierSource="banque" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await screen.findByText('Sélectionnez le compte bancaire à débiter')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps caisse funding independent of a supplier virement method', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} supplierSource="caisse" payments={[{ ...payment, type_paiement: 'virement' }]} />);
    expect(screen.queryByRole('combobox', { name: 'Compte bancaire à débiter' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].paiements[0]).toMatchObject({ type_paiement: 'virement', source_reglement: 'caisse' });
  });

  it('submits a partial cash payment with its initialized date and amount', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} />);
    expect(screen.getByRole('textbox', { name: 'Date du paiement 1' })).toHaveValue('13/10/26');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].paiements[0]).toMatchObject(payment);
  });

  it('persists the selected LC and its full amount in the submitted form', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} payments={[{ ...payment, type_paiement: 'lc', id_lc: null }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Développer le paiement 1' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Lettre de Crédit' }));
    fireEvent.click(await screen.findByRole('option', { name: /LC-7/ }));
    expect(screen.getByRole('spinbutton', { name: 'Montant du paiement 1' })).toHaveValue(100);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].paiements[0]).toMatchObject({ id_lc: 7, montant: 100, type_paiement: 'lc' });
  });

  it('blocks an LC payment before its details have been opened when no LC is selected', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} payments={[{ ...payment, type_paiement: 'lc', id_lc: null }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await screen.findByText('Veuillez sélectionner une LC disponible')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([-5, 0])('blocks an amount of %s and shows an inline error', async (montant) => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} payments={[{ ...payment, montant }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await screen.findByText('Le montant doit être supérieur à 0')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it('blocks a missing amount', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Montant du paiement 1' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await screen.findByText('Le montant est requis')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it('blocks a missing payment date', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Date du paiement 1' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await screen.findByText('La date du paiement est requise')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it('blocks a payment dated before the transaction', async () => {
    const submit = vi.fn();
    render(<BatchForm onSubmit={submit} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Date du paiement 1' }), { target: { value: '10/10/26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await screen.findByText('La date du paiement ne peut pas être antérieure à la transaction')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it('retains an existing partial payment amount and locks its financial fields', async () => {
    const submit = vi.fn();
    render(<EditForm onSubmit={submit} />);
    expect(screen.getByLabelText(/Montant \(MAD\)/)).toHaveValue(40);
    expect(screen.getByLabelText(/Montant \(MAD\)/)).toBeDisabled();
    expect(screen.getByLabelText(/Date du paiement/)).toHaveValue('13/10/26');
    expect(screen.getByLabelText(/Date du paiement/)).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Type de paiement/ })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByLabelText(/Notes \(optionnel\)/), { target: { value: 'Reçu confirmé' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les détails' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0]).toMatchObject({ montant: 40, notes: 'Reçu confirmé' });
  });

  it('displays the existing LC when editing even though it is no longer available', () => {
    render(<EditForm existing={{ ...payment, type_paiement: 'lc', id_lc: 7, numero_reference_lc: 'LC-7' }} />);
    const select = screen.getByRole('combobox', { name: /Choisir une Lettre de Crédit/ });
    expect(select).toHaveTextContent('LC-7');
    expect(select).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText(/Montant \(MAD\)/)).toHaveValue(40);
  });
});
