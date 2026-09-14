/**
 * Service pour la gestion des Charges (Dépenses standalone).
 */
import { get, post, put, del } from './api';

const chargeService = {
  /**
   * Récupère la liste des charges avec filtres.
   */
  getAll: (params = {}) => get('/charges', { params }),

  /**
   * Récupère un résumé des charges par catégorie.
   */
  getSummary: (params = {}) => get('/charges/summary', { params }),

  /**
   * Récupère une charge par son ID.
   */
  getById: (id) => get(`/charges/${id}`),

  /**
   * Crée une nouvelle charge.
   */
  create: (data) => post('/charges', data),

  /**
   * Met à jour une charge.
   */
  update: (id, data) => put(`/charges/${id}`, data),

  /**
   * Supprime une charge.
   */
  delete: (id) => del(`/charges/${id}`),
};

export default chargeService;
