"""Permission-scoped unified search."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, Text, cast, func, or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.charge import Charge
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.lettre_credit import LettreDeCredit
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.schemas.search import SearchResponse, SearchResult
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/search", tags=["Search"])

SUPPORTED_SCOPES = frozenset(
    {"clients", "fournisseurs", "produits", "transactions", "charges", "lettres_credit"}
)


def _contains(column, term: str, db: Session):
    """Match text accent-insensitively on PostgreSQL and portably in tests."""
    if db.bind and db.bind.dialect.name == "postgresql":
        normalized_column = func.lower(
            func.public.immutable_unaccent(cast(column, Text))
        )
        normalized_term = func.lower(
            func.public.immutable_unaccent(cast(term, Text))
        )
        return normalized_column.ilike(normalized_term)
    return column.ilike(term)


def _requested_scopes(scope: Optional[str]) -> set[str]:
    if not scope:
        return set(SUPPORTED_SCOPES)
    requested = {item.strip().lower() for item in scope.split(",") if item.strip()}
    unknown = requested - SUPPORTED_SCOPES
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Scopes de recherche inconnus : {', '.join(sorted(unknown))}",
        )
    return requested


@router.get("", response_model=SearchResponse)
def unified_search(
    q: str = Query(..., min_length=2, max_length=120),
    scope: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    normalized_query = q.strip()
    if len(normalized_query) < 2:
        raise HTTPException(
            status_code=422,
            detail="q doit contenir au moins deux caractères utiles",
        )

    term = f"%{normalized_query}%"
    scopes = _requested_scopes(scope)
    results: list[SearchResult] = []

    if "clients" in scopes:
        rows = (
            db.query(Client)
            .filter(
                Client.est_actif.is_(True),
                _contains(Client.nom_client, term, db),
            )
            .order_by(Client.nom_client.asc(), Client.id_client.asc())
            .limit(10)
            .all()
        )
        results.extend(
            SearchResult(
                kind="client",
                id=row.id_client,
                label=row.nom_client,
                href=f"/clients/{row.id_client}/profile",
            )
            for row in rows
        )

    if "fournisseurs" in scopes:
        rows = (
            db.query(Fournisseur)
            .filter(
                Fournisseur.est_actif.is_(True),
                _contains(Fournisseur.nom_fournisseur, term, db),
            )
            .order_by(Fournisseur.nom_fournisseur.asc(), Fournisseur.id_fournisseur.asc())
            .limit(10)
            .all()
        )
        results.extend(
            SearchResult(
                kind="fournisseur",
                id=row.id_fournisseur,
                label=row.nom_fournisseur,
                href=f"/fournisseurs/{row.id_fournisseur}/profile",
            )
            for row in rows
        )

    if "produits" in scopes:
        rows = (
            db.query(Produit)
            .filter(
                Produit.est_actif.is_(True),
                _contains(Produit.nom_produit, term, db),
            )
            .order_by(Produit.nom_produit.asc(), Produit.id_produit.asc())
            .limit(10)
            .all()
        )
        results.extend(
            SearchResult(
                kind="produit",
                id=row.id_produit,
                label=row.nom_produit,
                subtitle=row.type_produit,
                href=f"/produits/{row.id_produit}",
            )
            for row in rows
        )

    if "transactions" in scopes:
        rows = (
            db.query(Transaction)
            .join(Transaction.produit)
            .outerjoin(Transaction.client)
            .outerjoin(Transaction.fournisseur)
            .options(selectinload(Transaction.produit))
            .filter(
                Transaction.est_actif.is_(True),
                or_(
                    _contains(Produit.nom_produit, term, db),
                    _contains(Client.nom_client, term, db),
                    _contains(Fournisseur.nom_fournisseur, term, db),
                    cast(Transaction.id_transaction, String).ilike(term),
                ),
            )
            .order_by(Transaction.id_transaction.desc())
            .limit(15)
            .all()
        )
        results.extend(
            SearchResult(
                kind="transaction",
                id=row.id_transaction,
                label=f"Transaction #{row.id_transaction}",
                subtitle=row.produit.nom_produit if row.produit else None,
                href=f"/transactions/{row.id_transaction}",
            )
            for row in rows
        )

    if "charges" in scopes:
        rows = (
            db.query(Charge)
            .filter(
                Charge.statut == "active",
                _contains(Charge.libelle, term, db),
            )
            .order_by(Charge.libelle.asc(), Charge.id_charge.asc())
            .limit(10)
            .all()
        )
        results.extend(
            SearchResult(
                kind="charge",
                id=row.id_charge,
                label=row.libelle,
                subtitle=row.categorie,
                href="/charges",
            )
            for row in rows
        )

    if "lettres_credit" in scopes:
        rows = (
            db.query(LettreDeCredit)
            .filter(_contains(LettreDeCredit.numero_reference, term, db))
            .order_by(
                LettreDeCredit.numero_reference.asc(),
                LettreDeCredit.id_lc.asc(),
            )
            .limit(10)
            .all()
        )
        results.extend(
            SearchResult(
                kind="lettre_credit",
                id=row.id_lc,
                label=row.numero_reference,
                subtitle=row.banque_emettrice,
                href=f"/lettres-credit/{row.id_lc}",
            )
            for row in rows
        )

    return SearchResponse(query=q, results=results)
