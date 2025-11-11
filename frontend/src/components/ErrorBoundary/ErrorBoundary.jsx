/**
 * Error Boundary React pour capturer les erreurs non gérées.
 * 
 * Ce composant capture les erreurs JavaScript dans l'arbre de composants React,
 * les log et affiche une page d'erreur user-friendly au lieu de faire crasher
 * toute l'application.
 * 
 * Utilisation :
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 */

import React from 'react';
import ErrorPage from '../../pages/ErrorPage/ErrorPage';

/**
 * Classe ErrorBoundary qui étend React.Component.
 * 
 * Note: Les Error Boundaries doivent être des composants de classe
 * car les hooks ne peuvent pas capturer les erreurs.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  /**
   * Méthode statique appelée lorsqu'une erreur est détectée.
   * Met à jour l'état pour déclencher le rendu de la page d'erreur.
   * 
   * @param {Error} error - L'erreur qui a été levée
   * @param {Object} errorInfo - Informations supplémentaires sur l'erreur
   * @returns {Object} Nouvel état avec hasError à true
   */
  static getDerivedStateFromError(error) {
    // Met à jour l'état pour que le prochain rendu affiche la page d'erreur
    return { hasError: true };
  }

  /**
   * Méthode appelée après qu'une erreur a été détectée.
   * Utilisée pour logger l'erreur.
   * 
   * @param {Error} error - L'erreur qui a été levée
   * @param {Object} errorInfo - Informations sur le composant qui a causé l'erreur
   */
  componentDidCatch(error, errorInfo) {
    // Logger l'erreur dans la console
    console.error('ErrorBoundary a capturé une erreur:', error, errorInfo);

    // Stocker l'erreur dans l'état pour l'afficher dans la page d'erreur
    this.setState({
      error,
      errorInfo,
    });

    // Optionnel: Envoyer l'erreur au backend pour logging
    // Cette fonction peut être implémentée plus tard si un endpoint existe
    this.logErrorToBackend(error, errorInfo);
  }

  /**
   * Envoie l'erreur au backend pour logging (optionnel).
   * 
   * @param {Error} error - L'erreur
   * @param {Object} errorInfo - Informations sur l'erreur
   */
  async logErrorToBackend(error, errorInfo) {
    try {
      // Récupérer les informations utilisateur si disponibles
      const userEmail = localStorage.getItem('user_email') || 'unknown';
      const accessToken = localStorage.getItem('access_token');

      // Préparer les données d'erreur
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userEmail: userEmail,
      };

      // Logger dans la console avec plus de détails
      console.error('Détails de l\'erreur pour debugging:', {
        ...errorData,
        error: error.toString(),
      });

      // Optionnel: Envoyer l'erreur au backend si un endpoint existe
      // Pour l'instant, on log juste dans la console
      // Si un endpoint backend est créé plus tard, décommenter ce code:
      /*
      try {
        if (accessToken) {
          const { post } = await import('../../services/api');
          await post('/errors/frontend', errorData);
        }
      } catch (apiError) {
        // Ne pas logger l'erreur d'API pour éviter une boucle
        console.warn('Impossible d\'envoyer l\'erreur au backend:', apiError);
      }
      */
    } catch (loggingError) {
      // Si le logging échoue, on ne veut pas créer une boucle d'erreurs
      console.error('Erreur lors du logging de l\'erreur:', loggingError);
    }
  }

  /**
   * Réinitialise l'état d'erreur pour permettre à l'utilisateur de réessayer.
   */
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  /**
   * Rendu du composant.
   * Si une erreur a été détectée, affiche la page d'erreur.
   * Sinon, affiche les enfants normalement.
   */
  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
        />
      );
    }

    // Si pas d'erreur, rendre les enfants normalement
    return this.props.children;
  }
}

export default ErrorBoundary;

