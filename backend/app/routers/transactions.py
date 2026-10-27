"""
Router FastAPI pour la gestion des transactions.
Gère les endpoints CRUD pour les transactions.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload, selectinload
from datetime import date, datetime, timezone
from decimal import Decimal
import json

from app.database import get_db
from app.models.production import Production
from app.models.egg_allocation import EggAllocation
from app.models.transaction import Transaction
from app.models.paiement import Paiement
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.produit import Produit
from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.user import Utilisateur
from app.models.audit import TransactionAudit
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionRead,
    DeferredSaleCompletion,
    DeferredSalePreview,
    DeferredSaleSummary,
    DeferredSaleReschedule,
    TransactionAuditRead
)
from app.schemas.paiement import PaiementCreate
from app.schemas.transaction_payment import (
    TransactionPaymentBatchCreate,
    TransactionPaymentBatchItemRead,
)
from app.utils.dependencies import get_current_active_user
from app.utils.production_cycles import cycle_schedule
from app.utils.egg_product_sync import parse_sellable_egg_product_name
from app.services.inventory import record_transaction_movement, reverse_source_movements
from app.services.financial_ledger import void_payment, sync_payment_cash_movement
from app.services.financial import validate_payment_date, validate_payment_idempotency
from app.services.payment_validation import validate_lc_payment
from app.services.payment_validation import resolve_payment_funding
from app.services.ledger import record_correction
from app.services.egg_sales import resolve_sale_source, sale_sources, completion_preview, complete_deferred_sale, deferred_sales_overview, deferred_sale_reservations, assign_pending_promises, source_balances
from app.utils.business_date import business_date

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("/production-sources")
def get_production_sources(
    id_batiment: int,
    date_production: Optional[date] = None,
    through_date: Optional[date] = None,
    exclude_transaction_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    if (date_production is None) == (through_date is None):
        raise HTTPException(400, "Indiquez une date de saisie ou une date limite de stock.")
    return sale_sources(db, id_batiment, date_production, exclude_transaction_id,
                        through_date=through_date)


@router.get("/deferred-sales", response_model=List[DeferredSaleSummary])
def get_deferred_sales(
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    return deferred_sales_overview(db)


def _validate_source_batiment(
    *,
    id_batiment: Optional[int],
    id_client: Optional[int],
    produit: Produit,
    db: Session,
) -> None:
    """
    Validate the optional source building used to decrement egg stock.
    """
    if id_batiment is None:
        return

    if id_client is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le batiment source est reserve aux ventes clients",
        )

    if not parse_sellable_egg_product_name(produit.nom_produit):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le batiment source ne peut etre utilise que pour une vente d'oeufs",
        )

    batiment = db.query(Batiment).filter(Batiment.id_batiment == id_batiment).first()
    if not batiment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batiment avec l'ID {id_batiment} introuvable",
        )


def _resolve_transaction_cycle(
    *,
    id_cycle: Optional[int],
    id_batiment: Optional[int],
    id_client: Optional[int],
    date_transaction: date,
    produit: Produit,
    db: Session,
) -> Optional[int]:
    if id_batiment is None or id_client is None:
        return None
    if not parse_sellable_egg_product_name(produit.nom_produit):
        return None

    if id_cycle is not None:
        cycle = db.query(CycleProduction).filter(CycleProduction.id_cycle == id_cycle).first()
        if not cycle or cycle.id_batiment != id_batiment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lot introuvable pour ce batiment",
            )
        schedule = cycle_schedule(cycle)
        if date_transaction < schedule.date_debut or date_transaction > schedule.date_fin_prevue:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La date de vente est en dehors du lot",
            )
        return cycle.id_cycle

    # A source building is sufficient for daily egg stock accounting. Lots
    # remain optional and are only attached when explicitly supplied.
    return None


@router.post("/batch", response_model=List[TransactionRead], status_code=status.HTTP_201_CREATED)
def create_transactions_batch(
    transactions_data: List[TransactionCreate],
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée plusieurs transactions de manière atomique.
    
    Toutes les transactions sont créées en une seule transaction DB.
    Si une transaction échoue, aucune n'est créée (rollback automatique).
    Utile pour créer plusieurs lignes de produits pour le même client/fournisseur.
    
    Args:
        transactions_data: Liste des transactions à créer (List[TransactionCreate])
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des transactions créées (List[TransactionRead])
        
    Raises:
        HTTPException 400: Si un client, fournisseur ou produit n'existe pas
        HTTPException 400: Si une validation échoue
    """
    if not transactions_data or len(transactions_data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Au moins une transaction doit être fournie"
        )
    
    try:
        created_transactions = []
        
        # Collecter tous les IDs pour validation en batch
        client_ids = set()
        fournisseur_ids = set()
        produit_ids = set()
        
        for tx_data in transactions_data:
            resolve_sale_source(db, tx_data)
            if tx_data.id_client is not None:
                client_ids.add(tx_data.id_client)
            if tx_data.id_fournisseur is not None:
                fournisseur_ids.add(tx_data.id_fournisseur)
            produit_ids.add(tx_data.id_produit)
        
        # Valider que tous les clients existent
        if client_ids:
            clients = db.query(Client).filter(Client.id_client.in_(client_ids)).all()
            clients_dict = {c.id_client: c for c in clients}
            for client_id in client_ids:
                if client_id not in clients_dict:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Client avec l'ID {client_id} introuvable"
                    )
        
        # Valider que tous les fournisseurs existent
        if fournisseur_ids:
            fournisseurs = db.query(Fournisseur).filter(
                Fournisseur.id_fournisseur.in_(fournisseur_ids)
            ).all()
            fournisseurs_dict = {f.id_fournisseur: f for f in fournisseurs}
            for fournisseur_id in fournisseur_ids:
                if fournisseur_id not in fournisseurs_dict:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Fournisseur avec l'ID {fournisseur_id} introuvable"
                    )
        
        # Valider que tous les produits existent
        produits = db.query(Produit).filter(Produit.id_produit.in_(produit_ids)).all()
        produits_dict = {p.id_produit: p for p in produits}
        for produit_id in produit_ids:
            if produit_id not in produits_dict:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Produit avec l'ID {produit_id} introuvable"
                )
        
        # Créer toutes les transactions
        for tx_data in transactions_data:
            produit = produits_dict[tx_data.id_produit]
            
            # Valider que le produit correspond au type de transaction
            if tx_data.id_client is not None and produit.usage != 'vendu':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Le produit '{produit.nom_produit}' ne peut pas être utilisé pour les transactions clients"
                )
            
            if tx_data.id_fournisseur is not None and produit.usage != 'achete':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Le produit '{produit.nom_produit}' ne peut pas être utilisé pour les transactions fournisseurs"
                )
            
            _validate_source_batiment(
                id_batiment=tx_data.id_batiment,
                id_client=tx_data.id_client,
                produit=produit,
                db=db,
            )
            id_cycle = _resolve_transaction_cycle(
                id_cycle=tx_data.id_cycle,
                id_batiment=tx_data.id_batiment,
                id_client=tx_data.id_client,
                date_transaction=(db.get(Production, tx_data.id_production).date_production if tx_data.id_production else tx_data.date_transaction),
                produit=produit,
                db=db,
            )

            # Calculer le montant_total si non fourni
            montant_total = tx_data.montant_total
            if montant_total is None:
                montant_total = Decimal(str(tx_data.quantite)) * tx_data.prix_unitaire
            
            # Créer la transaction
            new_transaction = Transaction(
                date_transaction=tx_data.date_transaction,
                id_produit=tx_data.id_produit,
                id_production=tx_data.id_production,
                allocation_automatique=tx_data.allocation_automatique,
                est_promesse=tx_data.est_promesse,
                date_livraison_prevue=tx_data.date_livraison_prevue,
                quantite=tx_data.quantite,
                prix_unitaire=tx_data.prix_unitaire,
                montant_total=montant_total,
                est_actif=tx_data.est_actif,
                id_client=tx_data.id_client,
                id_fournisseur=tx_data.id_fournisseur,
                id_batiment=tx_data.id_batiment,
                id_cycle=id_cycle,
                date_echeance=tx_data.date_echeance,
                id_utilisateur_creation=current_user.id_utilisateur if current_user else None
            )
            
            db.add(new_transaction)
            db.flush()  # Pour obtenir l'ID
            if new_transaction.est_actif:
                record_transaction_movement(db, new_transaction, current_user, is_new_transaction=True)
            
            # Création du mouvement de caisse supprimée ici. 
            # Les mouvements sont désormains créés lors de l'enregistrement des paiements.
            
            created_transactions.append(new_transaction)
        
        # Commit atomique : tout ou rien
        db.commit()
        
        # Refresh toutes les transactions
        for tx in created_transactions:
            db.refresh(tx)
        
        return created_transactions
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erreur lors de la création des transactions: {str(e)}"
        )


