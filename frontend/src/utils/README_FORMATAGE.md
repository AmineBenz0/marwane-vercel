# 📊 Système de Formatage des Nombres

## Vue d'ensemble

Le système de formatage centralisé gère l'affichage des nombres dans toute l'application, avec une attention particulière pour les **grands nombres** qui peuvent déborder des conteneurs ou être difficilement lisibles.

## Fonctionnalités principales

### ✨ Notation compacte automatique

Les grands nombres (≥ 1 million par défaut) sont automatiquement formatés avec une notation compacte :

| Valeur | Notation compacte | Notation complète |
|--------|------------------|-------------------|
| 1 234,56 | 1 234,56 MAD | 1 234,56 MAD |
| 123 456,78 | 123 456,78 MAD | 123 456,78 MAD |
| 1 000 000 | 1 M MAD | 1 000 000,00 MAD |
| 10 000 000 | 10 M MAD | 10 000 000,00 MAD |
| 1 000 000 000 | 1 Md MAD | 1 000 000 000,00 MAD |

### 🎯 Tooltips intelligents

Dans les `StatCard`, un tooltip s'affiche automatiquement au survol pour les nombres avec notation compacte, montrant la valeur complète.

### 📏 Taille de police adaptative

La taille de police s'adapte automatiquement à la longueur du nombre pour éviter les débordements :
- ≤ 10 caractères : `h4` (grande)
- ≤ 15 caractères : `h5` (moyenne)
- ≤ 20 caractères : `h6` (petite)
- \> 20 caractères : `body1` (très petite)

### 🔄 Gestion du débordement

Les cellules de tableaux ont maintenant :
- `overflow: hidden`
- `text-overflow: ellipsis`
- `white-space: nowrap`

## API

### `formatMontant(montant, options)`

Formate un montant en devise.

```javascript
import { formatMontant } from '../utils/formatNumber';

// Utilisation basique
formatMontant(1234567.89)  // "1,2 M MAD"

// Options
formatMontant(1234567.89, {
  useCompactNotation: false,    // Désactive la notation compacte
  currency: 'EUR',               // Change la devise
  threshold: 100000,             // Seuil personnalisé (100k)
  maximumFractionDigits: 0,      // Pas de décimales
  minimumFractionDigits: 2,      // 2 décimales minimum
})
```

### `formatMontantComplet(montant, currency)`

Formate un montant complet (pour tooltips, exports).

```javascript
import { formatMontantComplet } from '../utils/formatNumber';

formatMontantComplet(1234567.89)  // "1 234 567,89 MAD"
```

### `formatSimpleNumber(value, options)`

Formate un nombre simple avec séparateurs.

```javascript
import { formatSimpleNumber } from '../utils/formatNumber';

formatSimpleNumber(1234567)  // "1,2 M"
formatSimpleNumber(1234567, { useCompactNotation: false })  // "1 234 567"
```

### `formatNumberComplet(value)`

Formate un nombre complet.

```javascript
import { formatNumberComplet } from '../utils/formatNumber';

formatNumberComplet(1234567)  // "1 234 567"
```

### `formatPercentage(value, decimals)`

Formate un pourcentage (valeur entrée: 0-100).

```javascript
import { formatPercentage } from '../utils/formatNumber';

formatPercentage(12.5)      // "12,5 %"
formatPercentage(12.567, 2) // "12,57 %"
```

### `needsCompactNotation(value, threshold)`

Détermine si un nombre nécessite une notation compacte.

```javascript
import { needsCompactNotation } from '../utils/formatNumber';

needsCompactNotation(500000)    // false
needsCompactNotation(1000000)   // true
needsCompactNotation(500000, 100000)  // true (seuil personnalisé)
```

### `getRecommendedFontSize(formattedValue)`

Obtient la taille de police recommandée.

```javascript
import { getRecommendedFontSize } from '../utils/formatNumber';

getRecommendedFontSize("1 234 MAD")           // "h4"
getRecommendedFontSize("123 456 789 MAD")     // "h5"
```

## Utilisation dans les composants

### StatCard

