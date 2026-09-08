# End-to-End User Workflow Tests

This file is the practical QA checklist for the app. It focuses on what a non-technical farm user will actually do, and what must be true after each action.

## How To Use

- Run the app with backend and frontend started.
- Login with the dedicated staging credentials supplied through `E2E_EMAIL` and
  `E2E_PASSWORD`; credentials are never stored in the repository.
- Use clearly named test data, for example `E2E Client 2026-05-27`.
- For finance/LC checks, you can also run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\e2e-critical-business-flow.ps1
```

The script creates visible test data prefixed with `E2E`, so it is easy to recognize later.

## Smoke Test: App Is Reachable

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-00 | User opens the app | Open `http://localhost:5173/login` | Login page loads without console API errors. |
| E2E-01 | User logs in | Enter admin credentials and submit | User lands on `Accueil quotidien`; sidebar is visible; no "Impossible de contacter le serveur" message. |
| E2E-02 | Main pages load | Open Dashboard, Calendrier, Taches, Production, Transactions, Clients, Fournisseurs, Produits, Depenses, LC, Comptes bancaires, Caisse | Every page loads and its main list/card content appears. |

## Accueil Quotidien

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-10 | User sees today's work quickly | Open `Accueil quotidien` | Quick actions are visible first; no redundant top card; batiment cards are simple and not overloaded. |
| E2E-11 | User starts production from dashboard | Click `Saisir` on a batiment card | User is taken to the related batiment daily entry flow. |
| E2E-12 | User checks current lot | Look at the lot summary on dashboard/production | Lot name is visible as `Lot date`; no redundant `Commun` label. |

## Calendar And Tasks

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-20 | User sees monthly calendar | Open `Calendrier` | Calendar grid adapts to screen width; tasks are represented minimally, not as long overflowing lists. |
| E2E-21 | User creates a task | Open `Taches`, create a task with title, date, priority | Task appears in the tasks list and on the calendar for the selected date. |
| E2E-22 | User completes a task | Change task status to complete | Task status changes and remains after refresh. |
| E2E-23 | User filters tasks | Use date/status/priority filters | List updates without horizontal scrolling of filters on normal desktop/tablet widths. |

## Production And Stock Overview

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-30 | User sees production overview | Open `Production & stock` | Page acts as overview/redirector, not a duplicate of each batiment detail page. |
| E2E-31 | User starts a lot once | From Production overview, create a lot with `Lot date` and incoming chickens per batiment | A lot is created for each batiment with the entered chicken count; counts are not split automatically unless user entered that. |
| E2E-32 | User sees batiment cards side-by-side | Open Production on desktop | Batiment cards sit next to each other where space allows; mobile stacks them cleanly. |
| E2E-33 | User opens a batiment | Click `Voir le batiment` | User lands on `/production/batiment/:id` with the selected batiment details. |

## Batiment Daily Production

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-40 | User enters daily production | On a batiment page, use the daily entry action | User can enter production, declared losses, mortality, feed consumption, average weight, and save in one daily flow. |
| E2E-41 | Calibre is automatic | Enter average weight for normal eggs | Calibre is deducted from configurable thresholds; user does not manually choose calibre. |
| E2E-42 | Losses affect stock only | Declare `perdu` eggs | Stock decreases/does not increase incorrectly; performance production excludes lost eggs. |
| E2E-43 | Mortality affects remaining hens | Enter mortality for the day | Remaining hens decreases for that batiment and ratios use the updated effectif. |
| E2E-44 | Performance table is readable | Open `Suivi performance type Excel` | Table groups by week with total/average rows and is horizontally usable on mobile. |
| E2E-45 | Export performance | Export Excel/PDF for selected lot | Exported rows match the visible table. |

## Transactions

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-50 | User records a client sale | Create a client transaction with product, batiment, quantity, price, payment info | Transaction appears in the Excel-like transaction table; client profile shows it; caisse changes if paid by cash/available LC rules apply. |
| E2E-51 | User records supplier purchase | Create a supplier transaction with product, quantity, price, payment info | Transaction appears in the table; fournisseur profile shows it; unpaid amount appears as supplier balance. |
| E2E-52 | User sees payment type and reference | Create payments by cash, cheque, virement, LC | Transaction table shows payment type and relevant reference/value without overcrowding. |
| E2E-53 | User uses row actions | Open the three-dot menu | View, edit, delete are inside the menu; no visible `Action` column label. |
| E2E-54 | User filters transactions | Use date, client/fournisseur/product/type filters | Table updates and keeps important columns visible, including batiment. |

