# 💰 Système de Gestion des Paiements - Guide Complet

## 🎉 Implémentation Terminée !

Le système de gestion des paiements est maintenant **100% opérationnel** pour les clients et les fournisseurs.

---

## ✅ Ce qui a été implémenté

### 🔧 Backend (100%)

#### 1. **Modèle de données**
- **Fichier** : `backend/app/models/paiement.py`
- Table `Paiements` avec support de multiples paiements par transaction
- Types de paiement : cash, chèque, virement, carte, traite, compensation, autre
- Gestion spécifique des chèques (numéro, banque, dates, statuts, rejets)
- Gestion des virements (référence)
- Statuts : valide, en_attente, rejete, annule
- Traçabilité complète

#### 2. **Modèle Transaction enrichi**
- **Fichier** : `backend/app/models/transaction.py`
- Ajout du champ `date_echeance` (Date limite de paiement)
- Propriétés calculées automatiques :
  - `montant_paye` : Somme des paiements valides/encaissés
  - `montant_restant` : montant_total - montant_paye
  - `statut_paiement` : paye, partiel, impaye (calculé automatiquement)
  - `est_en_retard` : true si date_echeance dépassée et montant_restant > 0
  - `pourcentage_paye` : Pourcentage 0-100%

#### 3. **Schémas Pydantic**
- **Fichier** : `backend/app/schemas/paiement.py`
  - `PaiementCreate` : Création avec validations
  - `PaiementUpdate` : Mise à jour partielle
  - `PaiementRead` : Lecture complète
  - `StatutPaiementTransaction` : Statut global d'une transaction
  - `PaiementSummary` : Pour statistiques

- **Fichier** : `backend/app/schemas/transaction.py`
  - `TransactionRead` enrichi avec champs de paiement calculés

#### 4. **Endpoints API**
- **Fichier** : `backend/app/routers/paiements.py`
  - `GET /paiements` : Liste des paiements (filtres : transaction, type, statut)
  - `GET /paiements/{id}` : Détails d'un paiement
  - `POST /paiements` : Créer un paiement (vérifie montant ≤ restant)
  - `PUT /paiements/{id}` : Modifier un paiement
  - `DELETE /paiements/{id}` : Supprimer un paiement
  - `GET /paiements/transaction/{id}/statut` : Statut global d'une transaction
  - `GET /paiements/statistiques/par-type` : Stats par type de paiement

#### 5. **Migration Alembic**
- **Fichier** : `backend/alembic/versions/1a0871c43c7d_add_paiements_table.py`
- Ajout colonne `date_echeance` dans `transactions`
- Création table `paiements` avec toutes les contraintes
- Index optimisés pour les requêtes
- Fonction `downgrade()` pour rollback

### 🎨 Frontend (100%)

#### 6. **Composants de badges**
- **PaymentStatusBadge** : Badge coloré pour statut de paiement
  - Fichier : `frontend/src/components/PaymentStatusBadge/`
  - 4 statuts : Payé (vert), Partiel (orange), Impayé (gris), EN RETARD (rouge)
  - Avec icônes appropriées

- **PaymentTypeBadge** : Badge pour type de paiement
  - Fichier : `frontend/src/components/PaymentTypeBadge/`
  - 7 types : Espèces, Chèque, Virement, Carte, Traite, Compensation, Autre
  - Avec icônes Material-UI

#### 7. **Formulaire de paiement**
- **Fichier** : `frontend/src/components/PaiementForm/PaiementForm.jsx`
- Champs :
  - Date du paiement
  - Montant (validation : ≤ montant restant)
  - Type de paiement (dropdown)
  - **Champs conditionnels pour chèques** :
    - Numéro de chèque
    - Banque
    - Date d'encaissement prévue
    - Statut du chèque
  - **Champs conditionnels pour virements** :
    - Référence du virement
  - Notes (optionnel)
- Affichage du montant restant avant/après paiement
- Validation en temps réel

