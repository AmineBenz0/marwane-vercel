/**
 * Service pour la gestion des Lettres de Crédit (LC).
 */
import { get, post, put, del } from './api';

const lettreCreditService = {
  /**
   * Récupère la liste des LC avec filtres.
   */
  getAll: (params = {}) => get('/lettres-credit', { params }),

  /**
   * Récupère les LC disponibles (actives et utilisables).
   */
  getAvailable: (params = {}) => get('/lettres-credit/disponibles', { params }),

  /**
   * Récupère une LC par son ID.
   */
  getById: (id) => get(`/lettres-credit/${id}`),

  /**
   * Crée une nouvelle LC.
   */
  create: (data) => post('/lettres-credit', data),

  /**
   * Met à jour une LC.
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
};

export default lettreCreditService;
