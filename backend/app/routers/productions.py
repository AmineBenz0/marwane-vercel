from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from app.database import get_db
from app.models.production import Production
from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.transaction import Transaction
from app.models.produit import Produit
from app.schemas.production import (
    ProductionRead,
    ProductionCreate,
    ProductionUpdate,
    ProductionDailyStats,
    ProductionStockDaily,
    ProductionPerformanceResponse,
    FormuleAliment,
    CalibreThreshold,
)
from app.utils.dependencies import get_current_active_user
from app.utils.egg_product_sync import ensure_sellable_egg_product, parse_sellable_egg_product_name
from app.utils.production_cycles import (
    ACTIVE_CYCLE_STATUSES,
    cycle_to_dict,
    find_active_cycle,
    require_active_cycle_for_date,
    refresh_cycle_status,
)
from app.models.user import Utilisateur

router = APIRouter(prefix="/productions", tags=["Productions"])

FORMULES_ALIMENT = [
    {"value": "demarrage", "label": "Démarrage", "description": "Formule pour les lots en démarrage"},
    {"value": "ponte", "label": "Ponte", "description": "Formule standard pour pondeuses"},
    {"value": "finition", "label": "Finition", "description": "Formule de fin de cycle"},
    {"value": "speciale", "label": "Spéciale", "description": "Formule spéciale ou corrigée"},
]

# Placeholder business thresholds. Tweak these ranges once the client confirms
# the exact gram weights.
CALIBRE_THRESHOLDS = [
    {"value": "demarrage", "label": "Démarrage", "min_grammage": None, "max_grammage": 50},
    {"value": "moyen", "label": "Moyen", "min_grammage": 50, "max_grammage": 60},
    {"value": "gros", "label": "Gros", "min_grammage": 60, "max_grammage": None},
]


def _category_key(type_oeuf: str, calibre: Optional[str] = None) -> tuple[str, Optional[str]]:
    type_key = (type_oeuf or "").strip().lower()
    calibre_key = (calibre or "").strip().lower() or None
    if type_key != "normal":
        calibre_key = None
    return type_key, calibre_key


def _category_label(type_oeuf: str, calibre: Optional[str] = None) -> str:
    labels = {
        "normal": "Normal",
        "double_jaune": "Double jaune",
        "double_jaune_demarrage": "Double jaune demarrage",
        "casse": "Casse",
        "blanc": "Blanc",
        "perdu": "Perdu",
    }
    type_label = labels.get(type_oeuf, (type_oeuf or "").replace("_", " ").title())
    if type_oeuf == "normal" and calibre:
        return f"{type_label} - {calibre.title()}"
    return type_label


def _stock_status(produced: int, available: int, entries_count: int) -> str:
    if entries_count == 0:
        return "missing"
    if available <= 0:
        return "empty"
    if available <= 300 or (produced > 0 and available / produced <= 0.2):
        return "low"
    return "ok"


def _deduce_calibre(type_oeuf: str, grammage) -> Optional[str]:
    if type_oeuf != "normal" or grammage is None:
        return None

    gram_value = float(grammage)
    for threshold in CALIBRE_THRESHOLDS:
        min_value = threshold["min_grammage"]
        max_value = threshold["max_grammage"]
        if (min_value is None or gram_value >= min_value) and (max_value is None or gram_value < max_value):
            return threshold["value"]
    return "moyen"


def _safe_decimal(value, decimals: str = "0.01") -> Optional[Decimal]:
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal(decimals), rounding=ROUND_HALF_UP)


def _ratio_percent(numerator: int | float | Decimal, denominator: Optional[int]) -> Optional[Decimal]:
    if not denominator or denominator <= 0:
        return None
    return _safe_decimal((Decimal(str(numerator)) / Decimal(str(denominator))) * Decimal("100"))


