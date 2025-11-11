/**
 * Exemple d'utilisation du composant StatCard.
 * 
 * Ce fichier montre comment utiliser le composant StatCard
 * avec différentes configurations.
 */

import React from 'react';
import { Box, Grid } from '@mui/material';
import StatCard from './StatCard';
import {
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  ShoppingCart as ShoppingCartIcon,
} from '@mui/icons-material';

/**
 * Exemple 1 : Utilisation basique avec titre, valeur et icône.
 */
export function BasicStatCardExample() {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Solde de la caisse"
            value={125000.50}
            icon={<AccountBalanceIcon />}
            valueFormat="currency"
            currency="MAD"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Transactions du mois"
            value={42}
            icon={<ReceiptIcon />}
            valueFormat="number"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * Exemple 2 : Avec variation (augmentation).
 */
export function StatCardWithIncreaseExample() {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total des ventes"
            value={45000}
            icon={<ShoppingCartIcon />}
            valueFormat="currency"
            currency="MAD"
            variation={{
              value: 12.5,
              type: 'increase',
              label: 'vs mois dernier',
              valueFormat: 'percentage',
            }}
            color="success"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * Exemple 3 : Avec variation (diminution).
 */
export function StatCardWithDecreaseExample() {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total des achats"
            value={32000}
            icon={<TrendingUpIcon />}
            valueFormat="currency"
            currency="MAD"
            variation={{
              value: 8.3,
              type: 'decrease',
              label: 'vs mois dernier',
              valueFormat: 'percentage',
            }}
            color="error"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * Exemple 4 : Avec variation neutre.
 */
export function StatCardWithNeutralExample() {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Clients actifs"
            value={156}
            icon={<ReceiptIcon />}
            valueFormat="number"
            variation={{
              value: 0,
              type: 'neutral',
              label: 'vs mois dernier',
            }}
            color="info"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * Exemple 5 : Dashboard complet avec plusieurs cartes.
 */
export function DashboardStatCardsExample() {
  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Solde de la caisse"
            value={125000.50}
            icon={<AccountBalanceIcon />}
            valueFormat="currency"
            currency="MAD"
            variation={{
              value: 5.2,
              type: 'increase',
              label: 'vs mois dernier',
              valueFormat: 'percentage',
            }}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Transactions du mois"
            value={42}
            icon={<ReceiptIcon />}
            valueFormat="number"
            variation={{
              value: 3,
              type: 'increase',
              label: 'vs mois dernier',
            }}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total des ventes"
            value={45000}
            icon={<ShoppingCartIcon />}
            valueFormat="currency"
            currency="MAD"
            variation={{
              value: 12.5,
              type: 'increase',
              label: 'vs mois dernier',
              valueFormat: 'percentage',
            }}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total des achats"
            value={32000}
            icon={<TrendingUpIcon />}
            valueFormat="currency"
            currency="MAD"
            variation={{
              value: 8.3,
              type: 'decrease',
              label: 'vs mois dernier',
              valueFormat: 'percentage',
            }}
            color="error"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * Exemple 6 : Sans variation.
 */
export function StatCardWithoutVariationExample() {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Nombre de clients"
            value={156}
            icon={<ReceiptIcon />}
            valueFormat="number"
            color="primary"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * Exemple 7 : Avec pourcentage.
 */
export function StatCardWithPercentageExample() {
  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Taux de croissance"
            value={15.8}
            icon={<TrendingUpIcon />}
            valueFormat="percentage"
            color="success"
          />
        </Grid>
      </Grid>
    </Box>
  );
}

