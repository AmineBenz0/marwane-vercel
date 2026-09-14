# Technical Suggestions for Missing Requirements

This document provides architectural and implementation guidance for the remaining features, following the project's current logic (FastAPI + SQLAlchemy + React).

---

## 🏛️ 1. Flexible Expense Allocation (Caisse vs. Bank)
**Requirement**: Allow users to allocate "Frais" (Charges) to either Cash or a specific Bank Account.

### Backend Suggestions
1.  **Model Updates**:
    *   **File**: `backend/app/models/charge.py`  
        Add `id_compte = Column(Integer, ForeignKey("comptes_bancaires.id_compte"), nullable=True)` to link a charge to a bank account.
    *   **File**: `backend/app/models/compte_bancaire.py`  
        Add `id_charge = Column(Integer, ForeignKey("charges.id_charge"), nullable=True)` to `MouvementBancaire` to maintain traceability.
2.  **Logic Update (`charges.py` router)**:
    *   Modify `create_charge` and `update_charge` to check if `id_compte` is provided.
    *   If `id_compte` is set: Create/Update `MouvementBancaire` and update the bank's `solde_actuel`.
    *   If `id_compte` is null: Create/Update `Caisse` entry (current behavior).

### Frontend Suggestions
*   Update the "Nouvelle Charge" form to include a "Mode de Paiement" field.
*   If "Banque" is selected, display a dropdown list of available `comptes_bancaires` (using an existing service call).

---

## 📦 2. Product Composition & Transformation (BOM)
**Requirement**: "Plusieurs matieres premieres peuvent créer un produit" (Production/Assembly).

### Backend Suggestions
1.  **New Models**:
    *   `Transformation`: `(id, date, notes, id_utilisateur)`.
    *   `TransformationLigne`: `(id_transformation, id_produit, quantite, type_ligne)` Where `type_ligne` is 'Input' (Raw Material) or 'Output' (Finished Good).
2.  **Business Logic**:
    *   When a `Transformation` is saved, it validates that all inputs and outputs exist.
    *   This provides a history of how many Raw Materials were consumed to produce X amount of Finished Goods.

### Frontend Suggestions
*   Add a new "Transformations" or "Production" page (distinct from Egg Production).
*   Create a form where users select "Ingredients" (inputs) and "Results" (outputs).

---

## 💳 3. Multi-Payment Transaction UI
**Requirement**: Allow multiple LCs and other payment types in the same transaction.

### Frontend Suggestions (TransactionForm.jsx)
1.  **Data Structure**: Switch the `paiement_*` fields in each `ligne` to a `paiements` array.
2.  **UI Component**:
    *   Replace the "Ajouter paiement" checkbox with an "Ajouter un paiement" button.
    *   Clicking it adds a new row to an internal list of payments for that specific transaction line.
    *   Each row allows choosing the type (Cash, LC, Cheque, etc.).
3.  **Submission**:
    *   Collect all payments into a single list and send them to the existing `/paiements/batch` endpoint.
    *   The backend already supports this; only the UI needs to enable adding multiple lines per transaction.

---

## 📊 4. Product vs. Raw Material Distinction
**Requirement**: Distinction entre produit et matiere premiere.

### Backend Suggestions
*   **File**: `backend/app/models/produit.py`  
    Add an Enum column `type_produit = Column(String(20), nullable=False, default='produit')` with values `('produit_fini', 'matiere_premiere')`.
*   Update the `getProduitsParType` utility to filter using this new column in addition to the `pour_clients`/`pour_fournisseurs` flags.

### Frontend Suggestions
*   Update the Product Management table to display this type as a Chip/Badge.
*   Add a filter on the products list to quickly see only "Matières Premières".

---

## 📈 5. Supplier Balance Dashboard
**Requirement**: Focus on balance rather than just purchase evolution.

### Frontend Suggestions (FournisseurProfile.jsx)
1.  **KPI Highlight**: Move the "Solde à payer" Card to the first position.
2.  **Chart Adjustment**: 
    *   Change the Chart type from `ComposedChart` to a simple `BarChart` for monthly purchases vs. cumulative `Area` for the balance.
    *   Ensure the "Solde" line is the most prominent visual element (e.g., thicker line, darker color).