def _create_transaction_for_atomic_batch(
    tx_data: TransactionCreate,
    db: Session,
    current_user: Utilisateur,
) -> Transaction:
    """Create one transaction and its stock movement without committing."""
    resolve_sale_source(db, tx_data)
    if tx_data.id_client is not None and not db.query(Client).filter(
        Client.id_client == tx_data.id_client
    ).first():
        raise HTTPException(status_code=400, detail=f"Client avec l'ID {tx_data.id_client} introuvable")
    if tx_data.id_fournisseur is not None and not db.query(Fournisseur).filter(
        Fournisseur.id_fournisseur == tx_data.id_fournisseur
    ).first():
        raise HTTPException(
            status_code=400,
            detail=f"Fournisseur avec l'ID {tx_data.id_fournisseur} introuvable",
        )

    produit = db.query(Produit).filter(Produit.id_produit == tx_data.id_produit).first()
    if not produit:
        raise HTTPException(status_code=400, detail=f"Produit avec l'ID {tx_data.id_produit} introuvable")
    if tx_data.id_client is not None and produit.usage != 'vendu':
        raise HTTPException(
            status_code=400,
            detail=f"Le produit '{produit.nom_produit}' ne peut pas être utilisé pour les transactions clients",
        )
    if tx_data.id_fournisseur is not None and produit.usage != 'achete':
        raise HTTPException(
            status_code=400,
            detail=f"Le produit '{produit.nom_produit}' ne peut pas être utilisé pour les transactions fournisseurs",
        )

    _validate_source_batiment(
        id_batiment=tx_data.id_batiment,
        id_client=tx_data.id_client,
        produit=produit,
        db=db,
    )
    id_cycle = _resolve_transaction_cycle(
        id_cycle=tx_data.id_cycle,
        id_batiment=tx_data.id_batiment,
        id_client=tx_data.id_client,
        date_transaction=(db.get(Production, tx_data.id_production).date_production if tx_data.id_production else tx_data.date_transaction),
        produit=produit,
        db=db,
    )
    montant_total = tx_data.montant_total
    if montant_total is None:
        montant_total = Decimal(str(tx_data.quantite)) * tx_data.prix_unitaire

    transaction = Transaction(
        date_transaction=tx_data.date_transaction,
        id_produit=tx_data.id_produit,
        id_production=tx_data.id_production,
                allocation_automatique=tx_data.allocation_automatique,
        est_promesse=tx_data.est_promesse,
        date_livraison_prevue=tx_data.date_livraison_prevue,
        quantite=tx_data.quantite,
        prix_unitaire=tx_data.prix_unitaire,
        montant_total=montant_total,
        est_actif=tx_data.est_actif,
        id_client=tx_data.id_client,
        id_fournisseur=tx_data.id_fournisseur,
        id_batiment=tx_data.id_batiment,
        id_cycle=id_cycle,
        date_echeance=tx_data.date_echeance,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
    )
    db.add(transaction)
    db.flush()
    if transaction.est_actif:
        record_transaction_movement(db, transaction, current_user, is_new_transaction=True)
    return transaction


