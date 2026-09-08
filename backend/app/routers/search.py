"""Permission-scoped unified search."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

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


def _contains(column, term: str, db: Session):
    """Use accent-insensitive matching on PostgreSQL, portable matching in tests."""
    if db.bind and db.bind.dialect.name == "postgresql":
        return func.unaccent(column).ilike(func.unaccent(term))
    return column.ilike(term)


@router.get("", response_model=SearchResponse)
def unified_search(
    q: str = Query(..., min_length=2, max_length=120),
    scope: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user),
):
    term = f"%{q.strip()}%"
    scopes = {item.strip().lower() for item in scope.split(",")} if scope else {"clients", "fournisseurs", "produits", "transactions", "charges", "lettres_credit"}
    results = []
    if "clients" in scopes:
        results.extend(SearchResult(kind="client", id=row.id_client, label=row.nom_client, href=f"/clients/{row.id_client}/profile") for row in db.query(Client).filter(Client.est_actif.is_(True), _contains(Client.nom_client, term, db)).limit(10))
    if "fournisseurs" in scopes:
        results.extend(SearchResult(kind="fournisseur", id=row.id_fournisseur, label=row.nom_fournisseur, href=f"/fournisseurs/{row.id_fournisseur}/profile") for row in db.query(Fournisseur).filter(Fournisseur.est_actif.is_(True), _contains(Fournisseur.nom_fournisseur, term, db)).limit(10))
    if "produits" in scopes:
        results.extend(SearchResult(kind="produit", id=row.id_produit, label=row.nom_produit, subtitle=row.type_produit, href=f"/produits/{row.id_produit}") for row in db.query(Produit).filter(Produit.est_actif.is_(True), _contains(Produit.nom_produit, term, db)).limit(10))
    if "transactions" in scopes:
        rows = db.query(Transaction).join(Transaction.produit).outerjoin(Transaction.client).outerjoin(Transaction.fournisseur).filter(Transaction.est_actif.is_(True), or_(_contains(Produit.nom_produit, term, db), _contains(Client.nom_client, term, db), _contains(Fournisseur.nom_fournisseur, term, db))).limit(15).all()
        results.extend(SearchResult(kind="transaction", id=row.id_transaction, label=f"Transaction #{row.id_transaction}", subtitle=row.produit.nom_produit if row.produit else None, href=f"/transactions/{row.id_transaction}") for row in rows)
    if "charges" in scopes:
        results.extend(SearchResult(kind="charge", id=row.id_charge, label=row.libelle, subtitle=row.categorie, href="/charges") for row in db.query(Charge).filter(Charge.statut == "active", _contains(Charge.libelle, term, db)).limit(10))
    if "lettres_credit" in scopes:
        results.extend(SearchResult(kind="lettre_credit", id=row.id_lc, label=row.numero_reference, subtitle=row.banque_emettrice, href=f"/lettres-credit/{row.id_lc}") for row in db.query(LettreDeCredit).filter(_contains(LettreDeCredit.numero_reference, term, db)).limit(10))
    return SearchResponse(query=q, results=results)
