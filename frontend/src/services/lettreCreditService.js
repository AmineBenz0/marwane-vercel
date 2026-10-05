/**
 * Service pour la gestion des Lettres de Cr�dit (LC).
 */
import { get, post, put, del } from './api';

const lettreCreditService = {
  /**
   * R�cup�re la liste des LC avec filtres.
   */
  getAll: (params = {}) => get('/lettres-credit', { params }),

  /**
   * R�cup�re les LC disponibles (actives et utilisables).
   */
  getAvailable: (params = {}) => get('/lettres-credit/disponibles', { params }),

  /**
   * R�cup�re une LC par son ID.
   */
  getById: (id) => get(`/lettres-credit/${id}`),

  /**
   * Cr�e une nouvelle LC.
   */
  create: (data) => post('/lettres-credit', data),

  /**
   * Met � jour une LC.
   */
  update: (id, data) => put(`/lettres-credit/${id}`, data),

  /**
   * Supprime une LC.
   */
  delete: (id) => del(`/lettres-credit/${id}`),

  /**
   * Liste les cessions.
   */
  getCessions: () => get('/cessions-lc'),

  /**
   * Effectue une cession (transfert).
   */
  ceder: (data) => post('/cessions-lc', data),

  verserBanque: (id, data) => post(`/lettres-credit/${id}/verser-banque`, data),

  payerFournisseur: (id, data) => post(`/lettres-credit/${id}/payer-fournisseur`, data),

  annuler: (id, data) => post(`/lettres-credit/${id}/annuler`, data),
};

export default lettreCreditService;
