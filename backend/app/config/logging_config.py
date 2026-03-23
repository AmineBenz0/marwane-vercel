"""
Configuration du système de logging structuré.
Configure Python logging avec format JSON et rotation des fichiers.
"""
import logging
import logging.handlers
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """
    Formatter personnalisé pour produire des logs au format JSON structuré.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """
        Formate un enregistrement de log en JSON.
        
        Args:
            record: Enregistrement de log à formater
            
        Returns:
            str: Log formaté en JSON
        """
        # Données de base
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Ajouter les données supplémentaires si présentes (depuis extra ou attributs)
        extra_fields = ["user_id", "endpoint", "method", "status_code", "duration_ms", "ip_address"]
        for field in extra_fields:
            value = getattr(record, field, None)
            if value is not None:
                log_data[field] = value
            
        # Ajouter l'exception si présente
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
            
        # Ajouter le stack trace si présent
        if hasattr(record, "stack_info") and record.stack_info:
            log_data["stack_trace"] = record.stack_info
            
        return json.dumps(log_data, ensure_ascii=False)


def setup_logging(
    log_dir: str = "logs",
    max_bytes: int = 100 * 1024 * 1024,  # 100MB
    backup_count: int = 30,  # Garder 30 jours de logs
    log_level: str = "INFO"
) -> None:
    """
    Configure le système de logging avec format JSON et rotation.
    
    Args:
        log_dir: Répertoire où stocker les fichiers de log
        max_bytes: Taille maximale d'un fichier de log avant rotation (en bytes)
        backup_count: Nombre de fichiers de backup à conserver
        log_level: Niveau de logging (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    # Détecter si on est sur Vercel (environnement lecture seule)
    is_vercel = os.environ.get("VERCEL") == "1"
    
    # Formatter JSON
    json_formatter = JSONFormatter()
    
    # Handler pour la console (format simple pour développement, toujours présent)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG if os.getenv("DEBUG", "False").lower() == "true" else logging.INFO)
    console_formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler.setFormatter(console_formatter)
    
    # Configurer le logger racine
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    
    # Nettoyer les handlers existants pour éviter les doublons
    root_logger.handlers.clear()
    
    # Ajouter le handler console qui fonctionne partout
    root_logger.addHandler(console_handler)
    
    # Ajouter les handlers fichiers seulement si on n'est pas sur Vercel
    if not is_vercel:
        try:
            # Créer le répertoire de logs s'il n'existe pas
            log_path = Path(log_dir)
            log_path.mkdir(parents=True, exist_ok=True)
            
            # Handler pour les logs INFO (requêtes normales)
            info_handler = logging.handlers.RotatingFileHandler(
                filename=str(log_path / "app_info.log"),
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding="utf-8"
            )
            info_handler.setLevel(logging.INFO)
            info_handler.setFormatter(json_formatter)
            info_handler.addFilter(lambda record: record.levelno == logging.INFO)
            
            # Handler pour les logs ERROR (erreurs et exceptions)
            error_handler = logging.handlers.RotatingFileHandler(
                filename=str(log_path / "app_error.log"),
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding="utf-8"
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(json_formatter)
            
            # Ajouter les handlers fichiers
            root_logger.addHandler(info_handler)
            root_logger.addHandler(error_handler)
        except (OSError, IOError) as e:
            # Si on échoue à créer les logs (ex: système de fichiers en lecture seule non détecté)
            # on continue avec seulement la console
            root_logger.warning(f"Could not initialize file logging: {e}. Falling back to console logging.")

    
    # Désactiver les logs verbeux de certaines bibliothèques
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Obtient un logger avec le nom spécifié.
    
    Args:
        name: Nom du logger (généralement __name__)
        
    Returns:
        logging.Logger: Logger configuré
    """
    return logging.getLogger(name)

