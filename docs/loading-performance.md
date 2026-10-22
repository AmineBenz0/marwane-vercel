# Page-loading performance

The Python API is explicitly deployed to Paris (`cdg1`), near the Supabase
database and transaction pooler (`eu-west-3`). Keep SQLAlchemy `NullPool` with
the transaction pooler; measure before changing connection strategy.

## Diagnostics

Each API request log includes the actual `VERCEL_REGION`, application duration,
database connection acquisition duration, SQL round-trip duration and query count.
`Server-Timing` exposes `app`, `db_acquire`, and `sql` durations; `X-App-Region`
identifies the function region. No SQL text, parameters or credentials are added.

`app` is the application processing interval up to response headers, including
dependencies and serialization. It excludes CDN/client transit, cold-start work
before middleware and response streaming/cleanup. `db_acquire` includes pool
checkout, connection setup and first-connection initialization. SQL timing is
around cursor execution, including its network round trip, rather than the
database-only execution time shown by `pg_stat_statements`. Remaining app time
also includes row fetching, business logic and serialization; it is not a pure
serialization measurement.

Compare repeated warm `/api/v1/health/ready` requests separately from the first
invocation, using the same deployment and database. `/api/v1/health/live` has no
database dependency. Confirm `X-App-Region: cdg1` before comparing regions.

## Reference data

Only opted-in clients, suppliers, products and buildings lists are cached in
browser memory, for 60 seconds. Concurrent identical reads share one request;
each consumer receives an independent copy. Successful writes invalidate the
cache, including in other open tabs. Logout/session changes invalidate it too.
In-flight results cannot repopulate invalidated entries. Stock, transaction,
balance and ordinary contact-page requests are not cached. A reload also starts
with an empty cache.

## Transaction reads

The list query joins scalar production/building sources and batch-loads payments
with their LC references. Regression tests compare small and larger result sets
while checking payment totals, production dates and references. Pagination and
dashboard aggregation remain separate follow-up work.
