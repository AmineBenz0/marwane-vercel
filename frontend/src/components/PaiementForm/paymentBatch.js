/** The same payload the transaction page sends for new payments. */
export const buildPaymentBatch = (idTransaction, paiements) => ({
  paiements: paiements.map((p) => ({
    ...p,
    id_transaction: Number(idTransaction),
    montant: parseFloat(p.montant),
    numero_cheque: p.type_paiement === 'cheque' ? p.numero_cheque || null : null,
    banque: p.type_paiement === 'cheque' ? p.banque || null : null,
    date_encaissement_prevue: p.type_paiement === 'cheque' ? p.date_encaissement_prevue || null : null,
    statut_cheque: p.type_paiement === 'cheque' ? p.statut_cheque || 'a_encaisser' : null,
    reference_virement: p.type_paiement === 'virement' ? p.reference_virement || null : null,
    id_lc: p.type_paiement === 'lc' ? p.id_lc || null : null,
  })),
});
