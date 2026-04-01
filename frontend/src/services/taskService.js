/**
 * Service pour la gestion des tâches et du calendrier.
 */
import { get, post, put, del } from './api';

const taskService = {
  /**
   * Récupère la liste des tâches.
   * @param {object} params - Filtres (start_date, end_date, statut)
   */
  getTasks: async (params = {}) => {
    return await get('/tasks', { params });
  },

  /**
   * Récupère une tâche par son ID.
   */
  getTask: async (id) => {
    return await get(`/tasks/${id}`);
  },

  /**
   * Crée une nouvelle tâche.
   */
  createTask: async (taskData) => {
    return await post('/tasks', taskData);
  },

  /**
   * Met à jour une tâche existante.
   */
  updateTask: async (id, taskData) => {
    return await put(`/tasks/${id}`, taskData);
  },

  /**
   * Supprime une tâche.
   */
  deleteTask: async (id) => {
    return await del(`/tasks/${id}`);
  }
};

export default taskService;
