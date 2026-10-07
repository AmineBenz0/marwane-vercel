import { get, post, put, del } from './api';

/**
 * Service pour la gestion des productions.
 */
export const productionService = {
  getBuildingProductions: async (idBatiment) => {
    const rows = [];
    const pageSize = 500;
    let page;
    do {
      page = await get('/productions', { params: {
        id_batiment: idBatiment, skip: rows.length, limit: pageSize,
      } });
      rows.push(...page);
    } while (page.length === pageSize);
    return rows;
  },
  deleteDailyProduction: (data) => del('/productions/daily', { data }),

  getDailyProduction: (idBatiment, dateProduction) => get('/productions/daily', {
    params: { id_batiment: idBatiment, date_production: dateProduction },
  }),
  createDailyProduction: (data) => post('/productions/daily', data),
  updateDailyProduction: (data) => put('/productions/daily', data),

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

  /**
   * Recupere le tableau de stock par batiment pour une journee.
   */
  getStock: (dateStock) => get('/productions/stock', {
    params: dateStock ? { date_stock: dateStock } : {},
  }),

  getDailyStock: (dateStock) => get('/productions/stock/daily', {
    params: dateStock ? { date_stock: dateStock } : {},
  }),

  getPerformance: (idCycle) => get('/productions/performance', {
    params: { id_cycle: idCycle },
  }),

  /**
   * Recupere la liste des formules d'aliment.
   */
  getFormules: () => get('/productions/formules'),

  /**
   * Recupere les seuils qui deduisent le calibre depuis le grammage.
   */
  getCalibreThresholds: () => get('/productions/calibre-thresholds'),
};

export const cycleProductionService = {
  getCycles: (params = {}) => get('/cycles-production', { params }),
  getActiveCycle: (idBatiment) => get(`/cycles-production/active/${idBatiment}`),
  createCycle: (data) => post('/cycles-production', data),
  updateCycle: (idCycle, data) => put(`/cycles-production/${idCycle}`, data),
  terminateCycle: (idCycle, data = {}) => post(`/cycles-production/${idCycle}/terminer`, data),
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
