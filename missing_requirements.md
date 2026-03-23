# Gap Analysis: Client Requirements vs. Implementation

This document lists the status of the requirements provided. While most core features are implemented, some specific UI flexibilities and advanced business logic are still missing.

## 🔴 Missing Implementation

### 1. Advanced Expense Allocation (Frais)
*   **Requirement**: User should choose if a charge impacts **Caisse** (Cash) or **Compte Bancaire** (Bank Account).
*   **Status**: Currently, the `Charges` router/model is hard-coded to create movements only in the `Caisse` table. There is no field to select a bank account or logic to update the bank balance.

### 2. Product Composition (BOM)
*   **Requirement**: "Plusieurs matieres premieres peuvent créer un produit".
*   **Status**: No model or logic exists for product transformation or composition. The system currently treats all items as independent products.
*   **Missing**: A `Composition` or `BOM` (Bill of Materials) model to link multiple raw materials to a single finished product.

## ⚠️ Partially Implemented / UI Limitations

### 1. Multiple Payments per Transaction (UI Only)
*   **Requirement**: Add multiple LCs and other payment types in the same transaction.
*   **Status**: The **Backend is ready** (1 Transaction to N Payments), but the **`TransactionForm` UI** only allows one payment to be configured during creation.
*   **Missing**: A dynamic "Add Payment" section within the Transaction modal to allow multiple payment lines (e.g., 2 LCs + 1 Cash).

### 2. Product vs. Raw Material Distinction
*   **Requirement**: Distinction entre produit et matiere premiere.
*   **Status**: Currently relies on `pour_clients` and `pour_fournisseurs` boolean flags.
*   **Suggestion**: Replace or supplement with an explicit `type_produit` Enum ('produit_fini', 'matiere_premiere') for better reporting.

### 3. Fournisseur Balance Evolution
*   **Requirement**: Adjust evolution d'achat in fournisseur instead show balance.
*   **Status**: The profile contains a chart showing cumulative balance, but it might not be the primary view the user expects.
*   **Note**: The client might want the "Solde" to be the main KPI instead of "Total Achats".

---

## ✅ Fully Implemented

| Category | Requirement | Implementation Detail |
| :--- | :--- | :--- |
| **Lettre de Crédit** | Ajouter : Num de serie | Implemented as `numero_reference`. |
| | update caisse when added | `Paiement` of type `lc` impacts `Caisse` immediately. |
| | Type détenteur: always client | Field hidden from UI & hardcoded to 'client' in Backend. |
| | Banque emetrice optionnelle | Nullable in both Model and Schema. |
| | Remove date d'expiration | Removed from database, schemas, and forms. |
| | Fix not showing in modals | `LcPaymentSelector` added to `TransactionForm`. |
| **Production** | Partic production (3 batiments) | `Batiment` and `Production` models fully operational. |
| | Œufs/jour + Grammage | Fields `nombre_oeufs` and `grammage` implemented. |
| | Calibres (3 types) | Supported: demmarage, moyen, gros. |
| | Œuf types (5 types) | Supported: normal, double_jaune, cassé, blanc, perdu. |
| | Carton Calc (10+1) | Logic implemented: `nb_pleins + math.ceil(nb_pleins / 10)`. |
| | Carton Calc (Double Jaune) | Logic implemented: `(nb_pleins * 2) + 1`. |
| **Financials** | Compte Bancaire section | Full CRUD for Bank Accounts and simple balance tracking. |
| **Transactions** | Overpayment allowance | Logic explicitly allows payments exceeding total transaction value. |
