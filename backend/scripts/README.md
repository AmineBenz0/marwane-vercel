# Administration scripts

All scripts are read-only by default. Run them against a staging clone first
and attach the JSON output to the release record.

## Integrity and security

```powershell
python backend/scripts/check_integrity.py
python backend/scripts/check_database_security.py
```

The integrity check never repairs data automatically. Database security
inspection reports the target's tables, grants, roles, and RLS policy coverage.
The integrity output also reports orphaned payment/movement links, movement
amount or direction drift, invalid dates, negative stock, invalid product
types, and low-severity product-type/legacy-flag combinations that require
business review. A low-severity flag is intentionally never auto-corrected;
the compatibility flags retain their historical meaning until an operator
confirms the appropriate change.

## Historical stock backfill

Preview the deterministic, weighted-cost plan without writing anything:

```powershell
python backend/scripts/backfill_inventory.py
```

The command fails closed when historical sales cannot be explained by prior
purchases. Resolve opening-stock evidence and rerun the dry run before applying.
Apply only after staging review and a backup:

```powershell
python backend/scripts/backfill_inventory.py --apply --confirm
```

Production requires an additional explicit `--allow-production` flag. Every
movement is idempotent, dated from the source transaction, and tagged as
`legacy_backfill` so it remains auditable and reconcilable.
