import { get, post, put, del } from './api';

/**
 * Service pour la gestion des productions.
 */
export const productionService = {
  /**
   * Récupère la liste des productions avec filtres.
   */
  getProductions: (params) => get('/productions', { params }),

  /**
   * Récupère le détail d'une production.
   */
  getProduction: (id) => get(`/productions/${id}`),

  /**
   * Crée une nouvelle production.
   */
  createProduction: (data) => post('/productions', data),

  /**
   * Met à jour une production.
   */
  updateProduction: (id, data) => put(`/productions/${id}`, data),

  /**
   * Supprime une production.
   */
  deleteProduction: (id) => del(`/productions/${id}`),

  /**
   * Récupère les stats quotidiennes.
   */
  getDailyStats: (days = 30) => get('/productions/stats/daily', { params: { days } }),
};

/**
 * Service pour la gestion des bâtiments.
 */
export const batimentService = {
  /**
   * Récupère la liste des bâtiments.
   */
  getBatiments: () => get('/batiments'),

  /**
   * Crée un bâtiment.
   */
  createBatiment: (data) => post('/batiments', data),
};
