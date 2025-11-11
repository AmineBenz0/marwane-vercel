"""
Router FastAPI pour la gestion des transactions.
Gère les endpoints CRUD pour les transactions.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.models.transaction import Transaction
from app.models.ligne_transaction import LigneTransaction
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.user import Utilisateur
from app.models.audit import TransactionAudit
from app.models.caisse import Caisse
from app.schemas.transaction import (
    TransactionCreate,
    TransactionCreateWithLines,
    TransactionUpdate,
    TransactionRead,
    TransactionReadWithLines,
    LigneTransactionCreate,
    LigneTransactionRead,
    TransactionAuditRead
)
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("", response_model=List[TransactionRead], status_code=status.HTTP_200_OK)
def get_transactions(
    skip: int = 0,
    limit: int = 100,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    id_client: Optional[int] = None,
    id_fournisseur: Optional[int] = None,
    montant_min: Optional[Decimal] = None,
    montant_max: Optional[Decimal] = None,
    est_actif: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère la liste des transactions avec filtres optionnels.
    
    Permet de filtrer par date, client, fournisseur, montant et statut actif.
    
    Args:
        skip: Nombre de transactions à sauter (pour la pagination)
        limit: Nombre maximum de transactions à retourner
        date_debut: Date de début pour filtrer les transactions (inclusive)
        date_fin: Date de fin pour filtrer les transactions (inclusive)
        id_client: ID du client pour filtrer les transactions
        id_fournisseur: ID du fournisseur pour filtrer les transactions
        montant_min: Montant minimum pour filtrer les transactions
        montant_max: Montant maximum pour filtrer les transactions
        est_actif: Filtre optionnel pour les transactions actives/inactives (None = tous)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des transactions (TransactionRead)
    """
    query = db.query(Transaction)
    
    # Filtre par date
    if date_debut:
        query = query.filter(Transaction.date_transaction >= date_debut)
    if date_fin:
        query = query.filter(Transaction.date_transaction <= date_fin)
    
    # Filtre par client
    if id_client is not None:
        query = query.filter(Transaction.id_client == id_client)
    
    # Filtre par fournisseur
    if id_fournisseur is not None:
        query = query.filter(Transaction.id_fournisseur == id_fournisseur)
    
    # Filtre par montant
    if montant_min is not None:
        query = query.filter(Transaction.montant_total >= montant_min)
    if montant_max is not None:
        query = query.filter(Transaction.montant_total <= montant_max)
    
    # Filtre par est_actif
    if est_actif is not None:
        query = query.filter(Transaction.est_actif == est_actif)
    
    # Pagination
    transactions = query.order_by(Transaction.date_transaction.desc()).offset(skip).limit(limit).all()
    
    return transactions


@router.get("/{id}/audit", response_model=List[TransactionAuditRead], status_code=status.HTTP_200_OK)
def get_transaction_audit(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère l'historique complet des modifications d'une transaction.
    
    Retourne la liste de tous les changements enregistrés dans la table Transactions_Audit
    pour la transaction spécifiée, avec les informations : qui, quand, quel champ, 
    ancienne/nouvelle valeur.
    
    Args:
        id: ID de la transaction pour laquelle récupérer l'audit
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des enregistrements d'audit (TransactionAuditRead) triés par date (plus récent en premier)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
    """
    # Vérifier que la transaction existe
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id} introuvable"
        )
    
    # Récupérer tous les enregistrements d'audit pour cette transaction
    # avec les informations de l'utilisateur (jointure)
    audits = db.query(
        TransactionAudit,
        Utilisateur.nom_utilisateur,
        Utilisateur.email
    ).join(
        Utilisateur, TransactionAudit.id_utilisateur == Utilisateur.id_utilisateur
    ).filter(
        TransactionAudit.id_transaction == id
    ).order_by(
        TransactionAudit.date_changement.desc()
    ).all()
    
    # Construire la liste de réponses avec les informations utilisateur
    audit_list = []
    for audit, nom_utilisateur, email_utilisateur in audits:
        audit_dict = {
            "id_audit": audit.id_audit,
            "id_transaction": audit.id_transaction,
            "id_utilisateur": audit.id_utilisateur,
            "nom_utilisateur": nom_utilisateur,
            "email_utilisateur": email_utilisateur,
            "date_changement": audit.date_changement,
            "champ_modifie": audit.champ_modifie,
            "ancienne_valeur": audit.ancienne_valeur,
            "nouvelle_valeur": audit.nouvelle_valeur
        }
        audit_list.append(TransactionAuditRead(**audit_dict))
    
    return audit_list


@router.get("/{id}", response_model=TransactionReadWithLines, status_code=status.HTTP_200_OK)
def get_transaction(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les détails d'une transaction par son ID avec ses lignes.
    
    Args:
        id: ID de la transaction à récupérer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Détails de la transaction avec ses lignes (TransactionReadWithLines)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
    """
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id} introuvable"
        )
    
    # Charger les lignes de transaction
    lignes = db.query(LigneTransaction).filter(
        LigneTransaction.id_transaction == id
    ).all()
    
    # Construire la réponse avec les lignes
    transaction_dict = {
        "id_transaction": transaction.id_transaction,
        "date_transaction": transaction.date_transaction,
        "montant_total": transaction.montant_total,
        "est_actif": transaction.est_actif,
        "id_client": transaction.id_client,
        "id_fournisseur": transaction.id_fournisseur,
        "date_creation": transaction.date_creation,
        "date_modification": transaction.date_modification,
        "id_utilisateur_creation": transaction.id_utilisateur_creation,
        "id_utilisateur_modification": transaction.id_utilisateur_modification,
        "lignes_transaction": lignes
    }
    
    return TransactionReadWithLines(**transaction_dict)


