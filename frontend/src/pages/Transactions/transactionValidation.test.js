import { describe, expect, it } from 'vitest';
import { transactionValidationSchema } from './transactionValidation';

const validTransaction = (overrides = {}) => ({
  date_transaction: '2026-10-04',
  date_echeance: '',
  type_entite: 'client',
  id_client: '12',
  id_fournisseur: '',
  lignes: [{
    id_produit: '7',
    id_batiment: '1',
    id_production: '31',
    date_production: '2026-10-03',
    source_ready: true,
    source_available: 100,
    quantite: '2',
    prix_unitaire: '15.5',
    ajouter_paiement: false,
    paiements: [{
      date: '2026-10-04',
      montant: '',
      type: 'cash',
      id_lc: '',
    }],
  }],
  ...overrides,
});

describe('transactionValidationSchema', () => {
  it('requires a production source for client sales', async () => {
    const data = validTransaction();
    data.lignes[0].id_production = '';
    await expect(transactionValidationSchema.validate(data)).rejects.toThrow('Choisissez le type');
  });

  it('rejects quantities exceeding a source across multiple lines', async () => {
    const data = validTransaction();
    data.lignes[0].quantite = 60;
    data.lignes.push({ ...data.lignes[0], quantite: 50 });
    await expect(transactionValidationSchema.validate(data)).rejects.toThrow('stock disponible');
  });

  it('rejects production after the sale date', async () => {
    const data = validTransaction();
    data.lignes[0].date_production = '2026-10-05';
    await expect(transactionValidationSchema.validate(data)).rejects.toThrow('précéder');
  });

  it('blocks submission while source details cannot be loaded', async () => {
    const data = validTransaction();
    data.lignes[0].source_ready = false;
    await expect(transactionValidationSchema.validate(data)).rejects.toThrow('Chargez le stock disponible');
  });

  it('allows a zero-stock promise only when explicitly accepted with a completion date', async () => {
    const data = validTransaction();
    data.lignes[0].id_production = '';
    data.lignes[0].source_available = 0;
    data.lignes[0].est_promesse = true;
    data.lignes[0].date_livraison_prevue = '2026-10-05';
    await expect(transactionValidationSchema.validate(data)).resolves.toMatchObject({
      lignes: [{ est_promesse: true, date_livraison_prevue: '2026-10-05' }],
    });
    data.lignes[0].est_promesse = false;
    await expect(transactionValidationSchema.validate(data)).rejects.toThrow('stock disponible');
  });
  it.each([
    ['client', { id_client: '12', id_fournisseur: '' }, 12, null],
    ['fournisseur', { id_client: '', id_fournisseur: '34' }, null, 34],
  ])('accepts a valid %s transaction with the other entity blank', async (_type, entityValues, clientId, supplierId) => {
    const result = await transactionValidationSchema.validate(validTransaction({
      type_entite: _type,
      ...entityValues,
    }));

    expect(result.id_client).toBe(clientId);
    expect(result.id_fournisseur).toBe(supplierId);
    expect(result.date_echeance).toBeNull();
  });

  it('does not validate or include payment details when payment is disabled', async () => {
    const result = await transactionValidationSchema.validate(validTransaction());

    expect(result.lignes[0]).not.toHaveProperty('paiements');
  });

  it('validates a cash payment', async () => {
    const data = validTransaction();
    data.lignes[0].ajouter_paiement = true;
    data.lignes[0].paiements[0].montant = '31';

    const result = await transactionValidationSchema.validate(data);

    expect(result.lignes[0].paiements[0].montant).toBe(31);
  });

  it('requires an LC when payment type is letter of credit', async () => {
    const data = validTransaction();
    data.lignes[0].ajouter_paiement = true;
    data.lignes[0].paiements[0] = {
      date: '2026-10-04',
      montant: '31',
      type: 'lc',
      id_lc: '',
    };

    await expect(transactionValidationSchema.validate(data)).rejects.toThrow('Veuillez sélectionner une LC');
  });

  it('accepts an LC payment with a selected LC', async () => {
    const data = validTransaction();
    data.lignes[0].ajouter_paiement = true;
    data.lignes[0].paiements[0] = {
      date: '2026-10-04',
      montant: '31',
      type: 'lc',
      id_lc: '5',
    };

    const result = await transactionValidationSchema.validate(data);

    expect(result.lignes[0].paiements[0].id_lc).toBe(5);
  });

  it('ignores invalid payment values after payment is turned off', async () => {
    const data = validTransaction();
    data.lignes[0].ajouter_paiement = true;
    data.lignes[0].paiements[0].montant = '';

    await expect(transactionValidationSchema.validate(data)).rejects.toThrow('Le montant est requis');

    data.lignes[0].ajouter_paiement = false;
    await expect(transactionValidationSchema.validate(data)).resolves.toMatchObject({
      lignes: [{ ajouter_paiement: false }],
    });
  });
});
