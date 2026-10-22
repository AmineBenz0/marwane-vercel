"""Whole-lot weekly egg totals, anchored to arrival and independent of pagination."""
from datetime import date, timedelta

from sqlalchemy import func

from app.models.cycle_production import CycleProduction
from app.models.production import Production

EGG_TYPES = ("normal", "blanc", "double_jaune", "double_jaune_demarrage", "casse")


def lot_egg_evolution(db, lot):
    end = min(lot.date_fin_reelle or date.today(), date.today())
    # Aggregate in SQL before building weeks: no production-list limit and no
    # loading of full ORM production objects, even for a long-running lot.
    rows = db.query(
        Production.date_production, Production.id_batiment, Production.type_oeuf,
        func.sum(Production.nombre_oeufs).label("quantity"),
    ).join(CycleProduction, Production.id_cycle == CycleProduction.id_cycle).filter(
        CycleProduction.id_lot == lot.id_lot,
        Production.est_actif.is_(True),
        Production.date_production >= lot.date_debut,
        Production.date_production <= end,
    ).group_by(Production.date_production, Production.id_batiment, Production.type_oeuf).all()

    grouped = {}
    totals = dict.fromkeys(EGG_TYPES, 0)
    for row in rows:
        number = (row.date_production - lot.date_debut).days // 7 + 1
        week = grouped.setdefault(number, {"counts": dict.fromkeys(EGG_TYPES), "entries": set()})
        week["entries"].add((row.date_production, row.id_batiment))
        kind = "casse" if row.type_oeuf == "perdu" else row.type_oeuf
        if kind in totals:
            week["counts"][kind] = (week["counts"][kind] or 0) + int(row.quantity or 0)
            totals[kind] += int(row.quantity or 0)

    weeks = []
    cursor = lot.date_debut
    while cursor <= end:
        number = len(weeks) + 1
        week_end = min(cursor + timedelta(days=6), end)
        recorded = grouped.get(number)
        expected = ((week_end - cursor).days + 1) * len(lot.allocations)
        entered = len(recorded["entries"]) if recorded else 0
        weeks.append({
            "semaine": number, "date_debut": cursor, "date_fin": week_end,
            "quantites": recorded["counts"] if recorded else dict.fromkeys(EGG_TYPES),
            "saisies": entered, "saisies_attendues": expected,
            "incomplete": entered < expected,
            "partielle": (week_end - cursor).days < 6,
        })
        cursor += timedelta(days=7)
    return {"id_lot": lot.id_lot, "semaines": weeks, "totaux": totals}