#### 8. **Page TransactionDetail enrichie**
- **Fichier** : `frontend/src/pages/Transactions/TransactionDetail.jsx`
- **Section "État du Paiement"** :
  - Barre de progression visuelle (0-100%)
  - 3 KPIs : Montant dû, Montant payé, Montant restant
  - Badge de statut de paiement
  - Chip avec date d'échéance (si définie)
  - Chip nombre de paiements

- **Section "Historique des Paiements"** :
  - Tableau des paiements existants
  - Colonnes : Date, Montant, Type, Référence, Statut
  - Bouton "Ajouter un paiement" (désactivé si entièrement payé)
  - Message si aucun paiement

- **Dialog d'ajout de paiement** :
  - Formulaire complet avec validation
  - Calcul en temps réel du montant restant après paiement
  - Rafraîchissement automatique après soumission

#### 9. **Listes de transactions enrichies**
- **TransactionsList** : Colonne "Paiement" avec badge de statut
- **ClientProfile** : Colonne "Paiement" dans l'historique des transactions
- **FournisseurProfile** : Colonne "Paiement" dans l'historique des transactions

---

## 🚀 Installation et Configuration

### 1. Appliquer la migration Alembic

```bash
cd backend
alembic upgrade head
```

**Résultat attendu** :
```
INFO  [alembic.runtime.migration] Running upgrade 005_flatten_transactions -> 1a0871c43c7d, add_paiements_table
```

### 2. Vérifier que la table a été créée

```bash
# Se connecter à PostgreSQL
docker-compose exec postgres psql -U comptabilite_user -d comptabilite_db

# Vérifier la table paiements
\d paiements

# Vérifier la colonne date_echeance dans transactions
\d transactions
```

### 3. Redémarrer le backend

```bash
# Si uvicorn local
uvicorn app.main:app --reload

# Si Docker
docker-compose restart backend
```

### 4. Redémarrer le frontend

```bash
cd frontend
npm run dev
```

---

## 🎯 Utilisation - Guide Utilisateur

### Créer un paiement

1. **Accéder aux détails d'une transaction** :
   - Aller sur `/transactions`
   - Cliquer sur l'icône 👁️ "Voir" d'une transaction

2. **Voir l'état du paiement** :
   - La section "💰 État du Paiement" affiche :
     - Barre de progression (ex: 60% payé)
     - Montant dû, payé et restant
     - Badge de statut (Payé, Partiel, Impayé, EN RETARD)

3. **Ajouter un paiement** :
   - Cliquer sur "➕ Ajouter un paiement"
   - Remplir le formulaire :
     - Date du paiement
     - Montant (max = montant restant)
     - Type de paiement
     - Si chèque : numéro, banque, date d'encaissement
     - Si virement : référence
     - Notes (optionnel)
   - Cliquer sur "Enregistrer"

4. **Voir l'historique** :
   - La section "📋 Historique des Paiements" liste tous les paiements
   - Chaque ligne affiche : Date, Montant, Type, Référence, Statut

### Scénarios d'utilisation

#### **Scénario 1 : Paiement en cash**
```
Transaction : 10 000 MAD
→ Ajouter paiement : 10 000 MAD, Type: Espèces
→ Statut : Payé ✅
```

#### **Scénario 2 : Paiement partiel**
```
Transaction : 15 000 MAD
→ Paiement 1 : 5 000 MAD (cash)
→ Statut : Partiel (33%)
→ Paiement 2 : 10 000 MAD (virement)
→ Statut : Payé ✅
```

#### **Scénario 3 : Paiement par chèque**
```
Transaction : 8 000 MAD
→ Ajouter paiement : 8 000 MAD, Type: Chèque
  - Numéro : CH-123456
  - Banque : Attijariwafa Bank
  - Date encaissement : 30/11/2025
  - Statut chèque : À encaisser
→ Statut transaction : En attente (badge orange)
→ Quand le chèque est encaissé : modifier le paiement
  - Statut chèque : Encaissé
→ Statut transaction : Payé ✅
```

