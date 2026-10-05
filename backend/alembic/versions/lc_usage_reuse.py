"""Return cancelled LC uses to availability and retain reversal history."""

from alembic import op
import sqlalchemy as sa


revision = "lc_usage_reuse"
down_revision = "lc_cession_cancellation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lettres_credit",
        sa.Column("version_utilisation", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("cessions_lc", sa.Column("id_cession_origine", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_cessions_lc_origine",
        "cessions_lc",
        "cessions_lc",
        ["id_cession_origine"],
        ["id_cession"],
        ondelete="SET NULL",
    )
    op.create_index(
        "uq_cessions_lc_one_reversal",
        "cessions_lc",
        ["id_cession_origine"],
        unique=True,
    )

    # Convert the old bilateral link into a one-way pointer from each reversal.
    op.execute("""
        UPDATE cessions_lc AS reversal
        SET id_cession_origine = original.id_cession
        FROM cessions_lc AS original
        WHERE original.id_cession_inverse = reversal.id_cession
          AND reversal.id_cession_inverse = original.id_cession
    """)

    # Preserve an in-use state only when there is still a live financial effect.
    op.execute("""
        UPDATE lettres_credit AS lc
        SET statut = CASE WHEN
            EXISTS (
                SELECT 1 FROM paiements p
                WHERE p.id_lc = lc.id_lc AND p.statut <> 'annule'
            ) OR EXISTS (
                SELECT 1 FROM mouvements_bancaires mb
                WHERE mb.source = 'lc'
                  AND mb.reference = lc.numero_reference
                  AND mb.statut = 'active'
            ) OR EXISTS (
                SELECT 1 FROM cessions_lc c
                WHERE c.id_lc = lc.id_lc
                  AND c.id_cession_origine IS NULL
                  AND c.statut = 'active'
                  AND NOT EXISTS (
                      SELECT 1 FROM cessions_lc r
                      WHERE r.id_cession_origine = c.id_cession
                  )
            ) THEN 'utilisee' ELSE 'active' END
    """)
    op.execute("UPDATE lettres_credit SET version_utilisation = 1 WHERE statut = 'utilisee'")

    op.drop_constraint("check_lc_statut_valide", "lettres_credit", type_="check")
    op.create_check_constraint(
        "check_lc_statut_valide",
        "lettres_credit",
        "statut IN ('active', 'utilisee')",
    )

    op.drop_index("ix_cessions_lc_date_annulation", table_name="cessions_lc")
    op.drop_index("ix_cessions_lc_id_cession_inverse", table_name="cessions_lc")
    op.drop_constraint("fk_cessions_lc_utilisateur_annulation", "cessions_lc", type_="foreignkey")
    op.drop_constraint("fk_cessions_lc_inverse", "cessions_lc", type_="foreignkey")
    op.drop_constraint("check_cessions_lc_statut_valide", "cessions_lc", type_="check")
    for column in (
        "id_utilisateur_annulation",
        "date_annulation",
        "motif_annulation",
        "id_cession_inverse",
        "statut",
    ):
        op.drop_column("cessions_lc", column)


def downgrade() -> None:
    op.add_column("cessions_lc", sa.Column("statut", sa.String(20), server_default="active", nullable=False))
    op.add_column("cessions_lc", sa.Column("id_cession_inverse", sa.Integer(), nullable=True))
    op.add_column("cessions_lc", sa.Column("motif_annulation", sa.Text(), nullable=True))
    op.add_column("cessions_lc", sa.Column("date_annulation", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cessions_lc", sa.Column("id_utilisateur_annulation", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "check_cessions_lc_statut_valide", "cessions_lc", "statut IN ('active', 'annulee')"
    )
    op.create_foreign_key(
        "fk_cessions_lc_inverse", "cessions_lc", "cessions_lc", ["id_cession_inverse"], ["id_cession"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_cessions_lc_utilisateur_annulation", "cessions_lc", "utilisateurs", ["id_utilisateur_annulation"], ["id_utilisateur"]
    )
    op.create_index("ix_cessions_lc_id_cession_inverse", "cessions_lc", ["id_cession_inverse"])
    op.create_index("ix_cessions_lc_date_annulation", "cessions_lc", ["date_annulation"])
    op.execute("""
        UPDATE cessions_lc AS reversal
        SET id_cession_inverse = original.id_cession
        FROM cessions_lc AS original
        WHERE reversal.id_cession_origine = original.id_cession
    """)
    op.execute("""
        UPDATE cessions_lc AS original
        SET id_cession_inverse = reversal.id_cession
        FROM cessions_lc AS reversal
        WHERE reversal.id_cession_origine = original.id_cession
    """)
    op.drop_index("uq_cessions_lc_one_reversal", table_name="cessions_lc")
    op.drop_constraint("fk_cessions_lc_origine", "cessions_lc", type_="foreignkey")
    op.drop_column("cessions_lc", "id_cession_origine")
    op.drop_constraint("check_lc_statut_valide", "lettres_credit", type_="check")
    op.create_check_constraint(
        "check_lc_statut_valide",
        "lettres_credit",
        "statut IN ('active', 'utilisee', 'cedee', 'expiree', 'annulee')",
    )
    op.drop_column("lettres_credit", "version_utilisation")
