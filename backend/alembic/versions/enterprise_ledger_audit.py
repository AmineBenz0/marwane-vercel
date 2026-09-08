"""Add append-only financial correction metadata and journal."""

from alembic import op
import sqlalchemy as sa


revision = "enterprise_ledger_audit"
down_revision = "enterprise_security"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("paiements", sa.Column("date_annulation", sa.DateTime(timezone=True), nullable=True))
    for table in ("caisse", "mouvements_bancaires"):
        op.add_column(table, sa.Column("motif_annulation", sa.Text(), nullable=True))
        op.add_column(table, sa.Column("date_annulation", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("id_utilisateur_annulation", sa.Integer(), nullable=True))
        op.add_column(table, sa.Column("id_mouvement_inverse", sa.Integer(), nullable=True))
        op.create_index(f"ix_{table}_inverse", table, ["id_mouvement_inverse"], unique=False)
        op.create_foreign_key(
            f"fk_{table}_annulation_user",
            table,
            "utilisateurs",
            ["id_utilisateur_annulation"],
            ["id_utilisateur"],
        )

    op.create_foreign_key(
        "fk_caisse_mouvement_inverse",
        "caisse",
        "caisse",
        ["id_mouvement_inverse"],
        ["id_mouvement"],
    )
    op.create_foreign_key(
        "fk_bank_mouvement_inverse",
        "mouvements_bancaires",
        "mouvements_bancaires",
        ["id_mouvement_inverse"],
        ["id_mouvement"],
    )
    op.add_column("charges", sa.Column("date_annulation", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "corrections_financieres",
        sa.Column("id_correction", sa.Integer(), primary_key=True),
        sa.Column("type_entite", sa.String(length=30), nullable=False),
        sa.Column("id_entite", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("id_mouvement_original", sa.Integer(), nullable=True),
        sa.Column("id_mouvement_inverse", sa.Integer(), nullable=True),
        sa.Column("raison", sa.Text(), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("id_utilisateur", sa.Integer(), sa.ForeignKey("utilisateurs.id_utilisateur"), nullable=True),
        sa.Column("date_correction", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_corrections_financieres_type_entite", "corrections_financieres", ["type_entite"], unique=False)
    op.create_index("ix_corrections_financieres_id_entite", "corrections_financieres", ["id_entite"], unique=False)
    op.create_index("ix_corrections_financieres_date", "corrections_financieres", ["date_correction"], unique=False)
    op.execute("ALTER TABLE public.corrections_financieres ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE public.corrections_financieres FROM PUBLIC")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON TABLE public.corrections_financieres FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON TABLE public.corrections_financieres FROM authenticated;
                GRANT SELECT ON TABLE public.corrections_financieres TO authenticated;
                DROP POLICY IF EXISTS app_authenticated_access ON public.corrections_financieres;
                DROP POLICY IF EXISTS app_authenticated_read ON public.corrections_financieres;
                CREATE POLICY app_authenticated_read ON public.corrections_financieres
                    FOR SELECT TO authenticated USING (true);
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.corrections_financieres TO app_runtime;
                DROP POLICY IF EXISTS app_runtime_access ON public.corrections_financieres;
                CREATE POLICY app_runtime_access ON public.corrections_financieres
                    FOR ALL TO app_runtime USING (true) WITH CHECK (true);
                GRANT USAGE, SELECT ON SEQUENCE public.corrections_financieres_id_correction_seq TO app_runtime;
            END IF;
        END $$;
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_correction_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Financial correction journal is append-only';
        END;
        $$;
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_stock_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Stock ledger is append-only; use a reversal movement';
        END;
        $$;
    """
    )
    op.execute("""
        CREATE TRIGGER trg_no_mutation_financial_correction
        BEFORE UPDATE OR DELETE ON corrections_financieres
        FOR EACH ROW EXECUTE FUNCTION prevent_correction_mutation();
        CREATE TRIGGER trg_no_delete_stock_movement
        BEFORE DELETE ON mouvements_stock
        FOR EACH ROW EXECUTE FUNCTION prevent_stock_delete();
    """)

    # Database-level guardrails keep application regressions from deleting
    # historical financial rows or rewriting their monetary identity.
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_financial_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Financial records are append-only; use a void or reversal operation';
        END;
        $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            DROP TRIGGER IF EXISTS trg_no_delete_caisse ON caisse;
            CREATE TRIGGER trg_no_delete_caisse BEFORE DELETE ON caisse
            FOR EACH ROW EXECUTE FUNCTION prevent_financial_delete();
            DROP TRIGGER IF EXISTS trg_no_delete_bank_movement ON mouvements_bancaires;
            CREATE TRIGGER trg_no_delete_bank_movement BEFORE DELETE ON mouvements_bancaires
            FOR EACH ROW EXECUTE FUNCTION prevent_financial_delete();
            DROP TRIGGER IF EXISTS trg_no_delete_payment ON paiements;
            CREATE TRIGGER trg_no_delete_payment BEFORE DELETE ON paiements
            FOR EACH ROW EXECUTE FUNCTION prevent_financial_delete();
            DROP TRIGGER IF EXISTS trg_no_delete_charge ON charges;
            CREATE TRIGGER trg_no_delete_charge BEFORE DELETE ON charges
            FOR EACH ROW EXECUTE FUNCTION prevent_financial_delete();
        END $$;
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION protect_financial_identity() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_TABLE_NAME = 'paiements' THEN
                IF OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
                   OR OLD.date_paiement IS DISTINCT FROM NEW.date_paiement
                   OR OLD.montant IS DISTINCT FROM NEW.montant
                   OR OLD.type_paiement IS DISTINCT FROM NEW.type_paiement
                   OR OLD.id_lc IS DISTINCT FROM NEW.id_lc THEN
                    RAISE EXCEPTION 'Payment financial identity is immutable; void and recreate it';
                END IF;
            ELSIF TG_TABLE_NAME = 'caisse' THEN
                IF OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
                   OR OLD.montant IS DISTINCT FROM NEW.montant
                   OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
                   OR OLD.id_transaction IS DISTINCT FROM NEW.id_transaction
                   OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
                   OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
                    RAISE EXCEPTION 'Cash movement identity is immutable; void and replace it';
                END IF;
            ELSE
                IF OLD.id_compte IS DISTINCT FROM NEW.id_compte
                   OR OLD.date_mouvement IS DISTINCT FROM NEW.date_mouvement
                   OR OLD.montant IS DISTINCT FROM NEW.montant
                   OR OLD.type_mouvement IS DISTINCT FROM NEW.type_mouvement
                   OR OLD.source IS DISTINCT FROM NEW.source
                   OR OLD.reference IS DISTINCT FROM NEW.reference
                   OR OLD.id_paiement IS DISTINCT FROM NEW.id_paiement
                   OR OLD.id_charge IS DISTINCT FROM NEW.id_charge THEN
                    RAISE EXCEPTION 'Bank movement identity is immutable; void and replace it';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            DROP TRIGGER IF EXISTS trg_protect_payment_identity ON paiements;
            CREATE TRIGGER trg_protect_payment_identity BEFORE UPDATE ON paiements
            FOR EACH ROW EXECUTE FUNCTION protect_financial_identity();
            DROP TRIGGER IF EXISTS trg_protect_caisse_identity ON caisse;
            CREATE TRIGGER trg_protect_caisse_identity BEFORE UPDATE ON caisse
            FOR EACH ROW EXECUTE FUNCTION protect_financial_identity();
            DROP TRIGGER IF EXISTS trg_protect_bank_identity ON mouvements_bancaires;
            CREATE TRIGGER trg_protect_bank_identity BEFORE UPDATE ON mouvements_bancaires
            FOR EACH ROW EXECUTE FUNCTION protect_financial_identity();
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS app_authenticated_access ON public.corrections_financieres")
    op.execute("DROP POLICY IF EXISTS app_authenticated_read ON public.corrections_financieres")
    op.execute("DROP POLICY IF EXISTS app_runtime_access ON public.corrections_financieres")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.corrections_financieres FROM app_runtime;
                REVOKE USAGE, SELECT ON SEQUENCE public.corrections_financieres_id_correction_seq FROM app_runtime;
            END IF;
        END $$;
    """)
    op.execute("ALTER TABLE public.corrections_financieres DISABLE ROW LEVEL SECURITY")
    op.execute("DROP TRIGGER IF EXISTS trg_protect_bank_identity ON mouvements_bancaires")
    op.execute("DROP TRIGGER IF EXISTS trg_protect_caisse_identity ON caisse")
    op.execute("DROP TRIGGER IF EXISTS trg_protect_payment_identity ON paiements")
    op.execute("DROP TRIGGER IF EXISTS trg_no_delete_charge ON charges")
    op.execute("DROP TRIGGER IF EXISTS trg_no_delete_payment ON paiements")
    op.execute("DROP TRIGGER IF EXISTS trg_no_delete_bank_movement ON mouvements_bancaires")
    op.execute("DROP TRIGGER IF EXISTS trg_no_delete_caisse ON caisse")
    op.execute("DROP TRIGGER IF EXISTS trg_no_mutation_financial_correction ON corrections_financieres")
    op.execute("DROP TRIGGER IF EXISTS trg_no_delete_stock_movement ON mouvements_stock")
    op.execute("DROP FUNCTION IF EXISTS prevent_correction_mutation()")
    op.execute("DROP FUNCTION IF EXISTS prevent_stock_delete()")
    op.execute("DROP FUNCTION IF EXISTS protect_financial_identity()")
    op.execute("DROP FUNCTION IF EXISTS prevent_financial_delete()")
    op.drop_index("ix_corrections_financieres_date", table_name="corrections_financieres")
    op.drop_index("ix_corrections_financieres_id_entite", table_name="corrections_financieres")
    op.drop_index("ix_corrections_financieres_type_entite", table_name="corrections_financieres")
    op.drop_table("corrections_financieres")
    op.drop_column("paiements", "date_annulation")
    op.drop_column("charges", "date_annulation")
    op.drop_constraint("fk_bank_mouvement_inverse", "mouvements_bancaires", type_="foreignkey")
    op.drop_constraint("fk_caisse_mouvement_inverse", "caisse", type_="foreignkey")
    for table in ("mouvements_bancaires", "caisse"):
        op.drop_constraint(f"fk_{table}_annulation_user", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_inverse", table_name=table)
        op.drop_column(table, "id_mouvement_inverse")
        op.drop_column(table, "id_utilisateur_annulation")
        op.drop_column(table, "date_annulation")
        op.drop_column(table, "motif_annulation")