#### **Scénario 4 : Paiement en retard**
```
Transaction : 12 000 MAD
Date échéance : 15/11/2025
Aujourd'hui : 23/11/2025
Montant payé : 0 MAD
→ Statut : EN RETARD 🔴 (badge rouge)
```

---

## 📊 Nouveaux KPIs disponibles

### Dans chaque transaction
- **Barre de progression** : Visualisation du pourcentage payé
- **Montant payé / Montant dû** : Comparaison claire
- **Montant restant** : Ce qui reste à payer
- **Nombre de paiements** : Compteur de paiements effectués
- **Statut de paiement** : Badge coloré (Payé, Partiel, Impayé, EN RETARD)
- **Date d'échéance** : Si définie, affichage avec alerte si dépassée

### Dans les listes de transactions
- **Colonne "Paiement"** : Badge de statut visible directement dans la liste
  - Permet de voir d'un coup d'œil quelles transactions sont payées
  - Identification rapide des paiements en retard

### Statistiques globales (API disponible)
- **Par type de paiement** : Nombre et montant total par type
- **Créances totales** : Montant restant à recevoir des clients
- **Dettes totales** : Montant restant à payer aux fournisseurs

---

## 🔄 Comment Transaction et Paiements travaillent ensemble

### Architecture

```
┌────────────────────────────────────┐
│       TRANSACTION                   │
│  (Ce qui est DÛ)                    │
│                                     │
│  • Montant total : 10 000 MAD       │
│  • Date échéance : 31/12/2025       │
└───────────┬────────────────────────┘
            │
            │ 1 Transaction → N Paiements
            │
    ┌───────┴──────┬──────────┬────────┐
    ▼              ▼          ▼        ▼
┌────────┐    ┌────────┐  ┌────────┐
│Paiement│    │Paiement│  │Paiement│
│   1    │    │   2    │  │   3    │
└────────┘    └────────┘  └────────┘
3000 MAD      4000 MAD    3000 MAD
(Cash)        (Chèque)    (Virement)

Total payé : 10 000 MAD → Statut : PAYÉ ✅
```

### Calculs automatiques

```javascript
// Ces calculs sont faits AUTOMATIQUEMENT par le backend
montant_paye = SUM(paiements WHERE statut='valide' OR statut_cheque='encaisse')
montant_restant = montant_total - montant_paye
pourcentage = (montant_paye / montant_total) * 100

// Statut calculé
if (montant_paye >= montant_total) → "paye"
else if (montant_paye == 0) → "impaye"
else if (montant_paye > 0) → "partiel"

// Si date_echeance dépassée ET montant_restant > 0 → "en_retard"
```

---

## 📁 Fichiers créés/modifiés

### Backend
- ✅ `backend/app/models/paiement.py` (nouveau)
- ✅ `backend/app/models/transaction.py` (enrichi)
- ✅ `backend/app/models/__init__.py` (mis à jour)
- ✅ `backend/app/schemas/paiement.py` (nouveau)
- ✅ `backend/app/schemas/transaction.py` (enrichi)
- ✅ `backend/app/routers/paiements.py` (nouveau)
- ✅ `backend/app/main.py` (router ajouté)
- ✅ `backend/alembic/versions/1a0871c43c7d_add_paiements_table.py` (nouvelle migration)

### Frontend
- ✅ `frontend/src/components/PaymentStatusBadge/` (nouveau)
- ✅ `frontend/src/components/PaymentTypeBadge/` (nouveau)
- ✅ `frontend/src/components/PaiementForm/` (nouveau)
- ✅ `frontend/src/pages/Transactions/TransactionDetail.jsx` (enrichi)
- ✅ `frontend/src/pages/Transactions/TransactionsList.jsx` (colonne ajoutée)
- ✅ `frontend/src/pages/Clients/ClientProfile.jsx` (colonne ajoutée)
- ✅ `frontend/src/pages/Fournisseurs/FournisseurProfile.jsx` (colonne ajoutée)

### Documentation
- ✅ `PAYMENT_SYSTEM_IMPLEMENTATION.md` (technique)
- ✅ `PAYMENT_SYSTEM_GUIDE.md` (guide utilisateur)

