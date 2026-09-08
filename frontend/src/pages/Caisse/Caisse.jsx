import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  CreditCard as LcIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { format, subDays } from 'date-fns';
import { get } from '../../services/api';
import useNotification from '../../hooks/useNotification';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportCaisseReport } from '../../utils/exportToPDF';
import { formatMontant } from '../../utils/formatNumber';

const PERIODS = [
  { value: '30days', label: '30 derniers jours' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'all', label: 'Tout' },
];

const MOVEMENT_TYPES = [
  { value: 'all', label: 'Tous' },
  { value: 'ENTREE', label: 'Entrées' },
  { value: 'SORTIE', label: 'Sorties' },
];

const toNumber = (value) => Number(value || 0);

const toDateKey = (date) => format(date, 'yyyy-MM-dd');

const formatDate = (value, withTime = false) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
};

const getPeriodParams = (period) => {
  const today = new Date();
  if (period === 'today') {
    const key = toDateKey(today);
    return { date_debut: key, date_fin: key };
  }
  if (period === '30days') {
    return {
      date_debut: toDateKey(subDays(today, 30)),
      date_fin: toDateKey(today),
    };
  }
  return {};
};

const getMovementLabel = (movement) => {
  if (movement.id_charge) return 'Dépense';
  if (movement.id_paiement) return movement.type_mouvement === 'ENTREE' ? 'Paiement client' : 'Paiement fournisseur';
  if (movement.id_transaction) return movement.type_mouvement === 'ENTREE' ? 'Vente encaissée' : 'Achat payé';
  return movement.type_mouvement === 'ENTREE' ? 'Entrée caisse' : 'Sortie caisse';
};

const getMovementOrigin = (movement) => {
  if (movement.id_charge) return 'Dépense';
  if (movement.id_paiement) return `Paiement #${movement.id_paiement}`;
  if (movement.id_transaction) return `Transaction #${movement.id_transaction}`;
  return 'Caisse';
};

const getSignedAmount = (movement) => {
  const amount = toNumber(movement.montant);
  return movement.type_mouvement === 'SORTIE' ? -amount : amount;
};

const formatSignedAmount = (movement) => {
  const signed = getSignedAmount(movement);
  const sign = signed > 0 ? '+' : signed < 0 ? '-' : '';
  return `${sign}${formatMontant(Math.abs(signed), { useCompactNotation: false, maximumFractionDigits: 0 })}`;
};

