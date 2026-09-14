# Marwane — Manual Agent Test Plan

> Purpose: provide a repeatable UI, UX and business-flow checklist for manual browser-agent testing.
> Scope: current React frontend routes, shared shell, business workflows, responsive behavior, visual quality and resilience.
> Companion coverage: automated Playwright smoke/release tests remain the regression baseline; this document covers what an agent must inspect visually and interactively.

## 1. Test-run rules

- Run mutations only against disposable staging/test data. Never use production for create, edit, delete, payment, stock, LC or transformation tests.
- Capture the deployed commit/build identifier, browser, viewport, tester, date and environment before starting.
- Use a unique prefix for created records, for example MANUAL-20260914-2300. This makes cleanup and delta verification safe.
- Before changing financial or stock data, record the baseline values of cash, bank balances, stock, transaction counts and report month.
- A test is not passed merely because a page loads. Confirm the visible result, the related downstream page and the absence of runtime/API error banners.
- When a test is blocked by missing data or permissions, mark it Blocked and record the exact missing prerequisite. Do not silently skip it.
- For every failure, capture: route, exact action, visible result, expected result, screenshot, console error if available, network/API error if available and reproducibility.

## 2. Execution record

| Field | Value |
|---|---|
| Run ID |  |
| Environment / URL |  |
| Commit / deployment |  |
| Date and time |  |
| Tester / agent |  |
| Browser and version |  |
| Desktop viewport |  |
| Mobile viewport |  |
| Test account / role |  |
| Overall result | Pass / Fail / Blocked |

## 3. Required test data

Create or identify the following records using the unique run prefix:

| Fixture | Minimum data |
|---|---|
| Client | One active client with a recognizable name |
| Supplier | One active supplier with a recognizable name |
| Service product | Client-usable product/service for a simple sale |
| Raw material | Supplier-usable raw product with stock available |
| Finished product | Client-usable finished product for BOM testing |
| Bank account | One account with a known initial balance |
| Building | One active production building |
| Available LC | One active LC whose availability date has passed |
| Future LC | One active LC whose availability date is in the future, if the UI permits creation |
| Task | One pending task, one urgent task and one completed task |

Recommended financial fixture: create a sale of 100 MAD, record a 40 MAD partial payment, then record the remaining 60 MAD. Recommended BOM fixture: one finished product requiring two units of raw material per output unit, then execute three output units.

Record baseline values before the workflow:

- Cash balance.
- Every bank account balance.
- Available stock for the raw and finished products.
- Number of clients, suppliers, products, transactions, payments, expenses and transformations.
- Selected month and current report values.

## 4. Global acceptance rubric

| Area | Pass condition |
|---|---|
| Runtime stability | No uncaught page error, blank screen, broken component or unexplained server-error banner. |
| Navigation | Every visible menu item reaches the intended screen; browser back and in-app back preserve a sensible flow. |
| Visual hierarchy | Page title, primary action, secondary actions, filters and content are visually distinguishable. |
| Consistency | Currency, dates, statuses, chips, buttons, dialogs, spacing and typography follow the same visual language. |
| Feedback | Every mutation has visible loading, success or error feedback; stale data is refreshed after success. |
| Forms | Labels are clear, required fields are identifiable, validation is near the relevant field and invalid submission does not mutate data. |
| Destructive actions | Delete, deactivate, payment and irreversible operations require an understandable confirmation where appropriate. |
| Responsive UX | No horizontal overflow; tables become usable cards or scroll correctly; dialogs fit and remain operable on mobile. |
| Accessibility basics | Interactive controls have readable names, keyboard focus is visible, dialogs can be closed, and icon-only controls have accessible labels. |
| Data integrity | Totals, balances, payment status, stock and report values update consistently across related screens. |
| Empty and error states | Empty states explain what happened and provide a useful next action; errors explain recovery where possible. |

## 5. Test suites

### A. Authentication and application shell

#### MA-AUTH-01 — Successful login

1. Open the application root.
2. Confirm the root redirects to /login.
3. Submit valid credentials.
4. Confirm the URL becomes /dashboard.
5. Confirm the dashboard title, sidebar, user menu, alert icon and global search are visible.

Expected: login succeeds once, no duplicate submission occurs, no sensitive token is displayed, and the dashboard is usable.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-AUTH-02 — Invalid and incomplete login

