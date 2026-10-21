"""Exercise independent-lot database guards against the fully migrated PostgreSQL schema.

All fixture rows are created inside one transaction and rolled back. This must run
after Alembic migrations; ORM-created test schemas do not include SQL triggers.
"""
from datetime import date, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.batiment import Batiment
from app.models.cycle_production import CycleProduction
from app.models.lot_production import LotProduction


def expect_database_rejection(session: Session, label: str, statement) -> None:
    try:
        with session.begin_nested():
            statement()
            session.flush()
    except SQLAlchemyError:
        print(f"PASS: database rejected {label}")
        return
    raise AssertionError(f"Database accepted invalid relationship: {label}")


def make_lot(name: str, start: date, count: int = 10) -> LotProduction:
    return LotProduction(
        nom_lot=name,
        date_debut=start,
        age_depart_semaines=0,
        effectif_initial=count,
        duree_semaines=100,
        date_fin_prevue=start + timedelta(weeks=100),
        statut="actif",
    )


def make_cycle(lot_id: int, building_id: int, name: str, start: date, count: int = 10) -> CycleProduction:
    return CycleProduction(
        id_lot=lot_id,
        id_batiment=building_id,
        nom_cycle=name,
        date_debut=start,
        age_depart_semaines=0,
        effectif_initial=count,
        duree_semaines=100,
        date_fin_prevue=start + timedelta(weeks=100),
        statut="actif",
    )


def main() -> None:
    engine = create_engine(settings.DATABASE_URL)
    try:
        with Session(engine) as session:
            transaction = session.begin()
            try:
                start = date.today()
                building_a = Batiment(nom="Lot DB validation A", est_actif=True)
                building_b = Batiment(nom="Lot DB validation B", est_actif=True)
                session.add_all([building_a, building_b])
                session.flush()

                parent_a = make_lot("Lot DB validation A", start)
                session.add(parent_a)
                session.flush()
                cycle_a = make_cycle(
                    parent_a.id_lot, building_a.id_batiment, "Lot DB validation A", start
                )
                session.add(cycle_a)
                session.flush()

                # A parent write must keep the compatibility snapshot aligned.
                session.execute(
                    text(
                        "UPDATE lots_production SET age_depart_semaines = 9 "
                        "WHERE id_lot = :lot_id"
                    ),
                    {"lot_id": parent_a.id_lot},
                )
                session.flush()
                snapshot_age = session.execute(
                    text(
                        "SELECT age_depart_semaines FROM cycles_production "
                        "WHERE id_lot = :lot_id"
                    ),
                    {"lot_id": parent_a.id_lot},
                ).scalar_one()
                if snapshot_age != 9:
                    raise AssertionError(
                        f"Parent update did not synchronize the cycle snapshot: {snapshot_age}"
                    )
                print("PASS: parent metadata update synchronized the cycle snapshot")

                # The BEFORE trigger repairs direct snapshot writes from the parent.
                # Assert the stored invariant, rather than requiring a rejection.
                session.execute(
                    text(
                        "UPDATE cycles_production SET age_depart_semaines = 8, "
                        "effectif_initial = 999, nom_cycle = 'Tampered snapshot', "
                        "statut = 'termine' WHERE id_lot = :lot_id"
                    ),
                    {"lot_id": parent_a.id_lot},
                )
                mismatches = session.execute(
                    text(
                        "SELECT count(*) FROM cycles_production c "
                        "JOIN lots_production l ON l.id_lot = c.id_lot "
                        "WHERE c.id_lot = :lot_id AND "
                        "ROW(c.nom_cycle, c.souche, c.date_debut, c.age_depart_semaines, "
                        "c.effectif_initial, c.duree_semaines, c.date_fin_prevue, "
                        "c.date_fin_reelle, c.statut, c.notes) IS DISTINCT FROM "
                        "ROW(l.nom_lot, l.souche, l.date_debut, l.age_depart_semaines, "
                        "l.effectif_initial, l.duree_semaines, l.date_fin_prevue, "
                        "l.date_fin_reelle, l.statut, l.notes)"
                    ),
                    {"lot_id": parent_a.id_lot},
                ).scalar_one()
                if mismatches:
                    raise AssertionError("Direct cycle write left a snapshot different from its parent")
                print("PASS: direct cycle write retained all authoritative parent fields")

                parent_b = make_lot("Lot DB validation B", start)
                session.add(parent_b)
                session.flush()
                expect_database_rejection(
                    session,
                    "a second active cycle for one building",
                    lambda: session.add(
                        make_cycle(
                            parent_b.id_lot,
                            building_a.id_batiment,
                            "Duplicate active building",
                            start,
                        )
                    ),
                )

                expect_database_rejection(
                    session,
                    "a second cycle for one lot",
                    lambda: session.add(
                        CycleProduction(
                            id_lot=parent_a.id_lot,
                            id_batiment=building_b.id_batiment,
                            nom_cycle="Duplicate lot parent",
                            date_debut=start,
                            age_depart_semaines=9,
                            effectif_initial=10,
                            duree_semaines=100,
                            date_fin_prevue=start + timedelta(weeks=100),
                            statut="termine",
                        )
                    ),
                )

                orphan = make_lot("Orphan lot guard", start)
                session.add(orphan)
                session.flush()
                expect_database_rejection(
                    session,
                    "a lot without exactly one building cycle",
                    lambda: session.execute(
                        text("SET CONSTRAINTS lots_production_exactly_one_cycle IMMEDIATE")
                    ),
                )
                transaction.rollback()
            except Exception:
                if transaction.is_active:
                    transaction.rollback()
                raise
    finally:
        engine.dispose()
    print("Independent-lot database validation passed.")


if __name__ == "__main__":
    main()

