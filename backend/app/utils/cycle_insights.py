"""Weekly flock summaries anchored to arrival; missing days are never zero-filled."""
from datetime import date, timedelta
from decimal import Decimal

from app.models.production import Production
from app.utils.production_cycles import cycle_to_dict


def cycle_insights(db, cycle):
    end = min(cycle.date_fin_reelle or date.today(), date.today())
    records = db.query(Production).filter(
        Production.id_cycle == cycle.id_cycle,
        Production.est_actif.is_(True),
        Production.date_production >= cycle.date_debut,
        Production.date_production <= end,
    ).order_by(Production.date_production).all()
    daily = {}
    for record in records:
        day = daily.setdefault(record.date_production, {
            "eggs": 0, "mortality": 0, "feed": Decimal(0), "formulas": set(),
        })
        if record.type_oeuf not in {"casse", "perdu"}:
            day["eggs"] += record.nombre_oeufs
        day["mortality"] += record.mortalite or 0
        day["feed"] += record.consommation_aliment_kg or Decimal(0)
        if record.formule:
            day["formulas"].add(record.formule)

    weeks = []
    flock = cycle.effectif_initial
    cursor = cycle.date_debut
    while cursor <= end:
        week_end = min(cursor + timedelta(days=6), end)
        beginning = flock
        eggs = mortality = entered = bird_days = 0
        feed = Decimal(0)
        formulas = set()
        for offset in range((week_end - cursor).days + 1):
            day = daily.get(cursor + timedelta(days=offset))
            if day is None:
                continue
            entered += 1
            bird_days += flock or 0
            eggs += day["eggs"]
            mortality += day["mortality"]
            feed += day["feed"]
            formulas.update(day["formulas"])
            if flock is not None:
                flock = max(flock - day["mortality"], 0)
        expected = (week_end - cursor).days + 1
        weeks.append({
            "semaine": len(weeks) + 1,
            "age_semaines": cycle.age_depart_semaines + (cursor - cycle.date_debut).days // 7,
            "date_debut": cursor, "date_fin": week_end,
            "effectif_debut": beginning, "effectif_fin": flock,
            "mortalite": mortality, "oeufs": eggs, "aliment_kg": feed,
            "formules": sorted(formulas),
            "jours_saisis": entered, "jours_attendus": expected,
            "ponte_pct": round(Decimal(eggs) * 100 / bird_days, 2) if bird_days else None,
            "g_poule_jour": round(feed * 1000 / bird_days, 2) if bird_days else None,
        })
        cursor += timedelta(days=7)
    return {
        "cycle": cycle_to_dict(db, cycle, end),
        "semaines": weeks,
        "jours_saisis": len(daily),
        "total_oeufs": sum(day["eggs"] for day in daily.values()),
        "total_aliment_kg": sum((day["feed"] for day in daily.values()), Decimal(0)),
        "mortalite_totale": sum(day["mortality"] for day in daily.values()),
    }
