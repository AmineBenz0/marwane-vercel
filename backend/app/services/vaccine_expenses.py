"""Daily vaccine expenses share the day's database transaction and financial ledger."""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException

from app.models.charge import Charge
from app.models.vaccin import Vaccin
from app.services.charge_operations import cancel_charge
from app.services.financial_ledger import apply_charge_impact
from app.services.ledger import record_correction


def daily_vaccine_expenses(db, building_id, day):
    return db.query(Charge).filter(
        Charge.id_batiment == building_id,
        Charge.date_charge == day,
        Charge.source_journaliere.is_(True),
        Charge.statut == "active",
    ).order_by(Charge.id_charge).all()


def expense_versions(charges):
    def version(charge):
        timestamp = charge.date_modification
        if timestamp.tzinfo is not None:
            timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)
        return timestamp.isoformat(timespec="microseconds") + "Z"
    return {charge.id_charge: version(charge) for charge in charges}


def sync_vaccine_expenses(db, data, existing, cycle_id, current_user):
    by_id = {charge.id_charge: charge for charge in existing}
    ids = [line.id_charge for line in data.depenses_vaccins if line.id_charge is not None]
    if len(ids) != len(set(ids)) or any(identifier not in by_id for identifier in ids):
        raise HTTPException(status_code=409, detail="Une dépense ne correspond pas à cette journée. Rouvrez le formulaire.")
    user_id = current_user.id_utilisateur if current_user else None
    retained_ids = set(ids)
    for charge in existing:
        if charge.id_charge not in retained_ids:
            cancel_charge(db, charge, "Retrait du vaccin de la saisie quotidienne", current_user)

    for line in data.depenses_vaccins:
        charge = by_id.get(line.id_charge)
        vaccine = db.get(Vaccin, line.id_vaccin)
        if vaccine is None or (not vaccine.est_actif and (charge is None or charge.id_vaccin != line.id_vaccin)):
            raise HTTPException(status_code=400, detail="Vaccin indisponible. Rouvrez le formulaire.")
        amount = (line.quantite * line.prix_unitaire).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if amount <= 0 or amount >= Decimal("10000000000000"):
            raise HTTPException(status_code=400, detail="Le total de la dépense est hors limites.")
        creating = charge is None
        if creating:
            charge = Charge(
                source_journaliere=True, id_batiment=data.id_batiment,
                id_cycle=cycle_id, date_charge=data.date_production,
                categorie="Vaccins", id_utilisateur_creation=user_id,
            )
            db.add(charge)
        if creating or charge.id_vaccin != line.id_vaccin:
            charge.nom_vaccin = vaccine.nom
            charge.unite = vaccine.unite
        charge.id_vaccin = line.id_vaccin
        charge.libelle = f"Vaccin – {charge.nom_vaccin}"
        charge.quantite = line.quantite
        charge.prix_unitaire = line.prix_unitaire
        charge.montant = amount
        charge.id_compte = line.id_compte
        charge.id_utilisateur_modification = user_id
        # A monotonic application timestamp also protects same-second corrections.
        charge.date_modification = datetime.now(timezone.utc)
        db.flush()
        apply_charge_impact(db, charge, current_user=current_user, reason="Saisie quotidienne des vaccins")
        if not creating:
            record_correction(db, type_entite="charge", id_entite=charge.id_charge,
                              action="modification", raison="Correction du vaccin dans la saisie quotidienne",
                              current_user=current_user,
                              details={"quantite": str(charge.quantite), "prix_unitaire": str(charge.prix_unitaire)})
    db.flush()
