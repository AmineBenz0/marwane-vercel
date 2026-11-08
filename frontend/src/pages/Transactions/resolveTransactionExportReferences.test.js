import { describe, expect, it, vi } from 'vitest';
import { resolveTransactionExportRows } from './resolveTransactionExportReferences';
const row = (extras = {}) => ({
  id_transaction: 5, id_client: 7, id_fournisseur: null,
  id_produit: 12, id_batiment: 8, est_actif: false,
  montant_total: '1.50', paiements: [{ montant: '0.10' }], ...extras,
});
const maps = () => ({ clients: new Map(), fournisseurs: new Map(), produits: new Map(), batiments: new Map() });
describe('transaction export names', () => {
  it('fetches missing names, preserving amounts and historical status', async () => {
    const data = {
      '/clients/7': { nom_client: 'Livraison différée' },
      '/produits/12': { nom_produit: 'Oeufs - Gros' },
      '/batiments/8': { nom: 'Bâtiment B' },
    };
    const get = vi.fn(async path => data[path]);
    const original = row();
    const [result] = await resolveTransactionExportRows([original], maps(), get);
    expect(result).toMatchObject({
      client_ou_fournisseur: 'Livraison différée', produit_label: 'Oeufs - Gros',
      batiment_label: 'Bâtiment B', montant_total: '1.50', est_actif: false,
    });
    expect(result.paiements).toBe(original.paiements);
    expect(get.mock.calls.map(call => call[0]).sort()).toEqual(['/batiments/8','/clients/7','/produits/12']);
  });
  it('handles string IDs and deduplicates missing suppliers', async () => {
    const known = maps();
    known.produits.set(12, 'Oeufs - Gros');
    known.batiments.set('8', 'Bâtiment B');
    const get = vi.fn(async () => ({ nom_fournisseur: 'Fournisseur caisse' }));
    const output = await resolveTransactionExportRows([
      row({ id_client: null, id_fournisseur: '6' }),
      row({ id_client: null, id_fournisseur: 6 }),
    ], known, get);
    expect(output.map(x => x.client_ou_fournisseur)).toEqual(['Fournisseur caisse','Fournisseur caisse']);
    expect(get).toHaveBeenCalledExactlyOnceWith('/fournisseurs/6');
  });
  it('does not fetch absent building names', async () => {
    const known = maps();
    known.clients.set(7, 'Client Alpha'); known.produits.set(12, 'Produit Alpha');
    const get = vi.fn();
    const [result] = await resolveTransactionExportRows([row({ id_batiment: null })], known, get);
    expect(result.batiment_label).toBe('-');
    expect(get).not.toHaveBeenCalled();
  });
  it('refuses to emit fake ID labels when a lookup fails', async () => {
    const get = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(resolveTransactionExportRows([row()], maps(), get))
      .rejects.toThrow('Impossible de retrouver le nom du client');
  });
});
