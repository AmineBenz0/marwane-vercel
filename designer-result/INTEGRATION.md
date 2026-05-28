# 🎨 Guide d'intégration du redesign

## Fichiers livrés

| Fichier redesigné | Remplace |
|---|---|
| `theme.js` | À créer dans `frontend/src/` |
| `AppLayout.jsx` | `frontend/src/components/Layout/AppLayout.jsx` |
| `Login.jsx` | `frontend/src/pages/Login.jsx` |
| `StatCard.jsx` | `frontend/src/components/StatCard/StatCard.jsx` |
| `DataGrid.jsx` | `frontend/src/components/DataGrid/DataGrid.jsx` |
| `ModalForm.jsx` | `frontend/src/components/ModalForm/ModalForm.jsx` |

---

## Étape 1 — Installer la police Google Fonts

Dans `frontend/index.html`, ajouter dans `<head>` :

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

---

## Étape 2 — Intégrer le thème dans main.jsx

```jsx
// frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import theme from './theme'; // ← nouveau fichier

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
```

---

## Étape 3 — Copier les fichiers redesignés

Copier chaque fichier livré dans le bon dossier du projet
(voir tableau ci-dessus).

---

## Ce qui change visuellement

### Sidebar
- Fond sombre (slate-900 `#0F172A`) au lieu de blanc
- Navigation groupée par sections (Vue d'ensemble / Production / Commerce / Finances)
- Indicateur actif : barre verticale teal + fond semi-transparent
- Collapse desktop avec icônes uniquement
- Profil utilisateur en bas de la sidebar
- Header blanc avec avatar et menu utilisateur épuré

### Palette
- **Primaire** : Teal `#0D9488` (au lieu du bleu MUI par défaut)
- **Fond** : Slate-50 `#F8FAFC` (légèrement chaud, pas blanc pur)
- **Cartes** : Blanc avec bordure fine et ombre subtile
- **Texte principal** : Slate-900 `#0F172A`
- **Texte secondaire** : Slate-500 `#64748B`

### Typographie
- **Police** : Plus Jakarta Sans (lisible, moderne, professionnelle)
- Labels de formulaire au-dessus des champs (meilleure lisibilité)
- Hiérarchie claire : overline pour les titres de section, h6 pour les titres de page

### DataGrid
- Filtres cachés par défaut, accessibles via bouton
- Chips pour les filtres actifs (suppression individuelle)
- Vide state avec icône et message clair
- Lignes inactives visuellement atténuées (opacity)
- Click sur ligne = voir détails (si onView défini)

### StatCard
- Barre de couleur en haut de la carte
- Icône dans un carré coloré (fond teinté)
- Badge de variation (vert/rouge) compact et lisible
- Tooltip sur les valeurs compactes

### Login
- Split-screen sur desktop : panneau de marque sombre à gauche, formulaire à droite
- Formulaire sur une carte propre avec labels au-dessus des champs

### ModalForm
- Labels au-dessus des champs (plus lisible pour non-techniques)
- Switch avec fond coloré quand activé
- Bouton de soumission avec dégradé teal

---

## Personnalisation rapide

Pour changer la couleur primaire, modifier dans `theme.js` :

```js
primary: {
  light:  '#2DD4BF', // teal-400
  main:   '#0D9488', // teal-600  ← couleur principale
  dark:   '#0F766E', // teal-700
},
```

Pour changer le fond de la sidebar, dans `AppLayout.jsx` :

```jsx
// Chercher background: '#0F172A' et remplacer par :
background: '#1E293B'  // un peu plus clair
// ou
background: '#FFFFFF'  // sidebar blanche
```
