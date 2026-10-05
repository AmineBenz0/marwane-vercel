from sqlalchemy import Column, ForeignKey, Index, Integer, MetaData, Table, create_engine

from app.services.database_schema import schema_issues


def lc_metadata(*, version=True, reversal=True, integrity=True):
    metadata = MetaData()
    columns = [Column("id_lc", Integer, primary_key=True)]
    if version:
        columns.append(Column("version_utilisation", Integer, nullable=False))
    Table("lettres_credit", metadata, *columns)
    columns = [Column("id_cession", Integer, primary_key=True)]
    if reversal:
        columns.append(Column(
            "id_cession_origine", Integer,
            *([ForeignKey("cessions_lc.id_cession")] if integrity else []),
        ))
    cessions = Table("cessions_lc", metadata, *columns)
    if reversal and integrity:
        Index("uq_cessions_lc_one_reversal", cessions.c.id_cession_origine, unique=True)
    return metadata


def test_missing_lc_columns_block_the_release():
    engine = create_engine("sqlite://")
    lc_metadata(version=False, reversal=False).create_all(engine)
    with engine.connect() as connection:
        assert schema_issues(connection, lc_metadata()) == [
            "Missing column: cessions_lc.id_cession_origine",
            "Missing column: lettres_credit.version_utilisation",
        ]


def test_columns_alone_do_not_hide_missing_reversal_integrity():
    engine = create_engine("sqlite://")
    lc_metadata(integrity=False).create_all(engine)
    with engine.connect() as connection:
        assert schema_issues(connection, lc_metadata()) == [
            "Missing unique reversal index: cessions_lc.id_cession_origine",
            "Missing reversal foreign key: cessions_lc.id_cession_origine",
        ]


def test_compatible_schema_allows_retained_audit_columns():
    engine = create_engine("sqlite://")
    actual = lc_metadata()
    actual.tables["cessions_lc"].append_column(Column("legacy_audit_id", Integer))
    actual.create_all(engine)
    with engine.connect() as connection:
        assert schema_issues(connection, lc_metadata()) == []


def test_every_current_model_is_checked(db_session):
    from app.database import Base

    assert schema_issues(db_session.connection(), Base.metadata) == []
