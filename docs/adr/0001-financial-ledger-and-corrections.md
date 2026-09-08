# ADR 0001 — Financial ledger and corrections

Status: accepted

The `corrections_financieres` journal is append-only and records the entity,
action, actor, timestamp, reason, original movement, replacement/inverse
movement, and structured details. Payment financial identity and movement
identity are immutable at both the API and PostgreSQL trigger boundary.

Payments, cash movements, bank movements, charges, and stock movements are
historical records. Corrections use status changes plus reversal records, with
the acting user, timestamp, and reason retained. Physical deletion is not
allowed once a record has financial impact.

Idempotency keys are treated as immutable financial identities. Stock source
movements also have a database-enforced active-source uniqueness boundary, so
concurrent retries cannot create duplicate inventory impact.