@router.post(
    "/batch-with-payments",
    response_model=List[TransactionPaymentBatchItemRead],
    status_code=status.HTTP_201_CREATED,
)
def create_transactions_with_payments_batch(
    batch_data: TransactionPaymentBatchCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    """Create transactions, payments, LC usage, and ledgers in one DB commit."""
    results = []
    try:
        for item in batch_data.items:
            transaction = _create_transaction_for_atomic_batch(
                item.transaction,
                db,
                current_user,
            )
            created_payments = []
            for payment_input in item.paiements:
                payment_data = PaiementCreate(
                    id_transaction=transaction.id_transaction,
                    **payment_input.model_dump(),
                )

                if payment_data.cle_idempotence:
                    existing = db.query(Paiement).filter(
                        Paiement.cle_idempotence == payment_data.cle_idempotence
                    ).first()
                    if existing:
                        validate_payment_idempotency(existing, payment_data)
                        created_payments.append(existing)
                        continue

                validate_payment_date(transaction, payment_data.date_paiement)
                funding = resolve_payment_funding(db, payment_data, transaction)
                validate_lc_payment(db, payment_data, transaction, current_user)

                payment_status = "valide"
                if payment_data.type_paiement == "cheque":
                    payment_status = (
                        "valide" if payment_data.statut_cheque == "encaisse"
                        else "rejete" if payment_data.statut_cheque in {"rejete", "annule"}
                        else "en_attente"
                    )
                payment = Paiement(
                    **payment_data.model_dump(exclude={"source_reglement", "id_compte"}),
                    **funding,
                    statut=payment_status,
                    id_utilisateur_creation=current_user.id_utilisateur if current_user else None,
                )
                db.add(payment)
                db.flush()
                sync_payment_cash_movement(
                    db,
                    payment,
                    transaction,
                    current_user=current_user,
                    reason="Création du paiement avec la transaction",
                )
                created_payments.append(payment)

            results.append((item.client_ref, transaction, created_payments))

        # One commit covers all transaction, payment, LC, and ledger changes.
        db.commit()
        response = []
        for client_ref, transaction, payments in results:
            db.refresh(transaction)
            for payment in payments:
                db.refresh(payment)
            response.append({
                "client_ref": client_ref,
                "transaction": transaction,
                "paiements": payments,
            })
        return response
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erreur lors de la création des transactions et paiements: {exc}",
        )


