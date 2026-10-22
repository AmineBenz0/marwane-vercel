const createClientRef = (index) => (
  globalThis.crypto?.randomUUID?.() || `transaction-${Date.now()}-${index}`
);

export const buildTransactionPaymentBatch = (data) => ({
  items: data.transactions.map((transaction, index) => {
    const line = data.lignesData?.[index];
    const paiements = line?.ajouter_paiement
      ? (line.paiements || []).map((payment) => ({
        date_paiement: payment.date,
        montant: parseFloat(payment.montant),
        type_paiement: payment.type,
        numero_cheque: payment.numero_cheque || null,
        banque: payment.banque || null,
        reference_virement: payment.reference || null,
        id_compte: payment.id_compte ? parseInt(payment.id_compte, 10) : null,
        id_lc: payment.id_lc || null,
        notes: payment.notes || null,
      }))
      : [];

    return {
      client_ref: createClientRef(index),
      transaction,
      paiements,
    };
  }),
});