1. Submit with both fields empty.
2. Submit with an invalid email format.
3. Submit with an incorrect password.
4. Correct the credentials and log in.

Expected: field-level validation is clear; failed authentication does not enter the workspace; the error is understandable and the form remains usable.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-SHELL-01 — Sidebar and route navigation

From the authenticated shell, open every visible navigation item and verify the destination title and primary content:

| Menu item | Route |
|---|---|
| Accueil quotidien | /dashboard |
| Calendrier | /calendar |
| Tâches | /tasks |
| Production & stock | /production |
| BOM & transformations | /production/boms |
| Transactions | /transactions |
| Créances clients | /creances |
| Dettes fournisseurs | /dettes |
| Clients | /clients |
| Fournisseurs | /fournisseurs |
| Produits | /produits |
| Dépenses | /charges |
| Lettres de crédit | /lettres-credit |
| Comptes bancaires | /comptes-bancaires |
| Caisse | /caisse |
| Rapport mensuel | /rapports/mensuel |

Also verify /production/dashboard, /transactions/:id, /clients/:id/profile, /fournisseurs/:id/profile, /produits/:id, /lettres-credit/:id and /production/batiment/:id using valid IDs.

Expected: no route redirects unexpectedly to login, no duplicate page title appears, and the active navigation state is understandable.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-SHELL-02 — Global search, alerts and account menu

1. Search for the run client and product using the global search.
2. Select each result and confirm it opens the correct destination.
3. Open the alert center and confirm unread alerts, empty state and mark-as-read behavior.
4. Open the account menu and log out.
5. Confirm logout returns to /login and protected routes are no longer accessible.

Expected: search results are relevant, alert count updates after marking an alert read, menus close cleanly, and logout clears the authenticated workspace.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-SHELL-03 — Responsive shell

Test at desktop, tablet and mobile widths. On mobile, open and close the drawer, navigate to a page, reopen it and confirm it closes after navigation. On desktop, collapse and expand the sidebar.

Expected: content width adjusts without overlap, menu labels remain understandable, no horizontal overflow appears and the main page never becomes trapped behind the drawer.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### B. Route smoke and daily operations

#### MA-ROUTE-01 — All routed screens render

Visit each route below directly after authentication. For each route verify: page title, primary content, loading completion, no blank state caused by a runtime error, no unexpected server-error banner and usable mobile rendering.

| Route | Expected primary surface |
|---|---|
| /dashboard | Daily dashboard and KPI cards |
| /calendar | Calendar or mobile agenda |
| /tasks | Task dashboard and filters |
| /transactions | Transaction register |
| /creances | Receivables ledger |
| /dettes | Payables ledger |
| /clients | Client list |
| /fournisseurs | Supplier list |
| /produits | Product list |
| /caisse | Cash balance and movements |
| /charges | Expense register |
| /comptes-bancaires | Bank accounts and movements |
| /lettres-credit | LC register |
| /production | Production and stock overview |
| /production/boms | BOM and transformation workspace |
| /rapports/mensuel | Monthly report |

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-DASH-01 — Dashboard accuracy and actionability

1. Compare cash and monthly transaction KPIs with Caisse, Transactions, Créances and Dettes.
2. Check production totals against Production & stock.
3. Open each dashboard alert or quick action.
4. Open a recent transaction from the dashboard if available.

Expected: dashboard values have clear labels and units, linked actions reach the expected screen, and values do not contradict their source pages.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### C. Tasks and calendar

#### MA-TASK-01 — Task lifecycle

1. Create a task with title, description, start/end dates, category, medium priority and pending status.
2. Edit the task and change its priority and status.
3. Filter by Today, Pending, Urgent and Completed.
4. Delete the test task and confirm the deletion behavior.

Expected: the task appears in the correct sections and counts, the modal resets correctly for a new task, dates are readable in French format and deletion refreshes the list.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-CAL-01 — Calendar interaction

1. Create a task by selecting a date.
2. Open it from the calendar event.
3. Move it to another date using drag and drop.
4. Navigate previous, today and next.
5. Verify the same task in the Tasks page.

Expected: calendar and task list stay synchronized; event text is readable; date changes do not duplicate or lose the task.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### D. Clients, suppliers and products

#### MA-MASTER-01 — Client CRUD and profile

