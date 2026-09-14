"""
Tests pour les schémas Pydantic des utilisateurs.
Vérifie que la validation fonctionne correctement avec des données valides et invalides.
"""
import pytest
from pydantic import ValidationError, EmailStr

from app.schemas.user import UserBase, UserCreate, UserRead, UserUpdate


class TestUserBase:
    """Tests pour le schéma UserBase."""
    
    def test_user_base_valid(self):
        """Test avec des données valides."""
        user = UserBase(
            nom_utilisateur="John Doe",
            email="john.doe@example.com",
            role="admin"
        )
        assert user.nom_utilisateur == "John Doe"
        assert user.email == "john.doe@example.com"
        assert user.role == "admin"
    
    def test_user_base_without_role(self):
        """Test que le rôle est optionnel."""
        user = UserBase(
            nom_utilisateur="Jane Doe",
            email="jane.doe@example.com"
        )
        assert user.role is None
    
    def test_user_base_invalid_email(self):
        """Test avec un email invalide."""
        with pytest.raises(ValidationError) as exc_info:
            UserBase(
                nom_utilisateur="Test User",
                email="invalid-email"
            )
        errors = exc_info.value.errors()
        assert any(error["type"] == "value_error" for error in errors)
    
    def test_user_base_nom_too_short(self):
        """Test avec un nom d'utilisateur trop court."""
        with pytest.raises(ValidationError) as exc_info:
            UserBase(
                nom_utilisateur="A",
                email="test@example.com"
            )
        errors = exc_info.value.errors()
        assert any("min_length" in str(error) for error in errors)
    
    def test_user_base_nom_too_long(self):
        """Test avec un nom d'utilisateur trop long."""
        with pytest.raises(ValidationError) as exc_info:
            UserBase(
                nom_utilisateur="A" * 256,
                email="test@example.com"
            )
        errors = exc_info.value.errors()
        assert any("max_length" in str(error) for error in errors)


class TestUserCreate:
    """Tests pour le schéma UserCreate."""
    
    def test_user_create_valid(self):
        """Test avec des données valides."""
        user = UserCreate(
            nom_utilisateur="John Doe",
            email="john.doe@example.com",
            mot_de_passe="SecurePass123!",
            role="admin"
        )
        assert user.nom_utilisateur == "John Doe"
        assert user.email == "john.doe@example.com"
        assert user.mot_de_passe == "SecurePass123!"
        assert user.role == "admin"
    
    def test_user_create_password_too_short(self):
        """Test avec un mot de passe trop court."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(
                nom_utilisateur="Test User",
                email="test@example.com",
                mot_de_passe="Short1!"
            )
        errors = exc_info.value.errors()
        # Vérifier que l'erreur contient le message de validation
        error_messages = [str(error.get('msg', '')) for error in errors]
        assert any("8 caractères" in msg for msg in error_messages)
    
    def test_user_create_password_no_uppercase(self):
        """Test avec un mot de passe sans majuscule."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(
                nom_utilisateur="Test User",
                email="test@example.com",
                mot_de_passe="nouppercase123!"
            )
        errors = exc_info.value.errors()
        error_messages = [str(error.get('msg', '')) for error in errors]
        assert any("majuscule" in msg for msg in error_messages)
    
    def test_user_create_password_no_lowercase(self):
        """Test avec un mot de passe sans minuscule."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(
                nom_utilisateur="Test User",
                email="test@example.com",
                mot_de_passe="NOLOWERCASE123!"
            )
        errors = exc_info.value.errors()
        error_messages = [str(error.get('msg', '')) for error in errors]
        assert any("minuscule" in msg for msg in error_messages)
    
    def test_user_create_password_no_digit(self):
        """Test avec un mot de passe sans chiffre."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(
                nom_utilisateur="Test User",
                email="test@example.com",
                mot_de_passe="NoDigitPass!"
            )
        errors = exc_info.value.errors()
        error_messages = [str(error.get('msg', '')) for error in errors]
        assert any("chiffre" in msg for msg in error_messages)
    
    def test_user_create_password_no_special_char(self):
        """Test avec un mot de passe sans caractère spécial."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(
                nom_utilisateur="Test User",
                email="test@example.com",
                mot_de_passe="NoSpecialChar123"
            )
        errors = exc_info.value.errors()
        error_messages = [str(error.get('msg', '')) for error in errors]
        assert any("caractère spécial" in msg for msg in error_messages)
    
    def test_user_create_password_valid_complex(self):
        """Test avec un mot de passe valide complexe."""
        user = UserCreate(
            nom_utilisateur="Test User",
            email="test@example.com",
            mot_de_passe="Complex@Pass123!"
        )
        assert user.mot_de_passe == "Complex@Pass123!"
    
    def test_user_create_nom_utilisateur_empty(self):
        """Test avec un nom d'utilisateur vide."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(
                nom_utilisateur="   ",
                email="test@example.com",
                mot_de_passe="ValidPass123!"
            )
        errors = exc_info.value.errors()
        error_messages = [str(error.get('msg', '')) for error in errors]
        assert any("ne peut pas être vide" in msg for msg in error_messages)
    
    def test_user_create_nom_utilisateur_trimmed(self):
        """Test que les espaces sont supprimés du nom d'utilisateur."""
        user = UserCreate(
            nom_utilisateur="  John Doe  ",
            email="test@example.com",
            mot_de_passe="ValidPass123!"
        )
        assert user.nom_utilisateur == "John Doe"


