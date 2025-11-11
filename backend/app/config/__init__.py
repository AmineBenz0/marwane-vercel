"""
Configuration de l'application.
"""
# Import depuis le module config.py parent
# Note: Il y a un conflit de nommage entre app/config.py et app/config/
# On importe depuis le fichier parent directement
import importlib.util
from pathlib import Path

# Charger config.py depuis le parent
config_file = Path(__file__).parent.parent / "config.py"
spec = importlib.util.spec_from_file_location("app.config_module", config_file)
config_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config_module)

# Exporter settings
settings = config_module.settings

# Importer depuis logging_config
from app.config.logging_config import setup_logging, get_logger

__all__ = ["settings", "setup_logging", "get_logger"]

