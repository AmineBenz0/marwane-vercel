import { get, post } from './api';

/**
 * Service pour la gestion des comptes bancaires.
 */
const compteBancaireService = {
  /**
   * Récupère la liste de tous les comptes bancaires.
   */
  getComptes: async () => {
    return await get('/comptes-bancaires');
  },

  /**
   * Récupère l'historique des mouvements d'un compte.
   * @param {number} id - L'ID du compte
   * @param {object} params - Paramètres (skip, limit)
   */
  getMouvements: async (id, params = { skip: 0, limit: 50 }) => {
    return await get(`/comptes-bancaires/${id}/mouvements`, { params });
  },

  /**
   * Crée un nouveau compte bancaire.
   * @param {object} data - { nom_banque, numero_compte, solde_initial }
   */
  createCompte: async (data) => {
    return await post('/comptes-bancaires', data);
  }
};

export default compteBancaireService;