1. Create a uniquely named client.
2. Search for the client and verify the result count.
3. Edit the client name.
4. Open the client profile.
5. Check Summary, Transactions, Eggs purchased and Analysis tabs.
6. Create a transaction from the client profile.
7. Export the client history.

Expected: the edited name is consistent everywhere; profile tabs do not show broken charts or empty technical errors; the contextual transaction opens with the client preselected; export completes with the expected filename or download.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-MASTER-02 — Supplier CRUD and profile

Repeat the client flow for a supplier. Verify Summary, Transactions, Products purchased and Analysis tabs, supplier-specific balance language, contextual transaction creation and history export.

Expected: supplier pages never display client-only wording or incorrect positive/negative balance semantics.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-MASTER-03 — Product types, detail and lifecycle

1. Create or identify a raw material, finished product and service.
2. Filter the product list by type and search term.
3. Open each product detail.
4. Verify purchase quantity, last purchase and supplier information where data exists.
5. Edit one product.
6. Deactivate it, confirm the action, then reactivate it.

Expected: type labels are clear, inactive state is visually obvious, inactive records cannot be used where business rules disallow them, and reactivation restores the expected actions.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### E. Transactions and payments

#### MA-TX-01 — Create a simple sale

1. Open New transaction.
2. Select Client, the service product, quantity 1 and price 100 MAD.
3. Leave immediate payment disabled.
4. Save.
5. Verify the transaction in the register, client profile, receivables ledger and dashboard.

Expected: exactly one transaction is created, the amount is correct, the client is linked, the payment status is unpaid or due as expected, and all downstream screens refresh.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-TX-02 — Create a purchase and an inline payment

1. Create a supplier purchase using the raw material.
2. Add an immediate cash payment for part or all of the amount.
3. Save.
4. Verify the supplier ledger, transaction detail, payment history and cash movement.

Expected: transaction direction is shown as a purchase, payment amount is not double-counted, and cash decreases only once.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-TX-03 — Multi-line transaction and payment modes

1. Create a transaction with at least two product lines.
2. Add multiple payments using cash and another available mode.
3. For cheque, verify cheque number, bank, expected encashment date and cheque status fields.
4. For transfer, verify transfer reference.
5. For LC, verify only eligible LC records are selectable.

Expected: line totals and payment totals are visible, validation prevents incomplete references where required, and the resulting batch does not create duplicate or orphan records.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-TX-04 — Register filters, edit, soft delete, reactivate and exports

1. Use quick filters for all, sales, purchases and unpaid.
2. Use advanced filters and remove them through filter chips.
3. Open a transaction, edit it and verify refreshed values.
4. Soft-delete it and confirm it leaves the active register.
5. Reactivate it and confirm it returns.
6. Export the filtered register to Excel and PDF.

Expected: filter counts and rows agree; deleted records are not permanently removed unexpectedly; inactive records have a clear visual state; exports represent the visible filtered dataset.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-PAY-01 — Transaction payment lifecycle

1. Open the transaction detail.
2. Add a 40 MAD payment to the 100 MAD sale.
3. Verify partial status, paid amount, remaining amount and progress indicator.
4. Add the remaining 60 MAD.
5. Verify paid status and zero remaining amount.
6. Edit one payment and verify totals recalculate.
7. Delete one payment and confirm the status rolls back.

Expected: payment history, badges, progress and ledger values remain consistent after every mutation; overpayment is blocked or explicitly handled.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### F. Receivables, payables, cash, expenses and banking

#### MA-FIN-01 — Receivables and payables ledgers

1. Open /creances and /dettes.
2. Search by party and filter by payment status.
3. Filter by due-date range and overdue-only.
4. Change sort field and order.
5. Open a client or supplier from a ledger row.
6. Add a payment from the ledger.

Expected: summary cards update, overdue records are visibly distinct, disabled payment actions make sense for zero remaining balance, and party navigation opens the correct profile.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-FIN-02 — Expense allocation

1. Create an expense paid from cash.
2. Verify it appears in Charges and as a cash exit in Caisse.
3. Create an expense paid from a bank account.
4. Verify the bank balance and movement register decrease exactly once.
5. Edit the expense and verify downstream values update.
6. Delete the expense and confirm the associated cash/bank movement is handled according to the displayed confirmation.
7. Export filtered expenses.

Expected: payment source is explicit, totals use MAD formatting, deletion consequences are understandable and no orphan movement remains.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-FIN-03 — Bank accounts and movements

