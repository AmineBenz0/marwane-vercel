import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportTransactionWorkbook } from './TransactionsList';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';

vi.mock('../../utils/exportToExcel', () => ({
  exportToExcelAdvanced: vi.fn().mockResolvedValue(undefined),
}));

describe('Release 4 Phase 6 transaction Excel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exports the gross/avoir/net receipt reconciliation with dated notes', async () => {
    const sale = {
      id_transaction: 101,
      id_client: 7,
      id_fournisseur: null,
      date_transaction: '2026-10-22',
      client_ou_fournisseur: 'Client Élevage',
      produit_label: 'Œufs normaux',
      batiment_label: 'Bâtiment A',
      quantite: 1000,
      est_actif: true,
      est_promesse: true,
      quantite_couverte: 600,
      quantite_reservee: 0,
      quantite_annulee: 400,
      quantite_en_attente: 0,
      quantite_a_produire: 0,
      date_livraison_prevue: '2026-11-15',
      montant_total: '1500.00',
      montant_avoir: '600.00',
      montant_net: '900.00',
      montant_paye: '900.00',
      montant_restant: '0.00',
      statut_paiement: 'paye',
      avoirs_livraison_differee: [
        { date_effet: '2026-11-10', montant_avoir: '600.00', quantite_annulee: 400 },
      ],
      paiements: [
        { date_paiement: '2026-10-22', type_paiement: 'cash', montant: '1500.00', nature: 'paiement', statut: 'valide' },
        { date_paiement: '2026-11-11', type_paiement: 'cash', montant: '600.00', nature: 'remboursement', statut: 'valide' },
      ],
    };
    await exportTransactionWorkbook([sale]);
    expect(exportToExcelAdvanced).toHaveBeenCalledOnce();
    const [rows, columns] = exportToExcelAdvanced.mock.calls[0];
    const header = Object.fromEntries(columns.map(column => [column.id, column.label]));
    expect(header).toMatchObject({
      montant_total: 'Montant initial',
      montant_avoir: 'Avoirs commerciaux',
      montant_net: 'Montant net',
      avoirs_details: 'Détail des avoirs',
      quantite_annulee: 'Quantité annulée',
    });
    expect(rows[0]).toMatchObject({ montant_total: 1500, montant_avoir: 600, montant_net: 900, montant_paye: 900, montant_restant: 0 });
    for (const id of ['montant_total', 'montant_avoir', 'montant_net', 'montant_paye', 'montant_restant']) {
      expect(columns.find(column => column.id === id).excelNumberFormat()).toContain('MAD');
    }
    expect(rows[0].avoirs_details).toContain('10/11/26');
    expect(rows[0].avoirs_details).toContain('600,00');
    expect(rows[0].reglement).toContain('Remboursement');
    expect(rows[0].reglement).toContain('600,00');
    expect(rows[0].reglement).toContain('−');
    const totals = rows.at(-1);
    expect(totals).toMatchObject({ montant_total: 1500, montant_avoir: 600, montant_net: 900, montant_paye: 900, montant_restant: 0 });
  });

  it('excludes inactive transactions from all five reconciled totals', async () => {
    const normal = {
      id_client: 1, est_actif: true, date_transaction: '2026-10-01',
      montant_total: '100.00', montant_avoir: '0.00', montant_net: '100.00',
      montant_paye: '70.00', montant_restant: '30.00', paiements: [],
    };
    await exportTransactionWorkbook([
      normal,
      { ...normal, est_actif: false, montant_total: '500.00',
        montant_avoir: '100.00', montant_net: '400.00', montant_paye: '500.00',
        montant_restant: '-100.00' },
    ]);
    const totals = exportToExcelAdvanced.mock.calls[0][0].at(-1);
    expect(totals).toMatchObject({ montant_total: 100, montant_avoir: 0, montant_net: 100, montant_paye: 70, montant_restant: 30 });
  });
});