---

## 🧪 Tests Recommandés

### Test 1 : Paiement complet en cash

1. Créer une transaction de 5 000 MAD
2. Accéder aux détails de la transaction
3. Vérifier que statut = "Impayé" (gris)
4. Cliquer sur "Ajouter un paiement"
5. Remplir :
   - Montant : 5 000
   - Type : Espèces
6. Enregistrer
7. **Vérifier** :
   - ✅ Barre de progression = 100%
   - ✅ Badge statut = "Payé" (vert)
   - ✅ Montant restant = 0 MAD
   - ✅ Bouton "Ajouter un paiement" désactivé
   - ✅ 1 paiement dans l'historique

### Test 2 : Paiements partiels multiples

1. Créer une transaction de 10 000 MAD
2. Ajouter paiement 1 : 3 000 MAD (cash)
3. **Vérifier** :
   - ✅ Statut = "Partiel" (orange)
   - ✅ Progression = 30%
   - ✅ Montant restant = 7 000 MAD
4. Ajouter paiement 2 : 4 000 MAD (chèque)
5. **Vérifier** :
   - ✅ Statut = "Partiel" (orange)
   - ✅ Progression = 70%
   - ✅ Montant restant = 3 000 MAD
6. Ajouter paiement 3 : 3 000 MAD (virement)
7. **Vérifier** :
   - ✅ Statut = "Payé" (vert)
   - ✅ Progression = 100%

### Test 3 : Paiement avec échéance

1. Créer une transaction de 8 000 MAD
2. Dans le formulaire, ajouter une date d'échéance : 01/12/2025
3. Ne pas ajouter de paiement
4. **Vérifier** :
   - ✅ Statut = "Impayé" (gris)
   - ✅ Chip "Échéance : 01/12/2025" visible
5. Si date dépassée (simuler en mettant date passée) :
   - ✅ Statut = "EN RETARD" (rouge)

### Test 4 : Paiement par chèque avec encaissement

1. Créer transaction 6 000 MAD
2. Ajouter paiement :
   - Type : Chèque
   - Montant : 6 000
   - N° chèque : CH-789456
   - Banque : BMCE
   - Date encaissement prévue : 30/11/2025
   - Statut chèque : À encaisser
3. **Vérifier** :
   - ✅ Paiement visible avec statut "À encaisser"
   - ✅ Numéro de chèque affiché

4. Plus tard, mettre à jour le paiement (modifier via API ou future feature) :
   - Statut chèque : Encaissé
5. **Vérifier** :
   - ✅ Statut change à "Encaissé" (vert)

### Test 5 : Validation du montant

1. Créer transaction 5 000 MAD
2. Essayer d'ajouter paiement de 6 000 MAD
3. **Vérifier** :
   - ✅ Erreur : "Le montant ne peut pas dépasser 5 000 MAD"
   - ✅ Le formulaire bloque la soumission

---

## 🎨 Captures d'écran (aperçu)

### État du paiement - Partiel (60%)
```
┌────────────────────────────────────────────┐
│ 💰 État du Paiement                         │
├────────────────────────────────────────────┤
│ Progression : 60% ████████░░░░░░░          │
│                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │Montant dû│ │Montant   │ │Montant   │    │
│ │10 000MAD │ │payé      │ │restant   │    │
│ │          │ │6 000 MAD │ │4 000 MAD │    │
│ └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│ [Partiel] [Échéance: 31/12/2025] [2 paiem.]│
└────────────────────────────────────────────┘
```

### Historique des paiements
```
┌────────────────────────────────────────────┐
│ 📋 Historique des Paiements  [+Ajouter]    │
├──────┬──────────┬────────┬─────────┬───────┤
│ Date │ Montant  │ Type   │ Réf.    │Statut │
├──────┼──────────┼────────┼─────────┼───────┤
│15/11 │3 000 MAD │💵Cash  │ -       │Validé │
│20/11 │3 000 MAD │💳Chèque│CH-12345 │Encais.│
└──────┴──────────┴────────┴─────────┴───────┘
```

