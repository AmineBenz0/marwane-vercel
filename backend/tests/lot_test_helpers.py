from datetime import timedelta

from app.models.cycle_production import CycleProduction
from app.models.lot_production import LotProduction


def add_lot_cycle(
    db_session,
    batiment,
    *,
    name,
    date_debut,
    age_depart_semaines=0,
    effectif_initial=100,
    duree_semaines=100,
    statut="actif",
    date_fin_reelle=None,
):
    date_fin_prevue = date_debut + timedelta(weeks=duree_semaines) - timedelta(days=1)
    lot = LotProduction(
        nom_lot=name,
        date_debut=date_debut,
        age_depart_semaines=age_depart_semaines,
        effectif_initial=effectif_initial,
        duree_semaines=duree_semaines,
        date_fin_prevue=date_fin_prevue,
        date_fin_reelle=date_fin_reelle,
        statut=statut,
    )
    db_session.add(lot)
    db_session.flush()
    cycle = CycleProduction(
        id_lot=lot.id_lot,
        id_batiment=batiment.id_batiment,
        nom_cycle=name,
        date_debut=date_debut,
        age_depart_semaines=age_depart_semaines,
        effectif_initial=effectif_initial,
        duree_semaines=duree_semaines,
        date_fin_prevue=date_fin_prevue,
        date_fin_reelle=date_fin_reelle,
        statut=statut,
    )
    db_session.add(cycle)
    db_session.commit()
    db_session.refresh(cycle)
    return lot, cycle