@router.get("", response_model=List[TransactionRead], status_code=status.HTTP_200_OK)
def get_transactions(
    skip: int = 0,
    limit: int = 100,
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    id_client: Optional[int] = None,
    id_fournisseur: Optional[int] = None,
    id_produit: Optional[int] = None,
    id_batiment: Optional[int] = None,
    id_cycle: Optional[int] = None,
    montant_min: Optional[Decimal] = None,
    montant_max: Optional[Decimal] = None,
    est_actif: Optional[bool] = None,
    est_promesse: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère la liste des transactions avec filtres optionnels.
    
    Permet de filtrer par date, client, fournisseur, produit, montant et statut actif.
    
    Args:
        skip: Nombre de transactions à sauter (pour la pagination)
        limit: Nombre maximum de transactions à retourner
        date_debut: Date de début pour filtrer les transactions (inclusive)
        date_fin: Date de fin pour filtrer les transactions (inclusive)
        id_client: ID du client pour filtrer les transactions
        id_fournisseur: ID du fournisseur pour filtrer les transactions
        id_produit: ID du produit pour filtrer les transactions
        montant_min: Montant minimum pour filtrer les transactions
        montant_max: Montant maximum pour filtrer les transactions
        est_actif: Filtre optionnel pour les transactions actives/inactives (None = tous)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Liste des transactions (TransactionRead)
    """
    # Response properties read these relations. Batch payments and join the
    # scalar sources to avoid a SELECT per transaction during serialization.
    query = db.query(Transaction).options(
        selectinload(Transaction.paiements).joinedload(Paiement.lettre_credit),
        joinedload(Transaction.production),
        joinedload(Transaction.batiment),
        selectinload(Transaction.allocations).joinedload(EggAllocation.production),
    )
    
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
    
    # Filtre par produit
    if id_produit is not None:
        query = query.filter(Transaction.id_produit == id_produit)
    
    if id_batiment is not None:
        query = query.filter(Transaction.id_batiment == id_batiment)
    if id_cycle is not None:
        query = query.filter((Transaction.id_cycle == id_cycle) | Transaction.allocations.any(
            EggAllocation.production.has(Production.id_cycle == id_cycle)))

    # Filtre par montant
    if montant_min is not None:
        query = query.filter(Transaction.montant_total >= montant_min)
    if montant_max is not None:
        query = query.filter(Transaction.montant_total <= montant_max)
    
    # Filtre par est_actif
    if est_actif is not None:
        query = query.filter(Transaction.est_actif == est_actif)
    
    if est_promesse is not None:
        query = query.filter(Transaction.est_promesse == est_promesse)

    # Pagination
    transactions = query.order_by(Transaction.date_transaction.desc()).offset(skip).limit(limit).all()
    
    reservations = deferred_sale_reservations(db) if any(tx.est_promesse for tx in transactions) else {}
    return [TransactionRead.model_validate(tx).model_copy(update={
        'quantite_reservee': reservations.get(tx.id_transaction, 0) if tx.est_actif else 0,
    }) for tx in transactions]


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


@router.get("/{id}/completion-history")
def get_completion_history(
    id: int, include_initial: bool = False, db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    from app.services.deferred_reporting import completion_events, initial_stock_event
    transaction = db.get(Transaction, id)
    if not transaction:
        raise HTTPException(404, "Transaction introuvable.")
    events = completion_events(db, [id]).get(id, [])
    if include_initial and transaction.est_promesse:
        events = [initial_stock_event(transaction, events), *events]
    user_ids = {e['id_utilisateur'] for e in events if e['id_utilisateur'] is not None}
    users = {u.id_utilisateur: u.nom_utilisateur for u in db.query(Utilisateur).filter(Utilisateur.id_utilisateur.in_(user_ids)).all()} if user_ids else {}
    return [{**e, 'operateur': users.get(e['id_utilisateur'])} for e in events]


@router.get("/{id}/completion", response_model=DeferredSalePreview)
def get_completion_proposal(
    id: int, db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    transaction = db.get(Transaction, id)
    if not transaction:
        raise HTTPException(404, "Transaction introuvable.")
    return completion_preview(db, transaction)


@router.post("/{id}/completion", response_model=TransactionRead)
def complete_transaction(
    id: int, payload: DeferredSaleCompletion, db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    try:
        transaction = complete_deferred_sale(db, id, payload, current_user)
        db.commit()
        db.refresh(transaction)
        reserved = deferred_sale_reservations(db).get(id, 0) if transaction.quantite_en_attente > 0 else 0
        return TransactionRead.model_validate(transaction).model_copy(update={'quantite_reservee': reserved})
    except Exception:
        db.rollback()
        raise


@router.patch("/{id}/delivery-date", response_model=TransactionRead)
def reschedule_deferred_sale(
    id: int, payload: DeferredSaleReschedule, db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).with_for_update().first()
    if not transaction:
        raise HTTPException(404, "Transaction introuvable.")
    if not transaction.est_promesse or not transaction.est_actif:
        raise HTTPException(409, "Seule une livraison différée active peut être replanifiée.")
    if payload.date_livraison_prevue < transaction.date_transaction:
        raise HTTPException(400, "La date prévue ne peut pas précéder la vente.")
    before = transaction.date_livraison_prevue
    if before == payload.date_livraison_prevue:
        return TransactionRead.model_validate(transaction)
    transaction.date_livraison_prevue = payload.date_livraison_prevue
    transaction.date_modification = datetime.now(timezone.utc)
    transaction.id_utilisateur_modification = current_user.id_utilisateur
    db.add(TransactionAudit(
        id_transaction=id, id_utilisateur=current_user.id_utilisateur,
        champ_modifie="replanification_livraison_differee",
        ancienne_valeur=json.dumps({"date": before.isoformat() if before else None}),
        nouvelle_valeur=json.dumps({"date": payload.date_livraison_prevue.isoformat()}),
    ))
    db.commit()
    db.refresh(transaction)
    return TransactionRead.model_validate(transaction)


@router.post("/{id}/cancel-remainder", response_model=TransactionRead)
def cancel_deferred_sale_remainder(
    id: int, db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    snapshot = db.get(Transaction, id)
    if not snapshot:
        raise HTTPException(404, "Transaction introuvable.")
    # Follow stock writers' lock order: building, product, then transaction.
    db.query(Batiment).filter(Batiment.id_batiment == snapshot.id_batiment).with_for_update().one()
    db.query(Produit).filter(Produit.id_produit == snapshot.id_produit).with_for_update().one()
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).populate_existing().with_for_update().one()
    if not transaction.est_promesse or not transaction.est_actif:
        raise HTTPException(409, "Seule une livraison différée active peut être clôturée.")
    pending = transaction.quantite_en_attente
    if pending <= 0:
        raise HTTPException(409, "Cette livraison n’a plus de quantité à fournir.")
    transaction.quantite_annulee = (transaction.quantite_annulee or 0) + pending
    completed = transaction.quantite_completee
    allocated = sum(allocation.quantite for allocation in transaction.allocations)
    allowed_allocation = completed + transaction.quantite_en_attente
    excess_allocation = max(0, allocated - allowed_allocation)
    released_sources = []
    for allocation in sorted(
        list(transaction.allocations),
        key=lambda item: (item.production.date_production, item.id_production),
        reverse=True,
    ):
        removable = max(0, allocation.quantite - (allocation.quantite_livree or 0))
        released = min(excess_allocation, removable)
        if released:
            allocation.quantite -= released
            excess_allocation -= released
            released_sources.append({
                "id_production": allocation.id_production,
                "date_production": allocation.production.date_production.isoformat(),
                "quantite": released,
                "id_cycle": allocation.production.id_cycle,
            })
            if allocation.quantite == 0:
                transaction.allocations.remove(allocation)
                db.delete(allocation)
    transaction.date_modification = datetime.now(timezone.utc)
    transaction.id_utilisateur_modification = current_user.id_utilisateur
    db.add(TransactionAudit(
        id_transaction=id, id_utilisateur=current_user.id_utilisateur,
        champ_modifie="annulation_reste_livraison_differee",
        ancienne_valeur="0",
        nouvelle_valeur=json.dumps({"date": business_date().isoformat(),
                                   "quantite_annulee": pending,
                                   "quantite_couverte": transaction.quantite_couverte,
                                   "quantite_totale": transaction.quantite,
                                   "repartition_stock_libere": released_sources}),
    ))
    assign_pending_promises(db, building_id=transaction.id_batiment, current_user=current_user)
    db.commit()
    db.refresh(transaction)
    return TransactionRead.model_validate(transaction).model_copy(update={"quantite_reservee": deferred_sale_reservations(db).get(id, 0)})


@router.get("/{id}", response_model=TransactionRead, status_code=status.HTTP_200_OK)
def get_transaction(
    id: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les détails d'une transaction par son ID.
    
    Args:
        id: ID de la transaction à récupérer
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Détails de la transaction (TransactionRead)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
    """
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id} introuvable"
        )
    
    reserved = deferred_sale_reservations(db).get(id, 0) if transaction.est_promesse and transaction.est_actif and transaction.quantite_en_attente > 0 else 0
    return TransactionRead.model_validate(transaction).model_copy(update={'quantite_reservee': reserved})


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction_data: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Crée une nouvelle transaction.
    
    Le montant_total est calculé automatiquement si non fourni (quantite × prix_unitaire).
    Enregistre automatiquement l'ID de l'utilisateur qui a créé la transaction.
    Crée automatiquement un mouvement de caisse associé.
    
    Args:
        transaction_data: Données de la nouvelle transaction (TransactionCreate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Transaction créée (TransactionRead)
        
    Raises:
        HTTPException 400: Si le client, le fournisseur ou le produit n'existe pas
    """
    try:
        transaction = _create_transaction_for_atomic_batch(transaction_data, db, current_user)
        db.commit()
        db.refresh(transaction)
        return transaction
    except Exception:
        db.rollback()
        raise


@router.put("/{id}", response_model=TransactionRead, status_code=status.HTTP_200_OK)
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
    Recalcule le montant_total si quantite ou prix_unitaire changent.
    
    Args:
        id: ID de la transaction à modifier
        transaction_data: Données à mettre à jour (TransactionUpdate)
        db: Session de base de données
        current_user: Utilisateur actuel authentifié (via dépendance)
        
    Returns:
        Transaction mise à jour (TransactionRead)
        
    Raises:
        HTTPException 404: Si la transaction n'existe pas
        HTTPException 400: Si le client, le fournisseur ou le produit n'existe pas
    """
    transaction = db.query(Transaction).filter(Transaction.id_transaction == id).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction avec l'ID {id} introuvable"
        )
    
    update_data = transaction_data.model_dump(exclude_unset=True)
    original_building_id = transaction.id_batiment

    promise_identity_fields = {
        "date_transaction", "id_production", "id_batiment", "id_cycle",
        "id_produit", "id_client", "id_fournisseur",
    }
    if transaction.est_promesse and any(
        field in update_data and update_data[field] != getattr(transaction, field)
        for field in promise_identity_fields
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "L'origine et l'identité d'une livraison différée sont fixes pour préserver ses réservations. "
                "Annulez-la puis créez une nouvelle livraison corrigée."
            ),
        )
    if (transaction.est_promesse and "date_livraison_prevue" in update_data
            and update_data["date_livraison_prevue"] != transaction.date_livraison_prevue):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Modifiez la date prévue depuis l’action Replanifier pour conserver son historique.",
        )
    if (
        "est_promesse" in update_data and update_data["est_promesse"] != transaction.est_promesse
        or "allocation_automatique" in update_data
        and update_data["allocation_automatique"] != transaction.allocation_automatique
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le mode de réservation d'une transaction existante ne peut pas être modifié.",
        )
    if (
        transaction.est_promesse and "quantite" in update_data
        and update_data["quantite"] < transaction.quantite_couverte + (transaction.quantite_annulee or 0)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La quantité ne peut pas être inférieure au stock déjà réservé.",
        )

    if "est_actif" in update_data and update_data["est_actif"] != transaction.est_actif:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le statut actif se modifie via les opérations d'annulation ou de réactivation dédiées",
        )

    financial_identity_fields = {
        "date_transaction",
        "id_production",
        "id_batiment",
        "id_cycle",
        "id_produit",
        "quantite",
        "prix_unitaire",
        "montant_total",
        "id_client",
        "id_fournisseur",
    }
    if transaction.paiements and financial_identity_fields.intersection(update_data):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Une transaction ayant un historique de paiement est immuable sur ses attributs financiers. "
                "Annulez-la puis créez une nouvelle transaction corrigée."
            ),
        )

    # The database constraint is the final safety net, but returning a clear
    # client error here avoids leaving an invalid in-memory transaction when a
    # caller tries to clear the only party on a transaction.
    final_id_client = update_data.get("id_client", transaction.id_client)
    final_id_fournisseur = update_data.get("id_fournisseur", transaction.id_fournisseur)
    if (final_id_client is None) == (final_id_fournisseur is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une transaction doit concerner soit un client, soit un fournisseur",
        )

    final_date_transaction = update_data.get("date_transaction", transaction.date_transaction)
    final_date_echeance = update_data.get("date_echeance", transaction.date_echeance)
    if final_date_echeance is not None and final_date_echeance < final_date_transaction:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date d'échéance ne peut pas être antérieure à la transaction",
        )
    if any(payment.date_paiement < final_date_transaction for payment in transaction.paiements):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La date de transaction ne peut pas être postérieure à un paiement existant",
        )

    if (transaction.id_production is not None or update_data.get("id_production") is not None) and not transaction.est_promesse:
        if "id_production" in update_data and update_data["id_production"] is None:
            raise HTTPException(400, "Une vente liée à une saisie doit conserver son origine.")
        final = TransactionCreate(**{
            field: update_data.get(field, getattr(transaction, field))
            for field in TransactionCreate.model_fields
        })
        if final.id_production != transaction.id_production:
            for field in ("id_produit", "id_cycle", "id_batiment"):
                setattr(final, field, update_data.get(field))
        resolve_sale_source(db, final)
        for field in ("id_production", "id_produit", "id_batiment", "id_cycle"):
            update_data[field] = getattr(final, field)

    inventory_changed = any(field in update_data for field in {
        "id_production", "id_batiment", "id_cycle", "date_transaction", "id_produit", "quantite", "prix_unitaire", "id_client", "id_fournisseur", "est_actif"
    })
    if inventory_changed:
        reverse_source_movements(
            db,
            source_type="transaction",
            source_id=transaction.id_transaction,
            current_user=current_user,
            reason=f"Correction de la transaction #{transaction.id_transaction}",
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
    
    # Vérifier que le produit existe si fourni dans la mise à jour
    if transaction_data.id_produit is not None:
        produit = db.query(Produit).filter(Produit.id_produit == transaction_data.id_produit).first()
        if not produit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Produit avec l'ID {transaction_data.id_produit} introuvable"
            )
        
    # Use the final product and final party together for compatibility checks.
    # This also covers changing only the client or supplier on an existing
    # transaction.
    # Mettre à jour les champs fournis
    final_produit = (
        db.query(Produit).filter(Produit.id_produit == update_data.get("id_produit", transaction.id_produit)).first()
    )
    final_id_batiment = update_data.get("id_batiment", transaction.id_batiment)
    final_id_cycle = update_data.get("id_cycle", transaction.id_cycle)
    if final_id_client is not None and final_produit.usage != 'vendu':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le produit '{final_produit.nom_produit}' ne peut pas être utilisé pour les transactions clients",
        )
    if final_id_fournisseur is not None and final_produit.usage != 'achete':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le produit '{final_produit.nom_produit}' ne peut pas être utilisé pour les transactions fournisseurs",
        )
    _validate_source_batiment(
        id_batiment=final_id_batiment,
        id_client=final_id_client,
        produit=final_produit,
        db=db,
    )
    resolved_cycle_id = _resolve_transaction_cycle(
        id_cycle=final_id_cycle,
        id_batiment=final_id_batiment,
        id_client=final_id_client,
        date_transaction=(db.get(Production, update_data.get("id_production", transaction.id_production)).date_production if update_data.get("id_production", transaction.id_production) else final_date_transaction),
        produit=final_produit,
        db=db,
    )
    
    stock_fields = ('quantite', 'id_produit', 'id_batiment', 'id_production',
                    'date_transaction', 'id_client', 'id_fournisseur', 'est_promesse',
                    'allocation_automatique')
    reservation_rebalance_fields = {
        'quantite', 'id_produit', 'id_batiment', 'id_production', 'id_cycle',
        'date_transaction', 'id_client', 'id_fournisseur', 'est_promesse',
        'allocation_automatique',
    }
    preserve_egg_allocations = bool(transaction.est_promesse) and not any(
        field in update_data and update_data[field] != getattr(transaction, field)
        for field in stock_fields)
    for field, value in update_data.items():
        setattr(transaction, field, value)
    if "id_client" in update_data and update_data["id_client"] is not None and "id_fournisseur" not in update_data:
        transaction.id_fournisseur = None
    if "id_fournisseur" in update_data and update_data["id_fournisseur"] is not None and "id_client" not in update_data:
        transaction.id_client = None
    transaction.id_cycle = resolved_cycle_id
    transaction.produit = final_produit
    
    # Recalculer le montant_total si quantite ou prix_unitaire ont changé
    if transaction_data.quantite is not None or transaction_data.prix_unitaire is not None:
        transaction.montant_total = Decimal(str(transaction.quantite)) * transaction.prix_unitaire
    
    # Enregistrer l'utilisateur qui a modifié (si authentification activée)
    if current_user:
        transaction.id_utilisateur_modification = current_user.id_utilisateur

    if inventory_changed and transaction.est_actif:
        record_transaction_movement(db, transaction, current_user,
                                    preserve_egg_allocations=preserve_egg_allocations)
    if reservation_rebalance_fields.intersection(update_data) and transaction.id_client is not None:
        assign_pending_promises(
            db,
            building_ids={original_building_id, transaction.id_batiment},
            current_user=current_user,
        )
    
    db.commit()
    db.refresh(transaction)
    
    return transaction


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    id: int,
    raison: str = Query(
        "Annulation demandée par l'utilisateur",
        min_length=3,
        max_length=1000,
    ),
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
    
    reason = raison.strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La raison de l'annulation est obligatoire",
        )

    # Void every payment first. This preserves the payment rows and removes
    # their active ledger impact before the transaction leaves the active set.
    payment_ids = []
    for payment in list(transaction.paiements):
        if payment.statut != "annule":
            void_payment(
                db,
                payment,
                current_user=current_user,
                reason=reason,
            )
            payment_ids.append(payment.id_paiement)

    # Soft delete : mettre est_actif à False
    transaction.est_actif = False
    reverse_source_movements(
        db,
        source_type="transaction",
        source_id=transaction.id_transaction,
        current_user=current_user,
        reason=reason,
    )
    transaction.motif_annulation = reason
    transaction.date_annulation = datetime.now(timezone.utc)
    transaction.id_utilisateur_annulation = current_user.id_utilisateur if current_user else None
    # Enregistrer l'utilisateur qui a modifié (si authentification activée)
    if current_user:
        transaction.id_utilisateur_modification = current_user.id_utilisateur
        if transaction.est_promesse:
            db.add(TransactionAudit(
                id_transaction=id, id_utilisateur=current_user.id_utilisateur,
                champ_modifie="annulation_transaction_differee", ancienne_valeur="active",
                nouvelle_valeur=json.dumps({"date": business_date().isoformat(), "raison": reason,
                                           "paiements_annules": payment_ids}),
            ))

    record_correction(
        db,
        type_entite="transaction",
        id_entite=transaction.id_transaction,
        action="annulation",
        raison=reason,
        current_user=current_user,
        details={"paiements_annules": payment_ids},
    )

    # Reassign released production to the oldest active promise.
    assign_pending_promises(db, building_id=transaction.id_batiment, current_user=current_user)
    
    db.commit()
    
    return None


