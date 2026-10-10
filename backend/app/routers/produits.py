"""
Router FastAPI pour la gestion des produits.
Gère les endpoints CRUD pour les produits.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.produit import Produit
from app.models.inventory import MouvementStock
from app.models.nomenclature import Nomenclature, NomenclatureLigne
from app.models.transaction import Transaction
from app.models.transformation import TransformationLigne
from app.models.user import Utilisateur
from app.schemas.produit import ProduitCreate, ProduitUpdate, ProduitRead, ProductType, ProductUsage
from app.utils.dependencies import get_current_active_user
from app.config import settings

router = APIRouter(prefix="/produits", tags=["Produits"])


@router.get("", response_model=List[ProduitRead], status_code=status.HTTP_200_OK)
def get_produits(
    skip: int = 0,
    limit: int = 100,
    est_actif: Optional[bool] = None,
    type_produit: Optional[ProductType] = None,
    usage: Optional[ProductUsage] = None,
    recherche: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère la liste des produits avec filtres optionnels.
    
    Permet de filtrer par statut actif/inactif et de rechercher par nom.
    
    Args:
        skip: Nombre de produits à sauter (pour la pagination)
        limit: Nombre maximum de produits à retourner
        est_actif: Filtre optionnel pour les produits actifs/inactifs (None = tous)
        recherche: Terme de recherche optionnel pour filtrer par nom (recherche partielle, insensible à la casse)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Returns:
        Liste des produits (ProduitRead)
    """
    query = db.query(Produit)

    if usage is not None:
        query = query.filter(Produit.usage == usage)

    if est_actif is not None:
        query = query.filter(Produit.est_actif == est_actif)
    
    # Filtre par type_produit si fourni
    if type_produit:
        query = query.filter(Produit.type_produit == type_produit.lower())
    
    # Filtre par recherche (nom_produit) si fourni
    if recherche:
        recherche_clean = recherche.strip()
        if recherche_clean:
            query = query.filter(
                Produit.nom_produit.ilike(f"%{recherche_clean}%")
            )
    
    # Pagination
    produits = query.offset(skip).limit(limit).all()
    
    return produits


@router.get("/{id}", response_model=ProduitRead, status_code=status.HTTP_200_OK)
def get_produit(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère les détails d'un produit par son ID.
    
    Args:
        id: ID du produit à récupérer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Returns:
        Détails du produit (ProduitRead)
        
    Raises:
        HTTPException 404: Si le produit n'existe pas
    """
    produit = db.query(Produit).filter(Produit.id_produit == id).first()
    
    if not produit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Produit avec l'ID {id} introuvable"
        )
    
    return produit


@router.post("", response_model=ProduitRead, status_code=status.HTTP_201_CREATED)
def create_produit(
    produit_data: ProduitCreate,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Crée un nouveau produit.
    
    Valide l'unicité du nom_produit avant la création.
    
    Args:
        produit_data: Données du nouveau produit (ProduitCreate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Returns:
        Produit créé (ProduitRead)
        
    Raises:
        HTTPException 400: Si un produit avec le même nom existe déjà
    """
    # Vérifier si un produit avec le même nom existe déjà (actif ou inactif)
    existing_produit = db.query(Produit).filter(
        Produit.nom_produit == produit_data.nom_produit.strip()
    ).first()
    
    if existing_produit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un produit avec le nom '{produit_data.nom_produit}' existe déjà"
        )
    
    # Créer le nouveau produit
    new_produit = Produit(
        nom_produit=produit_data.nom_produit.strip(),
        type_produit=produit_data.type_produit.lower() if produit_data.type_produit else 'produit_fini',
        est_actif=produit_data.est_actif,
        pour_clients=produit_data.pour_clients,
        pour_fournisseurs=produit_data.pour_fournisseurs
    )
    
    db.add(new_produit)
    db.commit()
    db.refresh(new_produit)
    
    return new_produit