@router.post("", response_model=TransactionReadWithLines, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction_data: TransactionCreateWithLines,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée une nouvelle transaction avec ou sans lignes.
    
    Si des lignes sont fournies, le montant_total est calculé automatiquement à partir des lignes.
    Sinon, le montant_total doit être fourni explicitement.
    Enregistre automatiquement l'ID de l'utilisateur qui a créé la transaction.
    
    Args:
        transaction_data: Données de la nouvelle transaction (TransactionCreate ou TransactionCreateWithLines)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Transaction créée avec ses lignes (TransactionReadWithLines)
        
    Raises:
        HTTPException 400: Si le client ou le fournisseur n'existe pas
        HTTPException 400: Si un produit n'existe pas
    """
    # Vérifier que le client existe si fourni
    if transaction_data.id_client is not None:
        client = db.query(Client).filter(Client.id_client == transaction_data.id_client).first()
        if not client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Client avec l'ID {transaction_data.id_client} introuvable"
            )
    
    # Vérifier que le fournisseur existe si fourni
    if transaction_data.id_fournisseur is not None:
        fournisseur = db.query(Fournisseur).filter(
            Fournisseur.id_fournisseur == transaction_data.id_fournisseur
        ).first()
        if not fournisseur:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Fournisseur avec l'ID {transaction_data.id_fournisseur} introuvable"
            )
    
    # Déterminer le montant total et les lignes
    if transaction_data.lignes and len(transaction_data.lignes) > 0:
        # Vérifier que tous les produits existent
        produit_ids = [ligne.id_produit for ligne in transaction_data.lignes]
        produits = db.query(Produit).filter(Produit.id_produit.in_(produit_ids)).all()
        produits_ids_found = {p.id_produit for p in produits}
        
        for produit_id in produit_ids:
            if produit_id not in produits_ids_found:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Produit avec l'ID {produit_id} introuvable"
                )
        
        # Calculer le montant total à partir des lignes
        montant_total = transaction_data.calculate_montant_total()
        lignes_to_create = transaction_data.lignes
    else:
        # Pas de lignes : utiliser montant_total fourni explicitement
        if transaction_data.montant_total is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="montant_total doit être fourni si aucune ligne n'est fournie"
            )
        montant_total = transaction_data.montant_total
        lignes_to_create = []
    
    # Créer la transaction
    new_transaction = Transaction(
        date_transaction=transaction_data.date_transaction,
        montant_total=montant_total,
        est_actif=transaction_data.est_actif,
        id_client=transaction_data.id_client,
        id_fournisseur=transaction_data.id_fournisseur,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(new_transaction)
    db.flush()  # Pour obtenir l'ID de la transaction
    
    # Créer les lignes de transaction si fournies
    for ligne_data in lignes_to_create:
        new_ligne = LigneTransaction(
            id_transaction=new_transaction.id_transaction,
            id_produit=ligne_data.id_produit,
            quantite=ligne_data.quantite
        )
        db.add(new_ligne)
    
    # Créer automatiquement un mouvement de caisse pour cette transaction
    # Si c'est une transaction client : ENTRÉE (argent qui entre)
    # Si c'est une transaction fournisseur : SORTIE (argent qui sort)
    if new_transaction.id_client is not None:
        type_mouvement = 'ENTREE'
    elif new_transaction.id_fournisseur is not None:
        type_mouvement = 'SORTIE'
    else:
        # Ne devrait jamais arriver grâce aux contraintes, mais par sécurité
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une transaction doit avoir soit un client, soit un fournisseur"
        )
    
    new_mouvement = Caisse(
        montant=montant_total,
        type_mouvement=type_mouvement,
        id_transaction=new_transaction.id_transaction
    )
    db.add(new_mouvement)
    
    db.commit()
    db.refresh(new_transaction)
    
    # Charger les lignes créées
    lignes = db.query(LigneTransaction).filter(
        LigneTransaction.id_transaction == new_transaction.id_transaction
    ).all()
    
    # Construire la réponse
    transaction_dict = {
        "id_transaction": new_transaction.id_transaction,
        "date_transaction": new_transaction.date_transaction,
        "montant_total": new_transaction.montant_total,
        "est_actif": new_transaction.est_actif,
        "id_client": new_transaction.id_client,
        "id_fournisseur": new_transaction.id_fournisseur,
        "date_creation": new_transaction.date_creation,
        "date_modification": new_transaction.date_modification,
        "id_utilisateur_creation": new_transaction.id_utilisateur_creation,
        "id_utilisateur_modification": new_transaction.id_utilisateur_modification,
        "lignes_transaction": lignes
    }
    
    return TransactionReadWithLines(**transaction_dict)


@router.put("/{id}", response_model=TransactionReadWithLines, status_code=status.HTTP_200_OK)
def update_transaction(
    id: int,
    transaction_data: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Met à jour une transaction existante.
    
    Permet une mise à jour partielle (seuls les champs fournis seront modifiés).
    Enregistre automatiquement l'ID de l'utilisateur qui a modifié la transaction.
    
    Args:
        id: ID de la transaction à modifier
        transaction_data: Données à mettre à jour (TransactionUpdate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Transaction mise à jour avec ses lignes (TransactionReadWithLines)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
        HTTPException 400: Si le client ou le fournisseur n'existe pas
    """
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id} introuvable"
        )
    
    # Vérifier que le client existe si fourni dans la mise à jour
    if transaction_data.id_client is not None:
        client = db.query(Client).filter(Client.id_client == transaction_data.id_client).first()
        if not client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Client avec l'ID {transaction_data.id_client} introuvable"
            )
    
    # Vérifier que le fournisseur existe si fourni dans la mise à jour
    if transaction_data.id_fournisseur is not None:
        fournisseur = db.query(Fournisseur).filter(
            Fournisseur.id_fournisseur == transaction_data.id_fournisseur
        ).first()
        if not fournisseur:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Fournisseur avec l'ID {transaction_data.id_fournisseur} introuvable"
            )
    
    # Gérer la mise à jour des lignes si fournies
    lignes_provided = transaction_data.lignes is not None
    if lignes_provided:
        # Vérifier que tous les produits existent
        produit_ids = [ligne.id_produit for ligne in transaction_data.lignes]
        produits = db.query(Produit).filter(Produit.id_produit.in_(produit_ids)).all()
        produits_ids_found = {p.id_produit for p in produits}
        
        for produit_id in produit_ids:
            if produit_id not in produits_ids_found:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Produit avec l'ID {produit_id} introuvable"
                )
        
        # Calculer le nouveau montant total à partir des lignes
        new_montant_total = transaction_data.calculate_montant_total_from_lignes()
        
        # Supprimer les anciennes lignes
        db.query(LigneTransaction).filter(
            LigneTransaction.id_transaction == id
        ).delete()
        
        # Créer les nouvelles lignes
        for ligne_data in transaction_data.lignes:
            new_ligne = LigneTransaction(
                id_transaction=transaction.id_transaction,
                id_produit=ligne_data.id_produit,
                quantite=ligne_data.quantite
            )
            db.add(new_ligne)
        
        # Mettre à jour le montant total
        transaction.montant_total = new_montant_total
    
    # Mettre à jour les autres champs fournis (exclure lignes et montant_total si lignes fournies)
    update_data = transaction_data.model_dump(exclude_unset=True, exclude={'lignes'})
    if lignes_provided:
        update_data.pop('montant_total', None)  # Ne pas écraser le montant calculé
    
    for field, value in update_data.items():
        setattr(transaction, field, value)
    
    # Enregistrer l'utilisateur qui a modifié (si authentification activée)
    if current_user:
        transaction.id_utilisateur_modification = current_user.id_utilisateur
    
    db.commit()
    db.refresh(transaction)
    
    # Mettre à jour le mouvement de caisse associé si le montant a changé
    mouvement_caisse = db.query(Caisse).filter(
        Caisse.id_transaction == transaction.id_transaction
    ).first()
    
    if mouvement_caisse and mouvement_caisse.montant != transaction.montant_total:
        # Le montant a changé, mettre à jour le mouvement de caisse
        mouvement_caisse.montant = transaction.montant_total
        db.commit()
    
    # Charger les lignes
    lignes = db.query(LigneTransaction).filter(
        LigneTransaction.id_transaction == transaction.id_transaction
    ).all()
    
    # Construire la réponse
    transaction_dict = {
        "id_transaction": transaction.id_transaction,
        "date_transaction": transaction.date_transaction,
        "montant_total": transaction.montant_total,
        "est_actif": transaction.est_actif,
        "id_client": transaction.id_client,
        "id_fournisseur": transaction.id_fournisseur,
        "date_creation": transaction.date_creation,
        "date_modification": transaction.date_modification,
        "id_utilisateur_creation": transaction.id_utilisateur_creation,
        "id_utilisateur_modification": transaction.id_utilisateur_modification,
        "lignes_transaction": lignes
    }
    
    return TransactionReadWithLines(**transaction_dict)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Supprime une transaction (soft delete).
    
    Effectue un soft delete en mettant est_actif à False.
    La transaction ne sera plus visible dans les listes par défaut mais restera en base de données.
    Enregistre automatiquement l'ID de l'utilisateur qui a supprimé la transaction.
    
    Args:
        id: ID de la transaction à supprimer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
        HTTPException 400: Si la transaction est déjà inactive
    """
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id} introuvable"
        )
    
    # Vérifier si la transaction est déjà inactive
    if not transaction.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La transaction avec l'ID {id} est déjà inactive"
        )
    
    # Soft delete : mettre est_actif à False
    transaction.est_actif = False
    # Enregistrer l'utilisateur qui a modifié (si authentification activée)
    if current_user:
        transaction.id_utilisateur_modification = current_user.id_utilisateur
    
    db.commit()
    
    return None


@router.patch("/{id}/reactivate", response_model=TransactionReadWithLines, status_code=status.HTTP_200_OK)
def reactivate_transaction(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Réactive une transaction inactive.
    
    Effectue l'inverse du soft delete en remettant est_actif à True.
    Enregistre automatiquement l'ID de l'utilisateur qui a réactivé la transaction.
    
    Args:
        id: ID de la transaction à réactiver
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Transaction réactivée avec ses lignes (TransactionReadWithLines)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
        HTTPException 400: Si la transaction est déjà active
    """
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id} introuvable"
        )
    
    # Vérifier si la transaction est déjà active
    if transaction.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La transaction avec l'ID {id} est déjà active"
        )
    
    # Réactiver : mettre est_actif à True
    transaction.est_actif = True
    # Enregistrer l'utilisateur qui a réactivé (si authentification activée)
    if current_user:
        transaction.id_utilisateur_modification = current_user.id_utilisateur
    
    db.commit()
    db.refresh(transaction)
    
    # Charger les lignes
    lignes = db.query(LigneTransaction).filter(
        LigneTransaction.id_transaction == transaction.id_transaction
    ).all()
    
    # Construire la réponse
    transaction_dict = {
        "id_transaction": transaction.id_transaction,
        "date_transaction": transaction.date_transaction,
        "montant_total": transaction.montant_total,
        "est_actif": transaction.est_actif,
        "id_client": transaction.id_client,
        "id_fournisseur": transaction.id_fournisseur,
        "date_creation": transaction.date_creation,
        "date_modification": transaction.date_modification,
        "id_utilisateur_creation": transaction.id_utilisateur_creation,
        "id_utilisateur_modification": transaction.id_utilisateur_modification,
        "lignes_transaction": lignes
    }
    
    return TransactionReadWithLines(**transaction_dict)

