## ADR 0003: Payment status calculation

Status: Accepted

Payment status is derived from the active transaction amount, active payment
amounts, due date, and cancellation state. The canonical statuses are `impaye`,
`partiel`, `paye`, and `en_retard`. Annulled payments never contribute to the
paid total, and an overdue status applies only while a positive balance remains
after the due date.

A cheque contributes only when its general payment status is `valide` and its
cheque status is `encaisse`. Creating or transitioning an encashed cheque
normalizes the general status before the cash movement is written, preventing
pending cheque records from affecting balances.

The backend owns this projection so list pages, summaries, reports, and exports
cannot diverge through independent frontend calculations.