```javascript
<StatCard
  title="Total ventes"
  value={5678901.23}
  icon={<AttachMoneyIcon />}
  valueFormat="currency"
  currency="MAD"
  useCompactNotation={true}  // Notation compacte activée
/>
```

**Affichage :**
- Carte : "5,7 M MAD" (avec icône de curseur d'aide)
- Tooltip au survol : "5 678 901,23 MAD"

### DataGrid - Colonnes de montants

```javascript
const columns = [
  {
    id: 'montant_total',
    label: 'Montant',
    align: 'right',
    format: (value) => formatMontant(value, { useCompactNotation: false }),
  },
];
```

**Note :** Dans les tableaux, on désactive généralement la notation compacte pour plus de précision.

### Graphiques (recharts)

```javascript
// YAxis - notation compacte pour l'axe
<YAxis
  tickFormatter={(value) => formatMontant(value)}
/>

// Tooltip - valeur complète
<Tooltip
  formatter={(value) => formatMontantComplet(value)}
/>
```

## Bonnes pratiques

### ✅ À faire

1. **StatCard** : Utiliser la notation compacte (défaut)
   ```javascript
   <StatCard value={5000000} valueFormat="currency" />
   ```

2. **Tableaux** : Désactiver la notation compacte pour la précision
   ```javascript
   format: (value) => formatMontant(value, { useCompactNotation: false })
   ```

3. **Graphiques** : 
   - Axes : notation compacte
   - Tooltips : valeur complète
   ```javascript
   <YAxis tickFormatter={(v) => formatMontant(v)} />
   <Tooltip formatter={(v) => formatMontantComplet(v)} />
   ```

4. **Exports (Excel/PDF)** : Toujours utiliser les valeurs complètes
   ```javascript
   customFormatters: {
     montant: (value) => formatMontantComplet(value)
   }
   ```

### ❌ À éviter

1. Ne pas créer de nouvelles fonctions `formatMontant` locales
2. Ne pas utiliser directement `Intl.NumberFormat` sans passer par les utilitaires
3. Ne pas oublier d'importer depuis `utils/formatNumber`

## Configuration

### Seuils personnalisés

Vous pouvez personnaliser le seuil pour la notation compacte :

```javascript
// Seuil global : 1 000 000 (défaut)
// Pour changer localement :
formatMontant(value, { threshold: 100000 })  // Notation compacte à partir de 100k
```

### Devises

Le système supporte toutes les devises ISO :

```javascript
formatMontant(1234, { currency: 'EUR' })  // "1 234,00 €"
formatMontant(1234, { currency: 'USD' })  // "1 234,00 $US"
```

## Exemples complets

Voir le fichier `formatNumber.example.jsx` pour des exemples interactifs complets.

## Migration

### Ancien code
```javascript
const formatMontant = (montant) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
  }).format(montant);
};
```

### Nouveau code
```javascript
import { formatMontant, formatMontantComplet } from '../utils/formatNumber';

// Pour affichage normal (avec notation compacte)
formatMontant(montant)

// Pour tableaux ou détails (sans notation compacte)
formatMontant(montant, { useCompactNotation: false })

// Pour tooltips (valeur complète)
formatMontantComplet(montant)
```

## Tests

Pour tester le formatage :

```javascript
import { formatMontant, needsCompactNotation } from '../utils/formatNumber';

// Test notation compacte
console.log(formatMontant(5678901));  // "5,7 M MAD"
console.log(formatMontant(5678901, { useCompactNotation: false }));  // "5 678 901,00 MAD"

// Test seuil
console.log(needsCompactNotation(1000000));  // true
console.log(needsCompactNotation(500000));   // false
```

## Performance

- Utilisation de `Intl.NumberFormat` natif (performant)
- Pas de bibliothèques externes
- Formatage en temps réel sans impact notable

## Support navigateurs

- Chrome/Edge : ✅ Complet
- Firefox : ✅ Complet
- Safari : ✅ Complet (iOS 14.5+)

La notation compacte (`notation: 'compact'`) est supportée par tous les navigateurs modernes depuis 2020.