@router.patch("/{id}/reactivate", response_model=TransactionRead, status_code=status.HTTP_200_OK)
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
        Transaction réactivée (TransactionRead)
        
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
    if transaction.est_promesse:
        db.query(Batiment).filter(
            Batiment.id_batiment == transaction.id_batiment,
        ).with_for_update().one()
        db.query(Produit).filter(
            Produit.id_produit == transaction.id_produit,
        ).with_for_update().one()
        _, balances = source_balances(
            db, through_date=business_date(), reserve_open_promises=False,
        )
        if any(
            balances.get(allocation.id_production, 0) < allocation.quantite
            for allocation in transaction.allocations
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Le stock de cette livraison différée a été réservé à d'autres ventes. "
                    "Créez une nouvelle livraison pour reprendre la place dans la file FIFO."
                ),
            )
    transaction.est_actif = True
    record_transaction_movement(
        db, transaction, current_user,
        preserve_egg_allocations=bool(transaction.est_promesse),
    )
    if transaction.id_client is not None:
        assign_pending_promises(db, building_id=transaction.id_batiment, current_user=current_user)
    # Enregistrer l'utilisateur qui a réactivé (si authentification activée)
    if current_user:
        transaction.id_utilisateur_modification = current_user.id_utilisateur
        if transaction.est_promesse:
            db.add(TransactionAudit(
                id_transaction=id, id_utilisateur=current_user.id_utilisateur,
                champ_modifie="reactivation_transaction_differee", ancienne_valeur="inactive",
                nouvelle_valeur=json.dumps({"date": business_date().isoformat()}),
            ))

    record_correction(
        db,
        type_entite="transaction",
        id_entite=transaction.id_transaction,
        action="reactivation",
        raison="Réactivation de la transaction",
        current_user=current_user,
    )
    
    db.commit()
    db.refresh(transaction)
    
    return transaction