1. Create a bank account with a known initial balance.
2. Add an entry and an exit movement.
3. Test available movement source types, including LC if eligible.
4. Filter movements by account and search text.
5. Compare account-card balances with the movement list and Caisse where applicable.
6. Export the movement list.

Expected: balances and movement signs are correct, account identity is clear, and the movement dialog does not retain stale values between openings.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-FIN-04 — Cash register

1. Open Caisse and record the balance.
2. Filter by period, movement type and search term.
3. Verify entries and exits use distinct visual treatment.
4. Inspect the receivable/payable watch section.
5. Export Excel and PDF.
6. Compare the resulting balance with source transactions, payments, charges and bank/LC flows.

Expected: balance is prominent, movements are understandable on desktop and mobile, exports are enabled only when data exists, and no currency sign or number is ambiguous.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### G. Letters of credit

#### MA-LC-01 — LC creation and availability states

1. Create an LC linked to a client with issue date, availability date, amount, bank and notes.
2. Verify it appears under Available or All.
3. For a future availability date, confirm the status explains when it becomes usable and action buttons are disabled or safely guarded.
4. Search and filter Available, Used and All.
5. Open the LC detail.

Expected: dates and amounts are clear, status wording is understandable, and an unavailable LC cannot be used accidentally.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-LC-02 — LC banking and supplier payment

1. From an eligible LC, choose Deposit into bank and select a bank account.
2. Verify LC status, bank movement and balance.
3. From another eligible LC, choose Pay supplier and select a supplier.
4. Verify the corresponding transaction/payment state.
5. Export the LC register.

Expected: each LC is consumed once, no duplicate bank deposit or supplier payment is created by repeated clicks, and the LC detail reflects the final state.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### H. Production, stock and BOM transformations

#### MA-PROD-01 — Daily production overview

1. Open /production.
2. Change the selected day.
3. Verify building completion, produced eggs, available eggs, sold eggs and losses.
4. Open a building detail.
5. Add a production entry with date, building, egg type, quantity, average weight, losses, mortality, feed and formula where applicable.
6. Return to the overview.

Expected: the overview and building detail agree; missing entries are clearly marked; status colors have a clear meaning; saving shows feedback and refreshes the day.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-PROD-02 — Building history and stock impact

1. Open /production/batiment/:id.
2. Verify selected-day facts and movement list.
3. Edit a production entry and verify recalculated totals.
4. Delete the test entry and confirm the confirmation/feedback.
5. Create a sale of eggs selecting the correct source building.
6. Verify available stock decreases from that building and the movement is visible.

Expected: stock is attributed to the selected building, not an arbitrary building; history, movement direction and quantities remain consistent.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-BOM-01 — BOM creation and preview

1. Open /production/boms.
2. Create a BOM for the finished product using the raw material.
3. Add and remove material lines.
4. Preview requirements for a valid quantity.
5. Preview a quantity that exceeds stock.

Expected: required quantities and estimated cost are understandable; insufficient stock is a warning before execution; invalid or empty material lines cannot be saved.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-BOM-02 — Transformation execution and reversal

1. Execute a valid transformation for three output units.
2. Verify raw stock decreases by the required quantity.
3. Verify finished-product stock increases by three.
4. Verify the transformation appears in recent history.
5. Reverse it.
6. Verify stock and history return to the expected state.

Expected: execution is atomic from the user perspective, repeated clicks do not duplicate the transformation, costs are displayed, and reversal is explicit and safe.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### I. Monthly reporting and exports

#### MA-REPORT-01 — Monthly report reconciliation

1. Select the month used by the test fixtures.
2. Compare sales, purchases, expenses, receivables, debts, cash, bank and stock metrics with their source pages.
3. Change the month and confirm the report reloads.
4. Export Excel and PDF.

Expected: the report clearly identifies the selected month, all totals have units, zero values are not confused with missing data, and exports match the displayed summary.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### J. Visual quality and UX inspection

Run this inspection on every routed screen, especially dense pages: Transactions, Caisse, Bank accounts, BOMs, Reports and both profile pages.

