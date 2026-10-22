"""Store each supplier's preferred payment source."""
from pathlib import Path
import re

from alembic import op


revision = "fournisseur_payment_preference"
down_revision = "egg_sale_production_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "supabase_migrations/0007_fournisseur_payment_preference.sql"
    sql = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", path.read_text(encoding="utf-8"))
    op.execute(sql)


def downgrade() -> None:
    op.drop_constraint(
        "check_paiement_compte_virement",
        "paiements",
        type_="check",
    )
    op.drop_index("ix_paiements_id_compte", table_name="paiements")
    op.drop_column("paiements", "id_compte")
    op.drop_constraint(
        "ck_fournisseurs_mode_reglement_prefere",
        "fournisseurs",
        type_="check",
    )
    op.drop_column("fournisseurs", "mode_reglement_prefere")
