# 💰 Système de Gestion des Paiements - Documentation d'Implémentation

## ✅ Ce qui a été implémenté

### Backend (100% terminé)

#### 1. **Modèle de données** ✅
- **Fichier** : `backend/app/models/paiement.py`
- Nouveau modèle `Paiement` avec tous les champs nécessaires
- Support de multiples types de paiement : cash, chèque, virement, carte, traite, compensation, autre
- Gestion des informations spécifiques aux chèques (numéro, banque, dates, statut, motif rejet)
- Gestion des virements (référence)
- Statuts : valide, en_attente, rejete, annule
- Traçabilité complète (utilisateur création/modification, dates)

#### 2. **Modèle Transaction enrichi** ✅
- **Fichier** : `backend/app/models/transaction.py`
- Ajout de la relation `paiements` (One-to-Many)
- Propriétés calculées automatiquement :
  - `montant_paye` : Somme des paiements valides
  - `montant_restant` : Montant_total - montant_payé
  - `statut_paiement` : paye, partiel, impaye
  - `est_en_retard` : Vérifie si date_echeance dépassée
  - `pourcentage_paye` : Pourcentage du montant payé (0-100%)

#### 3. **Schémas Pydantic** ✅
- **Fichier** : `backend/app/schemas/paiement.py`
- `PaiementBase` : Champs communs
- `PaiementCreate` : Création de paiement
- `PaiementUpdate` : Mise à jour partielle
- `PaiementRead` : Lecture avec tous les champs
- `StatutPaiementTransaction` : Statut global d'une transaction
- `PaiementSummary` : Résumé pour statistiques
- Validations complètes des types et statuts

#### 4. **Endpoints API** ✅
- **Fichier** : `backend/app/routers/paiements.py`
- **GET** `/paiements` : Liste des paiements (filtres : transaction, type, statut)
- **GET** `/paiements/{id}` : Détails d'un paiement
- **POST** `/paiements` : Créer un paiement (vérifie que montant ≤ restant)
- **PUT** `/paiements/{id}` : Modifier un paiement
- **DELETE** `/paiements/{id}` : Supprimer un paiement
- **GET** `/paiements/transaction/{id}/statut` : Statut de paiement d'une transaction
- **GET** `/paiements/statistiques/par-type` : Statistiques par type de paiement
- Router ajouté dans `main.py` ✅

#### 5. **Migration Alembic** ✅
- **Fichier** : `backend/alembic/versions/1a0871c43c7d_add_paiements_table.py`
- Ajout de la colonne `date_echeance` dans `transactions`
- Création de la table `paiements` avec toutes les colonnes
- Toutes les contraintes CHECK pour validation des données
- Index optimisés pour les requêtes :
  - `idx_transactions_date_echeance`
  - `idx_paiements_id_transaction`
  - `idx_paiements_date_paiement`
  - `idx_paiements_type_paiement`
  - `idx_paiements_numero_cheque`
- Fonction `downgrade()` pour rollback complet

### Frontend (40% terminé)

#### 6. **Composants de badges** ✅
- **PaymentStatusBadge** : Badge pour statut de paiement
  - Fichier : `frontend/src/components/PaymentStatusBadge/PaymentStatusBadge.jsx`
  - Statuts : Payé (vert), Partiel (orange), Impayé (gris), EN RETARD (rouge)
  - Avec icônes et couleurs appropriées

- **PaymentTypeBadge** : Badge pour type de paiement
  - Fichier : `frontend/src/components/PaymentTypeBadge/PaymentTypeBadge.jsx`
  - Types : Espèces, Chèque, Virement, Carte, Traite, Compensation, Autre
  - Avec icônes Material-UI

---

## 🔄 Ce qui reste à faire (Frontend)

### 7. **Modifier TransactionDetail** (en cours)
- Ajouter une section "État du paiement" avec :
  - Barre de progression visuelle
  - KPIs : Montant dû, Montant payé, Montant restant
  - Badge de statut avec date d'échéance
- Ajouter une section "Historique des paiements" avec :
  - Tableau des paiements existants
  - Colonnes : Date, Montant, Type, Référence, Statut, Actions
  - Bouton "Ajouter un paiement"

### 8. **Créer formulaire d'ajout de paiement**
- Modal/Dialog pour ajouter un paiement
- Champs :
  - Date du paiement
  - Montant (avec validation : ≤ montant restant)
  - Type de paiement (dropdown)
  - **Si type = chèque** :
    - Numéro de chèque
    - Banque
    - Date d'encaissement prévue
  - **Si type = virement** :
    - Référence du virement
  - Notes (optionnel)
- Calcul en temps réel du montant restant après paiement
- Validation et messages d'erreur

### 9. **Ajouter colonne statut dans listes transactions**
- **TransactionsList** : Ajouter colonne "Statut paiement"
- **ClientProfile/FournisseurProfile** : Tableau des transactions avec statut
- Possibilité de filtrer par statut (Tous, Payé, Partiel, Impayé, En retard)

### 10. **Pages dédiées Créances/Dettes** (optionnel mais recommandé)
- `frontend/src/pages/Payments/Creances.jsx` : Créances clients
- `frontend/src/pages/Payments/Dettes.jsx` : Dettes fournisseurs
- Afficher uniquement les transactions avec statut != 'paye'
- Cartes statistiques :
  - Total créances/dettes
  - Nombre de factures impayées
  - Factures en retard