## Clients And Fournisseurs

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-60 | User creates a client | Add a client from Clients page | Card/list appears without redundant logo, `Client` label, or creation date noise. |
| E2E-61 | User opens client profile | Open client details | Balance table, history, and transactions are visible; table uses `Quantite` and `Prix`. |
| E2E-62 | Client history direction is simple | Open client history | Only client-side `Entrees` are shown where appropriate, not both entries and exits. |
| E2E-63 | User creates fournisseur | Add fournisseur from Fournisseurs page | Card/list appears with same simplified layout as clients. |
| E2E-64 | User opens fournisseur profile | Open fournisseur details | Balance table and transaction table match client profile style; only supplier-side `Sorties` are shown where appropriate. |

## Produits

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-70 | User creates a product | Add product and mark client/supplier usage | Product appears with clear type/usage, not overloaded metrics. |
| E2E-71 | Product has many suppliers | Record purchases of same product from multiple fournisseurs | Product detail shows supplier-specific history/prices without duplicating the product itself. |
| E2E-72 | Product appears in right forms | Open client sale and supplier purchase forms | Product appears only where its usage allows it. |

## Depenses

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-80 | User records an expense | Add expense with label, amount, date, category | Expense appears in Depenses list and summary totals update. |
| E2E-81 | Expense linked to bank | Add expense with a bank account if supported in form | Bank balance/movement reflects the outgoing amount. |
| E2E-82 | User filters expenses | Filter by category/date | Table/list updates cleanly without duplicate financial information already shown elsewhere. |

## Lettres De Credit

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-90 | User creates LC from client | Create LC with reference, client, amount, availability date | LC appears as available when date is reached; amount is visible. |
| E2E-91 | Available LC counts in Caisse | Open Caisse after creating available LC | Total available includes cash + available LC. |
| E2E-92 | User deposits LC to bank | Use `Verser banque` on available LC | LC becomes used; Caisse no longer counts it; selected bank balance increases; bank movement has LC reference. |
| E2E-93 | User pays supplier with LC | Use `Payer fournisseur` on available LC | LC becomes used; Caisse no longer counts it; LC history/cession exists for supplier. |
| E2E-94 | Used LC cannot be reused | Try to use the same LC again | App blocks the action with a clear error. |

## Comptes Bancaires

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-100 | User creates bank account | Add account with initial balance | Account appears and total bank balance updates. |
| E2E-101 | User records bank entry | Add bank movement entry | Account balance increases and movement appears in history. |
| E2E-102 | User records bank exit | Add bank movement exit | Account balance decreases and movement appears in history. |
| E2E-103 | LC deposit appears in bank | Deposit LC to bank | Movement source/reference clearly identifies LC. |

## Caisse

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-110 | User sees total available | Open Caisse | Main card shows total available clearly with readable amount color. |
| E2E-111 | User understands split | Compare cash and LC cards | Cash and available LC are separate; total equals cash + LC available. |
| E2E-112 | User checks movements | Open Caisse movements table | Only caisse-relevant movements are shown; detailed product/client info remains in Transactions. |
| E2E-113 | User exports caisse | Export Excel/PDF | Export matches visible filtered movements. |

## Responsive UX Tests

| ID | User situation | Steps | Expected result |
| --- | --- | --- | --- |
| E2E-120 | Desktop 1440px | Check all key pages | Cards align horizontally where useful; no giant wasted whitespace; tables keep actions visible. |
| E2E-121 | Tablet 768px | Check all key pages | Cards wrap predictably; filters do not force awkward horizontal scrolling. |
| E2E-122 | Phone 390px | Check all key pages | Important actions are visible first; tables scroll horizontally only when unavoidable; no text escapes cards. |
| E2E-123 | Long data edge cases | Use long client/product/reference names | Text truncates or wraps cleanly; buttons remain clickable. |

## Critical Automated Checks Already Covered By Script

The script `scripts/e2e-critical-business-flow.ps1` covers:

- Login API works.
- LC created from client becomes available.
- Available LC is counted in Caisse.
- LC deposited to bank becomes used.
- Deposited LC is removed from Caisse available total.
- Bank balance increases after LC deposit.
- Bank movement is created with LC reference.
- LC used to pay supplier becomes used.
- Supplier LC payment creates cession/history.
- Main CORS header is present for frontend origin.

The Playwright suite also contains a staging-only browser-to-API release flow
in `frontend/tests-e2e/release-business-flows.spec.ts`. It creates unique
client, supplier, product, payment, charge, BOM, and transformation records,
then verifies the receivables, payables, production, and reporting screens.
It runs only when `E2E_MUTATION_TESTS=true` is explicitly configured against a
disposable staging target, because it intentionally creates auditable business
data. The same suite checks horizontal overflow on desktop and mobile projects.

