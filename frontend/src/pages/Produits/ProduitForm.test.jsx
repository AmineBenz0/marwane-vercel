import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProduitForm from './ProduitForm';

describe('ProduitForm', () => {
  it.each([
    ['vendu', 'Vendu — transaction client'],
    ['achete', 'Acheté — transaction fournisseur'],
  ])('submits the single %s usage without product types', async (usage, label) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProduitForm open onClose={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.queryByText('Type de produit')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Produit test' } });
    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.click(screen.getByRole('option', { name: label }));
    const submit = screen.getByRole('button', { name: 'Créer' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      nom_produit: 'Produit test', est_actif: true, usage,
    }));
  });

  it('uses the saved usage when editing a product', () => {
    render(<ProduitForm open onClose={vi.fn()} onSubmit={vi.fn()} initialValues={{
      id_produit: 1, nom_produit: 'Produit', usage: 'vendu', est_actif: true,
    }} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Vendu — transaction client');
  });
});