@router.put("/{id}", response_model=ProduitRead, status_code=status.HTTP_200_OK)
def update_produit(
    id: int,
    produit_data: ProduitUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Met à jour un produit existant.
    
    Permet une mise à jour partielle (seuls les champs fournis seront modifiés).
    Valide l'unicité du nom_produit si celui-ci est modifié.
    
    Args:
        id: ID du produit à modifier
        produit_data: Données à mettre à jour (ProduitUpdate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Returns:
        Produit mis à jour (ProduitRead)
        
    Raises:
        HTTPException 404: Si le produit n'existe pas
        HTTPException 400: Si un autre produit avec le même nom existe déjà
    """
    produit = db.query(Produit).filter(Produit.id_produit == id).first()
    
    if not produit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Produit avec l'ID {id} introuvable"
        )
    
    # Vérifier si le nom existe déjà pour un autre produit
    if produit_data.nom_produit is not None:
        nom_clean = produit_data.nom_produit.strip()
        existing_produit = db.query(Produit).filter(
            Produit.nom_produit == nom_clean,
            Produit.id_produit != id
        ).first()
        
        if existing_produit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Un produit avec le nom '{nom_clean}' existe déjà"
            )
    
    # Mettre à jour les champs fournis
    update_data = produit_data.model_dump(exclude_unset=True)
    
    # Normalize legacy rows on edit and enforce one usage on every write.
    update_data.pop('usage', None)
    final_pour_clients = update_data.get('pour_clients', produit.usage == 'vendu')
    final_pour_fournisseurs = update_data.get('pour_fournisseurs', produit.usage == 'achete')
    if (not isinstance(final_pour_clients, bool)
        or not isinstance(final_pour_fournisseurs, bool)
        or final_pour_clients == final_pour_fournisseurs):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le produit doit être soit vendu, soit acheté",
        )
    update_data['pour_clients'] = final_pour_clients
    update_data['pour_fournisseurs'] = final_pour_fournisseurs

    for field, value in update_data.items():
        if field == "nom_produit" and value is not None:
            setattr(produit, field, value.strip())
        else:
            setattr(produit, field, value)
    
    db.commit()
    db.refresh(produit)
    
    return produit


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_produit(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Supprime un produit (soft delete).
    
    Effectue un soft delete en mettant est_actif à False.
    Le produit ne sera plus visible dans les listes par défaut mais restera en base de données.
    
    Args:
        id: ID du produit à supprimer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Raises:
        HTTPException 404: Si le produit n'existe pas
        HTTPException 400: Si le produit est déjà inactif
    """
    produit = db.query(Produit).filter(Produit.id_produit == id).first()
    
    if not produit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Produit avec l'ID {id} introuvable"
        )
    
    # Vérifier si le produit est déjà inactif
    if not produit.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le produit avec l'ID {id} est déjà inactif"
        )
    
    # Soft delete : mettre est_actif à False
    produit.est_actif = False
    
    db.commit()
    
    return None