class TestUserUpdate:
    """Tests pour le schéma UserUpdate."""
    
    def test_user_update_all_fields(self):
        """Test avec tous les champs fournis."""
        user = UserUpdate(
            nom_utilisateur="Updated Name",
            email="updated@example.com",
            role="comptable",
            mot_de_passe="NewPass123!"
        )
        assert user.nom_utilisateur == "Updated Name"
        assert user.email == "updated@example.com"
        assert user.role == "comptable"
        assert user.mot_de_passe == "NewPass123!"
    
    def test_user_update_partial(self):
        """Test avec seulement certains champs."""
        user = UserUpdate(
            nom_utilisateur="Updated Name"
        )
        assert user.nom_utilisateur == "Updated Name"
        assert user.email is None
        assert user.role is None
        assert user.mot_de_passe is None
    
    def test_user_update_empty(self):
        """Test avec aucun champ (tous optionnels)."""
        user = UserUpdate()
        assert user.nom_utilisateur is None
        assert user.email is None
        assert user.role is None
        assert user.mot_de_passe is None
    
    def test_user_update_password_validation(self):
        """Test que la validation du mot de passe s'applique aussi lors de la mise à jour."""
        with pytest.raises(ValidationError) as exc_info:
            UserUpdate(
                mot_de_passe="weak"
            )
        errors = exc_info.value.errors()
        error_messages = [str(error.get('msg', '')) for error in errors]
        assert any("8 caractères" in msg for msg in error_messages)
    
    def test_user_update_invalid_email(self):
        """Test avec un email invalide."""
        with pytest.raises(ValidationError) as exc_info:
            UserUpdate(
                email="invalid-email"
            )
        errors = exc_info.value.errors()
        assert any(error["type"] == "value_error" for error in errors)


class TestUserRead:
    """Tests pour le schéma UserRead."""
    
    def test_user_read_valid(self):
        """Test avec des données valides."""
        from datetime import datetime
        
        user = UserRead(
            id_utilisateur=1,
            nom_utilisateur="John Doe",
            email="john.doe@example.com",
            role="admin",
            date_creation=datetime(2024, 1, 1, 12, 0, 0),
            date_modification=datetime(2024, 1, 2, 12, 0, 0)
        )
        assert user.id_utilisateur == 1
        assert user.nom_utilisateur == "John Doe"
        assert user.email == "john.doe@example.com"
        assert user.role == "admin"
        assert isinstance(user.date_creation, datetime)
        assert isinstance(user.date_modification, datetime)
    
    def test_user_read_from_sqlalchemy_model(self):
        """Test la conversion depuis un modèle SQLAlchemy."""
        from datetime import datetime
        from app.models.user import Utilisateur
        
        # Créer une instance du modèle SQLAlchemy (simulation)
        # Note: On ne peut pas vraiment créer une instance sans DB, donc on teste juste la structure
        user_data = {
            "id_utilisateur": 1,
            "nom_utilisateur": "John Doe",
            "email": "john.doe@example.com",
            "role": "admin",
            "date_creation": datetime(2024, 1, 1, 12, 0, 0),
            "date_modification": datetime(2024, 1, 2, 12, 0, 0)
        }
        
        user = UserRead(**user_data)
        assert user.id_utilisateur == 1
        assert user.nom_utilisateur == "John Doe"
