export const SETTLEMENT_STATUS_LABELS = {
  valide: 'Validé',
  en_attente: 'En attente',
  annule: 'Annulé',
  rejete: 'Rejeté',
  emis: 'Émis',
  a_encaisser: 'À encaisser',
  encaisse: 'Encaissé',
};

export function getSettlementStatus({ statut, statut_cheque, type_paiement }) {
  if (type_paiement !== 'cheque' || statut === 'annule' || statut === 'rejete') return statut;
  if (statut_cheque === 'encaisse') return statut === 'valide' ? statut_cheque : statut;
  return statut_cheque || (statut === 'valide' ? 'en_attente' : statut);
}