function Caisse() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const notification = useNotification();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [soldeComplet, setSoldeComplet] = useState(null);
  const [lettresCreditDisponibles, setLettresCreditDisponibles] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [period, setPeriod] = useState('30days');
  const [movementType, setMovementType] = useState('all');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const movementParams = {
        limit: 1000,
        ...getPeriodParams(period),
      };

      if (movementType !== 'all') {
        movementParams.type_mouvement = movementType;
      }

      const [soldeResponse, movementsResponse, lcResponse] = await Promise.all([
        get('/caisse/solde/complet'),
        get('/caisse/mouvements', { params: movementParams }),
        get('/lettres-credit/disponibles', { params: { limit: 1000 } }),
      ]);

      setSoldeComplet(soldeResponse);
      setMouvements(Array.isArray(movementsResponse) ? movementsResponse : []);
      setLettresCreditDisponibles(Array.isArray(lcResponse) ? lcResponse : []);
    } catch (err) {
      console.error('Erreur chargement caisse:', err);
      const message = err?.message || 'Erreur lors du chargement de la caisse';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, movementType]);

  const lcDisponiblesTotal = useMemo(() => {
    return lettresCreditDisponibles.reduce((sum, lc) => sum + toNumber(lc.montant), 0);
  }, [lettresCreditDisponibles]);

  const stats = useMemo(() => {
    const totalDisponible = toNumber(soldeComplet?.solde_reel ?? soldeComplet?.solde_theorique);
    const cashEnCaisse = totalDisponible - lcDisponiblesTotal;
    const aEncaisser = Math.max(0, toNumber(soldeComplet?.creances_clients));
    const aPayer = Math.max(0, toNumber(soldeComplet?.dettes_fournisseurs));

    return {
      totalDisponible,
      cashEnCaisse,
      lcDisponibles: lcDisponiblesTotal,
      lcCount: lettresCreditDisponibles.length,
      aEncaisser,
      aPayer,
    };
  }, [lcDisponiblesTotal, lettresCreditDisponibles.length, soldeComplet]);

  const visibleMovements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return mouvements;

    return mouvements.filter((movement) => (
      [
        getMovementLabel(movement),
        getMovementOrigin(movement),
        movement.type_mouvement,
        movement.id_transaction,
        movement.id_paiement,
        movement.id_charge,
      ]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch))
    ));
  }, [mouvements, search]);

  const handleExportExcel = async () => {
    if (visibleMovements.length === 0) {
      notification.warning('Aucun mouvement à exporter');
      return;
    }

    await exportToExcelAdvanced(
      visibleMovements.map((movement) => ({
        date: movement.date_mouvement,
        operation: getMovementLabel(movement),
        origine: getMovementOrigin(movement),
        sens: movement.type_mouvement === 'ENTREE' ? 'Entrée' : 'Sortie',
        montant: getSignedAmount(movement),
      })),
      [
        { id: 'date', label: 'Date' },
        { id: 'operation', label: 'Opération' },
        { id: 'origine', label: 'Origine' },
        { id: 'sens', label: 'Sens' },
        { id: 'montant', label: 'Montant' },
      ],
      `mouvements_caisse_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
      'Mouvements caisse',
      {
        date: (value) => formatDate(value, true),
        montant: (value) => Number(value || 0),
      }
    );
    notification.success('Export Excel généré');
  };

  const handleExportPDF = () => {
    try {
      const params = getPeriodParams(period);
      exportCaisseReport(
        visibleMovements,
        stats.totalDisponible,
        params.date_debut || '',
        params.date_fin || ''
      );
      notification.success('Export PDF généré');
    } catch (err) {
      console.error('Erreur export PDF caisse:', err);
      notification.error("Erreur lors de l'export PDF");
    }
  };

  if (loading && !soldeComplet) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight={900}>
            Caisse
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
            Voir l'argent disponible maintenant, sans répéter les détails déjà présents dans transactions, LC ou comptes bancaires.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button variant="outlined" startIcon={!isMobile && <RefreshIcon />} onClick={loadData} disabled={loading}>
            Actualiser
          </Button>
          <Button variant="outlined" startIcon={!isMobile && <DownloadIcon />} onClick={handleExportExcel} disabled={visibleMovements.length === 0}>
            Excel
          </Button>
          <Button variant="contained" onClick={handleExportPDF} disabled={visibleMovements.length === 0}>
            PDF
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2.5, borderRadius: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.35fr 0.9fr 0.9fr' },
          gap: 2,
          mb: 2.5,
        }}
      >
        <MainBalanceCard value={stats.totalDisponible} />
        <SmallMoneyCard
          label="Cash en caisse"
          value={stats.cashEnCaisse}
          helper="Paiements réellement encaissés, hors LC."
          tone="success"
          icon={<WalletIcon />}
        />
        <SmallMoneyCard
          label="LC disponibles"
          value={stats.lcDisponibles}
          helper={`${stats.lcCount} LC comptée(s) dans la caisse.`}
          tone="info"
          icon={<LcIcon />}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.78fr) minmax(0, 1.42fr)' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Card variant="outlined" sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <WarningIcon color="warning" />
              <Typography variant="h6" fontWeight={900}>À surveiller</Typography>
            </Stack>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Résumé court. Les détails restent dans les fiches clients, fournisseurs et transactions.
            </Typography>

            <Stack spacing={1.5}>
              <WatchItem
                label="À encaisser"
                helper="Clients qui doivent encore payer."
                value={stats.aEncaisser}
                color="warning.main"
              />
              <WatchItem
                label="À payer"
                helper="Fournisseurs pas encore réglés."
                value={stats.aPayer}
                color="error.main"
              />
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight={900}>Mouvements de caisse</Typography>
                <Typography color="text.secondary">
                  {visibleMovements.length} mouvement(s) affiché(s)
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                {PERIODS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    color={period === option.value ? 'primary' : 'default'}
                    variant={period === option.value ? 'filled' : 'outlined'}
                    onClick={() => setPeriod(option.value)}
                    sx={{ fontWeight: 800 }}
                  />
                ))}
              </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ mb: 2 }}>
              <TextField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher opération ou origine"
                size="small"
                sx={{ flex: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: { xs: 0.5, md: 0 } }}>
                {MOVEMENT_TYPES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    color={movementType === option.value ? 'primary' : 'default'}
                    variant={movementType === option.value ? 'filled' : 'outlined'}
                    onClick={() => setMovementType(option.value)}
                    sx={{ fontWeight: 800, flexShrink: 0 }}
                  />
                ))}
              </Stack>
            </Stack>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : visibleMovements.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Aucun mouvement trouvé pour cette sélection.
              </Alert>
            ) : isMobile ? (
              <Stack spacing={1.25}>
                {visibleMovements.map((movement) => (
                  <MovementMobileCard key={movement.id_mouvement} movement={movement} />
                ))}
              </Stack>
            ) : (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Opération</TableCell>
                      <TableCell>Origine</TableCell>
                      <TableCell align="right">Montant</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleMovements.map((movement) => (
                      <MovementRow key={movement.id_mouvement} movement={movement} />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function MainBalanceCard({ value }) {
  const amount = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(toNumber(value));

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 4,
        color: 'white',
        background: 'linear-gradient(135deg, #159d8f, #087568)',
        boxShadow: '0 22px 52px rgba(8, 117, 104, 0.22)',
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, md: 3.25 }, '&:last-child': { pb: { xs: 2.5, md: 3.25 } } }}>
        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.78)', fontWeight: 900, letterSpacing: 1 }}>
          Total disponible
        </Typography>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
          <Typography
            component="span"
            sx={{
              fontSize: { xs: '3.1rem', sm: '3.8rem', md: '4.5rem' },
              lineHeight: 0.95,
              fontWeight: 950,
              letterSpacing: '-0.06em',
              color: '#ffffff',
              textShadow: '0 8px 22px rgba(0, 0, 0, 0.16)',
            }}
          >
            {amount}
          </Typography>
          <Typography
            component="span"
            sx={{
              fontSize: { xs: '1.15rem', sm: '1.35rem' },
              fontWeight: 950,
              color: 'rgba(255, 255, 255, 0.92)',
            }}
          >
            MAD
          </Typography>
        </Stack>
        <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, maxWidth: 560 }}>
          Argent disponible maintenant: cash en caisse + LC disponibles. C'est le chiffre principal à regarder.
        </Typography>
      </CardContent>
    </Card>
  );
}

function SmallMoneyCard({ label, value, helper, icon, tone }) {
  const colors = {
    success: { bg: '#ecfdf3', color: '#047857' },
    info: { bg: '#eff6ff', color: '#2563eb' },
  }[tone] || { bg: '#f8fafc', color: '#475569' };

  return (
    <Card variant="outlined" sx={{ height: '100%', borderRadius: 4 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900, letterSpacing: 1 }}>
              {label}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 950, mt: 1, letterSpacing: '-0.05em' }}>
              {formatMontant(value, { useCompactNotation: false, maximumFractionDigits: 0 })}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              {helper}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: 'grid',
              placeItems: 'center',
              bgcolor: colors.bg,
              color: colors.color,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function WatchItem({ label, helper, value, color }) {
  return (
    <Box sx={{ p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: '#fffdfa' }}>
      <Stack direction={{ xs: 'column', sm: 'row', lg: 'column', xl: 'row' }} justifyContent="space-between" spacing={1.25}>
        <Box>
          <Typography fontWeight={900}>{label}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{helper}</Typography>
        </Box>
        <Typography fontWeight={950} color={color} sx={{ whiteSpace: 'nowrap' }}>
          {formatMontant(value, { useCompactNotation: false, maximumFractionDigits: 0 })}
        </Typography>
      </Stack>
    </Box>
  );
}

function MovementRow({ movement }) {
  const isEntry = movement.type_mouvement === 'ENTREE';

  return (
    <TableRow hover>
      <TableCell>{formatDate(movement.date_mouvement, true)}</TableCell>
      <TableCell>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          {isEntry ? <TrendingUpIcon color="success" fontSize="small" /> : <TrendingDownIcon color="error" fontSize="small" />}
          <Box>
            <Typography fontWeight={900}>{getMovementLabel(movement)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {isEntry ? 'Entrée' : 'Sortie'}
            </Typography>
          </Box>
        </Stack>
      </TableCell>
      <TableCell>{getMovementOrigin(movement)}</TableCell>
      <TableCell align="right">
        <Typography fontWeight={950} color={isEntry ? 'success.main' : 'error.main'} sx={{ whiteSpace: 'nowrap' }}>
          {formatSignedAmount(movement)}
        </Typography>
      </TableCell>
    </TableRow>
  );
}

function MovementMobileCard({ movement }) {
  const isEntry = movement.type_mouvement === 'ENTREE';

  return (
    <Box sx={{ p: 1.75, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Stack direction="row" justifyContent="space-between" spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={950}>{getMovementLabel(movement)}</Typography>
          <Typography color="text.secondary" variant="body2">
            {formatDate(movement.date_mouvement)} · {getMovementOrigin(movement)}
          </Typography>
        </Box>
        <Typography fontWeight={950} color={isEntry ? 'success.main' : 'error.main'} sx={{ whiteSpace: 'nowrap' }}>
          {formatSignedAmount(movement)}
        </Typography>
      </Stack>
      <Divider sx={{ mt: 1.5 }} />
    </Box>
  );
}

export default Caisse;