@router.get("", response_model=List[ProductionRead])
def get_productions(
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    id_batiment: Optional[int] = None,
    id_cycle: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Liste les productions avec filtres optionnels.
    """
    query = db.query(
        Production,
        Batiment.nom.label("nom_batiment"),
        CycleProduction.nom_cycle.label("nom_cycle"),
    ).select_from(Production).join(
        Batiment,
        Production.id_batiment == Batiment.id_batiment,
    ).outerjoin(
        CycleProduction,
        Production.id_cycle == CycleProduction.id_cycle,
    ).filter(Production.est_actif.is_(True))
    
    if date_debut:
        query = query.filter(Production.date_production >= date_debut)
    if date_fin:
        query = query.filter(Production.date_production <= date_fin)
    if id_batiment:
        query = query.filter(Production.id_batiment == id_batiment)
    if id_cycle:
        query = query.filter(Production.id_cycle == id_cycle)
        
    results = query.order_by(Production.date_production.desc()).offset(skip).limit(limit).all()
    
    final_results = []
    for prod, nom_batiment, nom_cycle in results:
        # On crée une copie pour ne pas modifier l'objet SQLAlchemy original dans la session
        p_data = {c.name: getattr(prod, c.name) for c in prod.__table__.columns}
        p_data["nom_batiment"] = nom_batiment
        p_data["nom_cycle"] = nom_cycle
        final_results.append(p_data)
        
    return final_results


@router.get("/formules", response_model=List[FormuleAliment])
def get_formules_aliment(
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Liste simple des formules d'aliment utilisables dans la saisie quotidienne."""
    return FORMULES_ALIMENT


@router.get("/calibre-thresholds", response_model=List[CalibreThreshold])
def get_calibre_thresholds(
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Seuils de deduction automatique du calibre depuis le grammage moyen."""
    return CALIBRE_THRESHOLDS


@router.post("", response_model=ProductionRead, status_code=status.HTTP_201_CREATED)
def create_production(
    prod_in: ProductionCreate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Enregistre une nouvelle production et calcule automatiquement les cartons.
    """
    # Vérifier l'existence du bâtiment
    batiment = db.query(Batiment).filter(Batiment.id_batiment == prod_in.id_batiment).first()
    if not batiment:
        raise HTTPException(status_code=404, detail="Batiment introuvable")

    if prod_in.id_cycle:
        cycle = db.query(CycleProduction).filter(CycleProduction.id_cycle == prod_in.id_cycle).first()
        if not cycle or cycle.id_batiment != prod_in.id_batiment:
            raise HTTPException(status_code=400, detail="Lot introuvable pour ce batiment")
        refresh_cycle_status(db, cycle)
        if cycle.statut not in ACTIVE_CYCLE_STATUSES:
            raise HTTPException(status_code=400, detail="Ce lot est termine")
        if prod_in.date_production < cycle.date_debut or prod_in.date_production > cycle.date_fin_prevue:
            raise HTTPException(status_code=400, detail="La date de production est en dehors du lot")
    else:
        cycle = require_active_cycle_for_date(
            db,
            prod_in.id_batiment,
            prod_in.date_production,
            action_label="de saisir la production",
        )

    # Calculer le nombre de cartons selon les règles métier
    nb_cartons = Production.calculer_cartons(prod_in.nombre_oeufs, prod_in.type_oeuf)
    calibre = _deduce_calibre(prod_in.type_oeuf, prod_in.grammage)

    # Make the production category available in client transactions.
    ensure_sellable_egg_product(db, prod_in.type_oeuf, calibre)
    
    db_prod = Production(
        **{**prod_in.model_dump(), "id_cycle": cycle.id_cycle, "calibre": calibre},
        nombre_cartons=nb_cartons,
        id_utilisateur_creation=current_user.id_utilisateur if current_user else None
    )
    
    db.add(db_prod)
    db.commit()
    db.refresh(db_prod)
    
    # Ajouter le nom du bâtiment pour la réponse
    res = {c.name: getattr(db_prod, c.name) for c in db_prod.__table__.columns}
    res["nom_batiment"] = batiment.nom
    res["nom_cycle"] = cycle.nom_cycle
    return res


@router.get("/stats/daily", response_model=List[ProductionDailyStats])
def get_daily_stats(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère les statistiques de production agrégées par jour.
    Utilise des agrégations SQL pour l'efficacité.
    """
    from datetime import date, timedelta
    date_debut = date.today() - timedelta(days=days)

    # 1. Agrégation par jour + type
    par_type_rows = db.query(
        Production.date_production,
        Production.type_oeuf,
        func.sum(Production.nombre_oeufs).label("total")
    ).filter(
        Production.est_actif.is_(True),
        Production.date_production >= date_debut
    ).group_by(
        Production.date_production, Production.type_oeuf
    ).all()

    # 2. Agrégation par jour + bâtiment
    par_batiment_rows = db.query(
        Production.date_production,
        Batiment.nom.label("nom_batiment"),
        func.sum(Production.nombre_oeufs).label("total")
    ).join(Batiment).filter(
        Production.est_actif.is_(True),
        Production.date_production >= date_debut
    ).group_by(
        Production.date_production, Batiment.nom
    ).all()

    # 3. Totaux par jour
    totaux = db.query(
        Production.date_production,
        func.sum(Production.nombre_oeufs).label("total_oeufs"),
        func.sum(Production.nombre_cartons).label("total_cartons")
    ).filter(
        Production.est_actif.is_(True),
        Production.date_production >= date_debut
    ).group_by(
        Production.date_production
    ).order_by(
        Production.date_production.desc()
    ).limit(days).all()

    # Regrouper en dicts indexés par date
    type_map = {}
    for row in par_type_rows:
        if row.date_production not in type_map:
            type_map[row.date_production] = []
        type_map[row.date_production].append(
            {"type": row.type_oeuf, "count": int(row.total or 0)}
        )

    batiment_map = {}
    for row in par_batiment_rows:
        if row.date_production not in batiment_map:
            batiment_map[row.date_production] = []
        batiment_map[row.date_production].append(
            {"batiment": row.nom_batiment, "count": int(row.total or 0)}
        )

    return [
        ProductionDailyStats(
            date=s.date_production,
            total_oeufs=int(s.total_oeufs or 0),
            total_cartons=int(s.total_cartons or 0),
            par_type=type_map.get(s.date_production, []),
            par_batiment=batiment_map.get(s.date_production, [])
        ) for s in totaux
    ]


@router.get("/stock/daily", response_model=ProductionStockDaily)
def get_daily_stock(
    date_stock: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Returns the daily building stock board.

    Stock is shown in eggs:
    produced today - sold from the building - lost eggs = available stock.
    Sales without a source building are surfaced separately so operators can
    fix them instead of silently hiding inaccurate stock.
    """
    target_date = date_stock or date.today()
    batiments = db.query(Batiment).filter(Batiment.est_actif.is_(True)).order_by(Batiment.nom).all()
    # Load active cycles for all buildings in one query. The previous
    # implementation performed one lookup per building on every dashboard load.
    building_ids = [batiment.id_batiment for batiment in batiments]
    cycles = (
        db.query(CycleProduction)
        .filter(
            CycleProduction.id_batiment.in_(building_ids),
            CycleProduction.statut.in_(ACTIVE_CYCLE_STATUSES),
            CycleProduction.date_debut <= target_date,
        )
        .order_by(
            CycleProduction.id_batiment.asc(),
            CycleProduction.date_debut.desc(),
        )
        .all()
    )
    cycles_by_batiment = {}
    for cycle in cycles:
        if cycle.id_batiment not in cycles_by_batiment:
            refresh_cycle_status(db, cycle)
            cycles_by_batiment[cycle.id_batiment] = cycle

    productions = db.query(Production).filter(
        Production.date_production == target_date,
        Production.est_actif.is_(True),
    ).all()

    stock_by_batiment = {
        batiment.id_batiment: {
            "id_batiment": batiment.id_batiment,
            "nom_batiment": batiment.nom,
            "cycle": cycle_to_dict(db, cycles_by_batiment[batiment.id_batiment], target_date)
            if cycles_by_batiment[batiment.id_batiment]
            else None,
            "produced_eggs": 0,
            "sold_eggs": 0,
            "lost_eggs": 0,
            "mortalite": 0,
            "consommation_aliment_kg": 0,
            "formules": set(),
            "entries_count": 0,
            "categories": {},
        }
        for batiment in batiments
    }

    movements = []

    for prod in productions:
        building = stock_by_batiment.get(prod.id_batiment)
        if not building:
            continue
        active_cycle = cycles_by_batiment.get(prod.id_batiment)
        if not active_cycle or prod.id_cycle != active_cycle.id_cycle:
            continue

        quantity = int(prod.nombre_oeufs or 0)
        building["mortalite"] += int(prod.mortalite or 0)
        building["consommation_aliment_kg"] += float(prod.consommation_aliment_kg or 0)
        if prod.formule:
            building["formules"].add(prod.formule)
        type_key, calibre_key = _category_key(prod.type_oeuf, prod.calibre)
        category_key = (type_key, calibre_key)
        category = building["categories"].setdefault(
            category_key,
            {
                "type_oeuf": type_key,
                "calibre": calibre_key,
                "label": _category_label(type_key, calibre_key),
                "produced_eggs": 0,
                "lost_eggs": 0,
                "sold_eggs": 0,
            },
        )

        movement_type = "production"
        movement_label = "Production ajoutee"
        movement_quantity = quantity
        if type_key == "perdu":
            building["lost_eggs"] += quantity
            category["lost_eggs"] += quantity
            movement_type = "loss"
            movement_label = "Oeufs perdus"
            movement_quantity = -quantity
        else:
            building["produced_eggs"] += quantity
            category["produced_eggs"] += quantity

        building["entries_count"] += 1

        movements.append({
            "time": prod.date_creation.strftime("%H:%M") if prod.date_creation else None,
            "type": movement_type,
            "label": movement_label,
            "detail": _category_label(type_key, calibre_key),
            "quantity": movement_quantity,
            "id_batiment": prod.id_batiment,
            "nom_batiment": building["nom_batiment"],
        })

    sales_rows = db.query(
        Transaction,
        Produit.nom_produit,
        Batiment.nom.label("nom_batiment"),
    ).join(
        Produit,
        Transaction.id_produit == Produit.id_produit,
    ).outerjoin(
        Batiment,
        Transaction.id_batiment == Batiment.id_batiment,
    ).filter(
        Transaction.date_transaction == target_date,
        Transaction.est_actif.is_(True),
        Transaction.id_client.isnot(None),
    ).all()

    unassigned_sold_eggs = 0
    for transaction, product_name, nom_batiment in sales_rows:
        category_from_product = parse_sellable_egg_product_name(product_name)
        if not category_from_product:
            continue

        quantity = int(transaction.quantite or 0)
        if transaction.id_batiment is None:
            unassigned_sold_eggs += quantity
            movements.append({
                "time": transaction.date_creation.strftime("%H:%M") if transaction.date_creation else None,
                "type": "sale_unassigned",
                "label": "Vente non attribuee",
                "detail": product_name,
                "quantity": -quantity,
                "id_batiment": None,
                "nom_batiment": None,
            })
            continue

        building = stock_by_batiment.get(transaction.id_batiment)
        if not building:
            continue
        active_cycle = cycles_by_batiment.get(transaction.id_batiment)
        if not active_cycle or (transaction.id_cycle is not None and transaction.id_cycle != active_cycle.id_cycle):
            continue

        type_key, calibre_key = category_from_product
        category_key = (type_key, calibre_key)
        category = building["categories"].setdefault(
            category_key,
            {
                "type_oeuf": type_key,
                "calibre": calibre_key,
                "label": _category_label(type_key, calibre_key),
                "produced_eggs": 0,
                "lost_eggs": 0,
                "sold_eggs": 0,
            },
        )
        building["sold_eggs"] += quantity
        category["sold_eggs"] += quantity
        movements.append({
            "time": transaction.date_creation.strftime("%H:%M") if transaction.date_creation else None,
            "type": "sale",
            "label": "Vente client",
            "detail": product_name,
            "quantity": -quantity,
            "id_batiment": transaction.id_batiment,
            "nom_batiment": nom_batiment,
        })

    building_payload = []
    total_produced = 0
    total_sold = 0
    total_lost = 0
    missing_count = 0

    for building in stock_by_batiment.values():
        available = building["produced_eggs"] - building["sold_eggs"] - building["lost_eggs"]
        status_value = _stock_status(building["produced_eggs"], available, building["entries_count"])
        if status_value == "missing":
            missing_count += 1

        categories = []
        for category in building["categories"].values():
            category_available = (
                category["produced_eggs"] -
                category["sold_eggs"] -
                category["lost_eggs"]
            )
            categories.append({
                **category,
                "available_eggs": category_available,
            })

        building_payload.append({
            "id_batiment": building["id_batiment"],
            "nom_batiment": building["nom_batiment"],
            "produced_eggs": building["produced_eggs"],
            "sold_eggs": building["sold_eggs"],
            "lost_eggs": building["lost_eggs"],
            "available_eggs": available,
            "cycle": building["cycle"],
            "mortalite": building["mortalite"],
            "consommation_aliment_kg": building["consommation_aliment_kg"],
            "formules": sorted(building["formules"]),
            "entries_count": building["entries_count"],
            "status": status_value,
            "categories": sorted(categories, key=lambda item: item["label"]),
        })

        total_produced += building["produced_eggs"]
        total_sold += building["sold_eggs"]
        total_lost += building["lost_eggs"]

    movements.sort(key=lambda item: item["time"] or "", reverse=True)

    return {
        "date": target_date,
        "totals": {
            "produced_eggs": total_produced,
            "sold_eggs": total_sold,
            "lost_eggs": total_lost,
            "available_eggs": total_produced - total_sold - total_lost,
            "unassigned_sold_eggs": unassigned_sold_eggs,
            "buildings_count": len(batiments),
            "missing_buildings_count": missing_count,
        },
        "batiments": building_payload,
        "movements": movements[:12],
    }


@router.get("/performance", response_model=ProductionPerformanceResponse)
def get_cycle_performance(
    id_cycle: int,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    cycle = db.query(CycleProduction).filter(CycleProduction.id_cycle == id_cycle).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Lot introuvable")

    refresh_cycle_status(db, cycle)
    productions = db.query(Production).filter(
        Production.id_cycle == id_cycle,
        Production.est_actif.is_(True),
    ).order_by(Production.date_production.asc(), Production.id_production.asc()).all()

    daily = {}
    for prod in productions:
        day = daily.setdefault(prod.date_production, {
            "date": prod.date_production,
            "mort": 0,
            "oeufs": 0,
            "aliment_kg": Decimal("0"),
            "grammage_total": Decimal("0"),
            "grammage_count": 0,
            "formules": set(),
            "calibres": set(),
        })

        day["mort"] += int(prod.mortalite or 0)
        day["aliment_kg"] += Decimal(str(prod.consommation_aliment_kg or 0))
        if prod.grammage is not None:
            day["grammage_total"] += Decimal(str(prod.grammage or 0))
            day["grammage_count"] += 1
        if prod.formule:
            day["formules"].add(prod.formule)
        if prod.calibre:
            day["calibres"].add(prod.calibre)
        if prod.type_oeuf != "perdu":
            day["oeufs"] += int(prod.nombre_oeufs or 0)

    rows = []
    effectif_running = cycle.effectif_initial
    cumulative_week_eggs = 0
    current_week_key = None
    week_summary = None

    def push_week_summary(summary):
        if not summary:
            return
        rows.append({
            "id": f"summary-{summary['week_key']}",
            "rowType": "summary",
            "date": "Total/Moyenne",
            "mort": summary["mort"],
            "mort_pct": _ratio_percent(summary["mort"], summary["effectif_debut"]) if summary["effectif_debut"] else "-",
            "oeufs": summary["oeufs"],
            "oeufs_cumul": summary["oeufs"],
            "ponte_pct": _ratio_percent(summary["oeufs"], summary["effectif_debut"]) if summary["effectif_debut"] else "-",
            "formule": ", ".join(sorted(summary["formules"])) or "-",
            "aliment_kg": _safe_decimal(summary["aliment_kg"]),
            "g_poule": _safe_decimal((summary["aliment_kg"] * Decimal("1000")) / Decimal(summary["effectif_debut"]), "0.1") if summary["effectif_debut"] else "-",
            "g_oeuf": _safe_decimal((summary["aliment_kg"] * Decimal("1000")) / Decimal(summary["oeufs"]), "0.1") if summary["oeufs"] else "-",
            "calibre": ", ".join(sorted(summary["calibres"])) or "-",
            "effectif_debut": summary["effectif_debut"],
            "effectif_fin": summary["effectif_fin"],
            "age_semaines": summary["age_semaines"],
        })

    for day_date in sorted(daily.keys()):
        day = daily[day_date]
        week_start = day_date - timedelta(days=day_date.weekday())
        week_end = week_start + timedelta(days=6)
        week_key = week_start.isoformat()

        if current_week_key != week_key:
            push_week_summary(week_summary)
            current_week_key = week_key
            cumulative_week_eggs = 0
            week_summary = {
                "week_key": week_key,
                "mort": 0,
                "oeufs": 0,
                "aliment_kg": Decimal("0"),
                "formules": set(),
                "calibres": set(),
                "effectif_debut": effectif_running,
                "effectif_fin": effectif_running,
                "age_semaines": cycle.age_depart_semaines + max((day_date - cycle.date_debut).days, 0) // 7,
            }
            rows.append({
                "id": f"week-{week_key}",
                "rowType": "week",
                "date": f"Semaine {week_start.strftime('%d/%m')} - {week_end.strftime('%d/%m')}",
            })

        effectif_debut = effectif_running
        total_out = day["mort"]
        effectif_fin = max(effectif_debut - total_out, 0) if effectif_debut is not None else None
        cumulative_week_eggs += day["oeufs"]
        age_semaines = cycle.age_depart_semaines + max((day_date - cycle.date_debut).days, 0) // 7

        rows.append({
            "id": f"day-{day_date.isoformat()}",
            "rowType": "day",
            "date": day_date.strftime("%d/%m/%Y"),
            "mort": day["mort"],
            "mort_pct": _ratio_percent(day["mort"], effectif_debut) if effectif_debut else "-",
            "oeufs": day["oeufs"],
            "oeufs_cumul": cumulative_week_eggs,
            "ponte_pct": _ratio_percent(day["oeufs"], effectif_debut) if effectif_debut else "-",
            "formule": ", ".join(sorted(day["formules"])) or "-",
            "aliment_kg": _safe_decimal(day["aliment_kg"]),
            "g_poule": _safe_decimal((day["aliment_kg"] * Decimal("1000")) / Decimal(effectif_debut), "0.1") if effectif_debut else "-",
            "g_oeuf": _safe_decimal((day["aliment_kg"] * Decimal("1000")) / Decimal(day["oeufs"]), "0.1") if day["oeufs"] else "-",
            "calibre": ", ".join(sorted(day["calibres"])) or "-",
            "effectif_debut": effectif_debut,
            "effectif_fin": effectif_fin,
            "age_semaines": age_semaines,
        })

        if week_summary:
            week_summary["mort"] += day["mort"]
            week_summary["oeufs"] += day["oeufs"]
            week_summary["aliment_kg"] += day["aliment_kg"]
            week_summary["formules"].update(day["formules"])
            week_summary["calibres"].update(day["calibres"])
            week_summary["effectif_fin"] = effectif_fin
            week_summary["age_semaines"] = age_semaines

        effectif_running = effectif_fin

    push_week_summary(week_summary)
    db.commit()
    return {
        "cycle": cycle_to_dict(db, cycle),
        "rows": rows,
    }


@router.get("/{id}", response_model=ProductionRead)
def get_production(
    id: int, 
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Récupère le détail d'une production.
    """
    result = db.query(
        Production,
        Batiment.nom.label("nom_batiment"),
        CycleProduction.nom_cycle.label("nom_cycle"),
    ).select_from(Production).join(
        Batiment,
        Production.id_batiment == Batiment.id_batiment,
    ).outerjoin(
        CycleProduction,
        Production.id_cycle == CycleProduction.id_cycle,
    ).filter(
        Production.id_production == id,
        Production.est_actif.is_(True),
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Production introuvable")
    
    prod, nom_batiment, nom_cycle = result
    p_data = {c.name: getattr(prod, c.name) for c in prod.__table__.columns}
    p_data["nom_batiment"] = nom_batiment
    p_data["nom_cycle"] = nom_cycle
    return p_data


@router.put("/{id}", response_model=ProductionRead)
def update_production(
    id: int,
    prod_in: ProductionUpdate,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Met à jour une production existante et recalcule les cartons si besoin.
    """
    prod = db.query(Production).filter(
        Production.id_production == id,
        Production.est_actif.is_(True),
    ).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Production introuvable")
    
    update_dict = prod_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(prod, key, value)

    if prod.id_cycle:
        cycle = db.query(CycleProduction).filter(CycleProduction.id_cycle == prod.id_cycle).first()
        if not cycle or cycle.id_batiment != prod.id_batiment:
            raise HTTPException(status_code=400, detail="Lot introuvable pour ce batiment")
        refresh_cycle_status(db, cycle)
        if cycle.statut not in ACTIVE_CYCLE_STATUSES:
            raise HTTPException(status_code=400, detail="Ce lot est termine")
        if prod.date_production < cycle.date_debut or prod.date_production > cycle.date_fin_prevue:
            raise HTTPException(status_code=400, detail="La date de production est en dehors du lot")
    else:
        cycle = require_active_cycle_for_date(
            db,
            prod.id_batiment,
            prod.date_production,
            action_label="de modifier la production",
        )
        prod.id_cycle = cycle.id_cycle

    prod.calibre = _deduce_calibre(prod.type_oeuf, prod.grammage)
    
    # Recalculer les cartons si le nombre d'œufs ou le type a changé
    if 'nombre_oeufs' in update_dict or 'type_oeuf' in update_dict:
        prod.nombre_cartons = Production.calculer_cartons(prod.nombre_oeufs, prod.type_oeuf)

    ensure_sellable_egg_product(db, prod.type_oeuf, prod.calibre)
    
    prod.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    
    db.commit()
    db.refresh(prod)
    
    # Retourner avec le nom du bâtiment
    batiment = db.query(Batiment).filter(Batiment.id_batiment == prod.id_batiment).first()
    res = {c.name: getattr(prod, c.name) for c in prod.__table__.columns}
    res["nom_batiment"] = batiment.nom if batiment else None
    res["nom_cycle"] = cycle.nom_cycle
    return res


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_production(
    id: int,
    raison: str = Query(
        default="Correction de la saisie de production",
        min_length=1,
        max_length=1000,
    ),
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """
    Désactive une production sans supprimer son historique.

    La ligne reste conservée pour audit et ne participe plus aux calculs de
    stock actif. Une correction conserve l'utilisateur, la date et le motif.
    """
    prod = db.query(Production).filter(
        Production.id_production == id,
        Production.est_actif.is_(True),
    ).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Production introuvable")
    
    prod.est_actif = False
    prod.date_annulation = datetime.now(timezone.utc)
    prod.motif_annulation = raison.strip()
    prod.id_utilisateur_annulation = current_user.id_utilisateur if current_user else None
    prod.id_utilisateur_modification = current_user.id_utilisateur if current_user else None
    db.commit()
    return None