| Check | Pass condition | Result |
|---|---|---|
| Page hierarchy | Title, subtitle, primary action and content are immediately identifiable. | ☐ |
| Primary action | The main action is visually dominant and has a useful label. | ☐ |
| Secondary actions | Export, refresh, edit and delete do not compete with the primary action. | ☐ |
| Tables and cards | Dense data remains scannable; columns do not overlap or truncate critical values. | ☐ |
| Empty states | Empty pages explain the state and offer the next useful action. | ☐ |
| Dialogs | Dialogs fit the viewport, have clear title/actions and do not lose entered data unexpectedly. | ☐ |
| Loading states | Loading is visible without unnecessary layout jump or frozen controls. | ☐ |
| Toasts | Success/error feedback is readable, non-blocking and disappears or can be dismissed. | ☐ |
| Currency and dates | MAD values, signs, decimals and French dates are consistent. | ☐ |
| Status meaning | Colors are supported by readable text or badges, not color alone. | ☐ |
| Mobile | No horizontal overflow; cards, filters and actions remain usable. | ☐ |
| Keyboard | Tab order is logical and focus is visible; dialogs can be operated without a mouse. | ☐ |
| Touch targets | Mobile icon buttons and row actions are easy to tap without accidental adjacent actions. | ☐ |

Viewport checklist:

- Desktop: 1440x900 and 1280x800.
- Tablet: approximately 768x1024.
- Mobile: approximately 390x844 and 375x667.
- Check both empty and populated states at each breakpoint.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

### K. Error, resilience and recovery

#### MA-ERR-01 — API failure and retry

With a disposable staging environment or controlled network failure:

1. Load a page with a failed API request.
2. Verify the page shows a useful error state rather than a blank screen.
3. Restore connectivity and use Retry or Refresh.
4. Repeat with a mutation failure.

Expected: the user knows what failed, retry is available where appropriate, failed mutations do not appear as successful, and controls recover after the request ends.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-ERR-02 — Empty, invalid and boundary data

Test at least one empty list, zero balance, zero movements, no available LC, missing optional date, maximum reasonable amount, partial payment, exact full payment, insufficient stock and inactive record.

Expected: no NaN, undefined, broken date, misleading negative value, clipped label or impossible action is shown.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

#### MA-ERR-03 — Error boundary recovery

Trigger a known frontend component error in a safe test build if possible. Verify the friendly error page, reload action, home action, reset action, optional details and error-report action.

Expected: the entire application does not remain unusable after a component failure and technical details are not exposed unnecessarily in production mode.

Result: ☐ Pass  ☐ Fail  ☐ Blocked   Evidence: ____________________

## 6. Current frontend coverage gaps to track

These components exist in the repository but are not currently exposed through a normal route in App.jsx:

| Component | Current status | Required decision |
|---|---|---|
| ProductionList.jsx | Standalone production table CRUD | Confirm whether it is legacy or should become a route. |
| LCFormPage.jsx | Standalone LC create/edit form | Confirm whether the modal is now the only supported entry point. |
| CessionLCForm.jsx | LC transfer to client/supplier | Confirm whether cession is intentionally hidden or still required. |
| AdminProtectedRoute.jsx | Admin-only route guard | Confirm whether an audit/admin frontend is planned or obsolete. |
| /audit reference in old comments | No active App.jsx route | Remove stale documentation or implement the route. |

Do not mark the application feature-complete until each row is classified as one of: supported and tested, intentionally hidden, deprecated and removable, or still required.

## 7. Cleanup and final report

After mutation testing:

1. Delete or deactivate only records created with the unique run prefix.
2. Reverse test transformations and remove test payments where the environment permits safe cleanup.
3. Confirm cash, bank, stock, LC and report values return to their recorded baseline.
4. Log out.
5. Re-run the route smoke check if cleanup touched shared data.

Final report:

| Metric | Value |
|---|---|
| Scenarios passed |  |
| Scenarios failed |  |
| Scenarios blocked |  |
| Critical defects |  |
| High defects |  |
| Medium / low defects |  |
| Visual UX issues |  |
| Data-integrity issues |  |
| Orphaned-feature decisions completed |  |

Overall verdict: ☐ Release candidate  ☐ Needs fixes  ☐ Blocked

## 8. Defect template

### [Severity] [Test ID] Short title

- Environment / commit:
- Route:
- Preconditions and test data:
- Steps to reproduce:
- Expected result:
- Actual result:
- Frequency:
- Screenshot or recording:
- Console/network evidence:
- Business impact:
- Suggested next action: