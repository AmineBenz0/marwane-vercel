## ADR 0003: Payment status calculation

Status: Accepted

Payment status is derived from the active transaction amount, active payment
amounts, due date, and cancellation state. The canonical statuses are `impaye`,
`partiel`, `paye`, and `en_retard`. Annulled payments never contribute to the
paid total, and an overdue status applies only while a positive balance remains
after the due date.

The backend owns this projection so list pages, summaries, reports, and exports
cannot diverge through independent frontend calculations.