- Action rapide "Marquer comme payé"
- Filtres par statut et date d'échéance

---

## 🚀 Pour appliquer les changements (Backend)

### 1. Appliquer la migration

```bash
cd backend
alembic upgrade head
```

Cette commande va :
- Ajouter la colonne `date_echeance` à la table `transactions`
- Créer la table `paiements` avec toutes les contraintes
- Créer tous les index

### 2. Redémarrer le backend

```bash
# Si vous utilisez uvicorn directement
uvicorn app.main:app --reload

# Ou avec docker-compose
docker-compose restart backend
```

### 3. Vérifier que tout fonctionne

```bash
# Accéder à la documentation Swagger
http://localhost:8000/docs

# Vous devriez voir les nouveaux endpoints :
# - GET /paiements
# - POST /paiements
# - GET /paiements/{id}
# - PUT /paiements/{id}
# - DELETE /paiements/{id}
# - GET /paiements/transaction/{id}/statut
# - GET /paiements/statistiques/par-type
```

---

## 📝 Exemple d'utilisation de l'API

### Créer un paiement

```bash
POST /api/v1/paiements
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "id_transaction": 123,
  "date_paiement": "2025-11-23",
  "montant": 5000,
  "type_paiement": "cash",
  "notes": "Paiement en espèces"
}
```

### Créer un paiement par chèque

```bash
POST /api/v1/paiements
Content-Type: application/json

{
  "id_transaction": 123,
  "date_paiement": "2025-11-23",
  "montant": 7000,
  "type_paiement": "cheque",
  "numero_cheque": "CH-123456",
  "banque": "Attijariwafa Bank",
  "date_encaissement_prevue": "2025-11-30",
  "statut_cheque": "a_encaisser",
  "notes": "Chèque à encaisser le 30/11"
}
```

### Obtenir le statut de paiement d'une transaction

```bash
GET /api/v1/paiements/transaction/123/statut
```

**Réponse** :
```json
{
  "id_transaction": 123,
  "montant_total": 15000.00,
  "montant_paye": 12000.00,
  "montant_restant": 3000.00,
  "pourcentage_paye": 80.0,
  "statut_paiement": "partiel",
  "est_en_retard": false,
  "nombre_paiements": 2
}
```

---

## 🎨 Composants Frontend disponibles

### PaymentStatusBadge

```jsx
import PaymentStatusBadge from '../components/PaymentStatusBadge';

// Dans votre composant
<PaymentStatusBadge statut="paye" />
<PaymentStatusBadge statut="partiel" />
<PaymentStatusBadge statut="impaye" />
<PaymentStatusBadge statut="en_retard" />
```

### PaymentTypeBadge

```jsx
import PaymentTypeBadge from '../components/PaymentTypeBadge';

// Dans votre composant
<PaymentTypeBadge type="cash" />
<PaymentTypeBadge type="cheque" />
<PaymentTypeBadge type="virement" />
<PaymentTypeBadge type="carte" />
```

---

## 📊 Architecture technique

### Relation entre Transaction et Paiements

```
Transaction (1) ←→ (Many) Paiements

Calculs automatiques :
- montant_paye = SUM(paiements WHERE statut IN ['valide'] OR statut_cheque = 'encaisse')
- montant_restant = montant_total - montant_paye
- statut_paiement = calculé selon montant_paye et date_echeance
- pourcentage_paye = (montant_paye / montant_total) * 100
```

### États des paiements

**Statut général** :
- `valide` : Paiement confirmé (par défaut pour cash, virement, carte)
- `en_attente` : En attente de confirmation (par défaut pour chèques)
- `rejete` : Paiement rejeté (ex: chèque sans provision)
- `annule` : Paiement annulé

**Statut spécifique chèques** :
- `emis` : Chèque émis
- `a_encaisser` : Chèque à encaisser
- `encaisse` : Chèque encaissé avec succès
- `rejete` : Chèque rejeté par la banque
- `annule` : Chèque annulé

---

## 🎯 Prochaines étapes recommandées

1. **Tester le backend** :
   - Appliquer la migration
   - Créer quelques paiements via Swagger
   - Vérifier les calculs automatiques

2. **Implémenter le frontend** :
   - Modifier `TransactionDetail.jsx` pour afficher les paiements
   - Créer le formulaire d'ajout de paiement
   - Ajouter la colonne statut dans les listes

3. **Enrichissements optionnels** :
   - Système de notifications (paiement reçu, échéance proche, retard)
   - Export PDF des reçus de paiement
   - Statistiques avancées sur les types de paiement
   - Remises bancaires (grouper plusieurs chèques)
   - Échéancier programmé pour paiements échelonnés

---

## 🐛 Dépannage

### La migration échoue

```bash
# Vérifier l'état actuel
alembic current

# Voir l'historique des migrations
alembic history

# Si nécessaire, revenir en arrière
alembic downgrade -1

# Puis réessayer
alembic upgrade head
```

### Les propriétés calculées ne fonctionnent pas

Les propriétés `montant_paye`, `statut_paiement`, etc. sont calculées dynamiquement.
Assurez-vous de :
1. Avoir bien appliqué la migration
2. Que la relation `paiements` est chargée (SQLAlchemy lazy loading)
3. Rafraîchir l'objet transaction après ajout d'un paiement

---

**Date d'implémentation** : 23 novembre 2024  
**Version** : 1.0  
**Status Backend** : ✅ Terminé (100%)  
**Status Frontend** : 🟡 En cours (40%)