@router.delete("/{id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def delete_produit_permanently(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """Delete a product permanently only when no business history references it."""
    produit = db.query(Produit).filter(Produit.id_produit == id).first()
    if not produit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Produit avec l'ID {id} introuvable"
        )

    # Generated egg products are managed by Production and must stay in the catalog.
    if produit.nom_produit.strip().lower().startswith(("oeufs -", "œufs -")):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Les produits d'œufs gérés par la production ne peuvent pas être supprimés"
        )

    references = [
        ("transaction(s)", db.query(Transaction).filter(Transaction.id_produit == id).count()),
        ("mouvement(s) de stock", db.query(MouvementStock).filter(MouvementStock.id_produit == id).count()),
        ("nomenclature(s) de sortie", db.query(Nomenclature).filter(Nomenclature.id_produit_sortie == id).count()),
        ("ligne(s) de nomenclature", db.query(NomenclatureLigne).filter(NomenclatureLigne.id_produit_entree == id).count()),
        ("ligne(s) de transformation", db.query(TransformationLigne).filter(TransformationLigne.id_produit == id).count()),
    ]
    blocking_references = [f"{count} {label}" for label, count in references if count]
    if blocking_references:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Ce produit est utilisé dans l'historique "
                f"({', '.join(blocking_references)}). Désactivez-le pour le conserver."
            )
        )

    try:
        db.delete(produit)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Ce produit est encore référencé par des données liées et ne peut pas être supprimé. "
                "Désactivez-le pour conserver l'historique."
            )
        )
    return None


@router.patch("/{id}/reactivate", response_model=ProduitRead, status_code=status.HTTP_200_OK)
def reactivate_produit(
    id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Réactive un produit inactif.
    
    Effectue l'inverse du soft delete en remettant est_actif à True.
    
    Args:
        id: ID du produit à réactiver
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Returns:
        Produit réactivé (ProduitRead)
        
    Raises:
        HTTPException 404: Si le produit n'existe pas
        HTTPException 400: Si le produit est déjà actif
    """
    produit = db.query(Produit).filter(Produit.id_produit == id).first()
    
    if not produit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Produit avec l'ID {id} introuvable"
        )
    
    # Vérifier si le produit est déjà actif
    if produit.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le produit avec l'ID {id} est déjà actif"
        )
    
    # Réactiver : mettre est_actif à True
    produit.est_actif = True
    
    db.commit()
    db.refresh(produit)
    
    return produit


@router.get("/par-type/{type_transaction}", response_model=List[ProduitRead], status_code=status.HTTP_200_OK)
def get_produits_par_type(
    type_transaction: str,
    skip: int = 0,
    limit: int = 100,
    est_actif: Optional[bool] = True,
    type_produit: Optional[ProductType] = None,
    usage: Optional[ProductUsage] = None,
    recherche: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[Utilisateur] = Depends(get_current_active_user)
):
    """
    Récupère la liste des produits filtrés par type de transaction.
    
    Cette fonction est utile pour afficher uniquement les produits pertinents
    lors de la création/modification d'une transaction.
    
    Args:
        type_transaction: Type de transaction ('client' ou 'fournisseur')
        skip: Nombre de produits à sauter (pagination)
        limit: Nombre maximum de produits à retourner
        est_actif: Filtre pour les produits actifs uniquement (None = tous)
        recherche: Terme de recherche optionnel pour filtrer par nom (recherche partielle, insensible à la casse)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance, None si auth désactivée)
        
    Returns:
        Liste des produits filtrés (ProduitRead)
        
    Raises:
        HTTPException 400: Si type_transaction n'est pas 'client' ou 'fournisseur'
    
    Examples:
        GET /produits/par-type/client -> Retourne les produits pour les clients
        GET /produits/par-type/fournisseur -> Retourne les produits pour les fournisseurs
        GET /produits/par-type/client?est_actif=true -> Retourne les produits actifs pour les clients
    """
    # Valider le type de transaction
    type_transaction_lower = type_transaction.lower()
    if type_transaction_lower not in ['client', 'fournisseur']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="type_transaction doit être 'client' ou 'fournisseur'"
        )
    
    query = db.query(Produit)

    if usage is not None:
        query = query.filter(Produit.usage == usage)

    if est_actif is not None:
        query = query.filter(Produit.est_actif == est_actif)
    
    # Filter by transaction type
    if type_transaction_lower == 'client':
        query = query.filter(Produit.usage == 'vendu')
    else:  # fournisseur
        query = query.filter(Produit.usage == 'achete')
    
    # Filter by product type
    if type_produit:
        query = query.filter(Produit.type_produit == type_produit.lower())
    
    # Filtre par recherche (nom_produit) si fourni
    if recherche:
        recherche_clean = recherche.strip()
        if recherche_clean:
            query = query.filter(
                Produit.nom_produit.ilike(f"%{recherche_clean}%")
            )
    
    # Pagination et tri par nom
    produits = query.order_by(Produit.nom_produit).offset(skip).limit(limit).all()
    
    return produits
