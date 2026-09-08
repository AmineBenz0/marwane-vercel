## ADR 0002: Inventory boundaries

Status: Accepted

The general inventory ledger covers purchases, sales, transformations, losses,
manual adjustments, and reversals. Existing egg-production stock calculations
remain an explicit compatibility boundary and are not silently merged into the
general ledger. A future unification must start with a reconciled migration and
an explicit product decision.

This preserves historical production reporting while preventing two competing
stock authorities from being mixed in the same calculation.