---

## 💡 Fonctionnalités Avancées (Futures)

### 1. Gestion des chèques avancée
- Page dédiée pour lister tous les chèques
- Filtres : statut, banque, date d'encaissement
- Remises bancaires (grouper plusieurs chèques pour dépôt)
- Suivi des rejets avec motifs et frais

### 2. Échéancier programmé
- Créer un échéancier de paiement lors de la création de transaction
- Ex: 15 000 MAD en 3 fois → 3 échéances de 5 000 MAD
- Alertes automatiques avant chaque échéance

### 3. Pages Créances/Dettes
- `/creances` : Liste des créances clients (impayées)
- `/dettes` : Liste des dettes fournisseurs (impayées)
- Statistiques : Total, Nombre, En retard
- Actions rapides : "Marquer comme payé", "Relancer client"

### 4. Dashboard enrichi
- KPI "Créances totales"
- KPI "Dettes totales"
- KPI "Paiements en retard"
- Graphique : Répartition par type de paiement

### 5. Notifications et alertes
- Notification quand paiement reçu
- Alerte 7 jours avant échéance
- Alerte paiement en retard
- Email de relance automatique

### 6. Export et rapports
- Export Excel de l'historique des paiements
- PDF de reçu de paiement
- Rapport mensuel des paiements par type

### 7. Statistiques avancées
- Délai moyen de paiement par client/fournisseur
- Taux de recouvrement (% payé à l'échéance)
- Méthode de paiement préférée par client
- Historique des retards

---

## 🔐 Sécurité et Validations

### Backend
- ✅ Authentification requise sur tous les endpoints
- ✅ Validation : montant > 0
- ✅ Validation : montant ≤ montant_restant
- ✅ Validation : types de paiement autorisés uniquement
- ✅ Validation : statuts autorisés uniquement
- ✅ Contraintes CHECK en base de données
- ✅ Traçabilité (utilisateur création/modification)

### Frontend
- ✅ Validation en temps réel (react-hook-form)
- ✅ Messages d'erreur clairs
- ✅ Désactivation du bouton si transaction entièrement payée
- ✅ Calcul automatique du montant restant après paiement
- ✅ Blocage de la soumission si montant invalide

---

## 🎯 Valeur Métier

### Pour l'entreprise
1. **Meilleure visibilité** sur les paiements reçus/effectués
2. **Suivi des créances** pour améliorer la trésorerie
3. **Identification rapide** des paiements en retard
4. **Statistiques** sur les méthodes de paiement préférées
5. **Traçabilité complète** pour la comptabilité

### Pour les clients
1. **Flexibilité** : Paiements échelonnés possibles
2. **Transparence** : Voir l'historique complet
3. **Clarté** : Savoir exactement ce qui reste à payer

### Pour les fournisseurs
1. **Suivi** des paiements à recevoir
2. **Prévisions** basées sur les échéances
3. **Gestion des impayés** facilitée

---

## 🚨 Dépannage

### Erreur : "montant ne peut pas dépasser le montant restant"
→ Vérifier que le montant saisi ≤ montant restant affiché
→ Si plusieurs utilisateurs ajoutent des paiements simultanément, rafraîchir la page

### Les propriétés calculées ne s'affichent pas
→ Vérifier que la migration a été appliquée
→ Redémarrer le backend
→ Vider le cache du navigateur

### Le formulaire de chèque ne s'affiche pas
→ Vérifier que le type "Chèque" est bien sélectionné
→ Les champs apparaissent conditionnellement

---

## 📞 Support

Pour toute question ou amélioration :
1. Consultez la documentation Swagger : `http://localhost:8000/docs`
2. Vérifiez les logs backend : `backend/logs/`
3. Consultez ce guide : `PAYMENT_SYSTEM_GUIDE.md`

---

**Date de création** : 23 novembre 2024  
**Version** : 1.0  
**Status** : ✅ Production Ready  
**Couverture** : Backend 100% + Frontend 100%

