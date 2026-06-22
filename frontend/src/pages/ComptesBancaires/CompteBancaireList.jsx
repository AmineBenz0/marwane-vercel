import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  MenuItem,
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
  AccountBalance as BankIcon,
  Add as AddIcon,
  Download as DownloadIcon,
  ReceiptLong as RegisterIcon,
  Search as SearchIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import compteBancaireService from '../../services/compteBancaireService';
import lettreCreditService from '../../services/lettreCreditService';
import useNotification from '../../hooks/useNotification';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { formatMontant } from '../../utils/formatNumber';

const SOURCE_OPTIONS = [
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'lc', label: 'Lettre de crédit' },
  { value: 'autre', label: 'Autre' },
];

const SOURCE_LABELS = {
  virement: 'Virement',
  cheque: 'Chèque',
  lc: 'Lettre de crédit',
  initial: 'Solde initial',
  charge: 'Dépense',
  autre: 'Autre',
};

const parseAmount = (value) => Number(value || 0);

const formatDate = (value, withTime = false) => {
  if (!value) return '-';
  const date = new Date(value);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
};

const getSignedAmount = (movement) => {
  const amount = parseAmount(movement.montant);
  return movement.type_mouvement === 'SORTIE' ? -amount : amount;
};

const formatSignedAmount = (movement) => {
  const signed = getSignedAmount(movement);
  const sign = signed > 0 ? '+' : signed < 0 ? '-' : '';
  return `${sign}${formatMontant(Math.abs(signed), { useCompactNotation: false, maximumFractionDigits: 0 })}`;
};

const getMovementTitle = (movement) => {
  if (movement.notes) return movement.notes;
  return SOURCE_LABELS[movement.source] || movement.source || 'Mouvement bancaire';
};

function CompteBancaireList() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const notification = useNotification();

  const [comptes, setComptes] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);
  const [openMovement, setOpenMovement] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');

  const [newCompte, setNewCompte] = useState(getInitialCompteForm());
  const [movementForm, setMovementForm] = useState(getInitialMovementForm());

  const comptesMap = useMemo(() => {
    const map = new Map();
    comptes.forEach((compte) => {
      map.set(compte.id_compte, compte);
    });
    return map;
  }, [comptes]);

  const totalSolde = useMemo(() => {
    return comptes.reduce((sum, compte) => sum + parseAmount(compte.solde_actuel), 0);
  }, [comptes]);

  const sortedMovements = useMemo(() => {
    return [...mouvements].sort((a, b) => new Date(b.date_mouvement) - new Date(a.date_mouvement));
  }, [mouvements]);

  const visibleMovements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return sortedMovements.filter((movement) => {
      const compte = comptesMap.get(movement.id_compte);
      const accountMatches = accountFilter === 'all' || String(movement.id_compte) === String(accountFilter);
      const searchMatches = !normalizedSearch || [
        compte?.nom_banque,
        compte?.numero_compte,
        movement.reference,
        movement.notes,
        SOURCE_LABELS[movement.source],
        movement.source,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return accountMatches && searchMatches;
    });
  }, [accountFilter, comptesMap, search, sortedMovements]);

  const latestMovement = sortedMovements[0] || null;

  const fetchData = async () => {
    setLoading(true);
    try {
      const comptesData = await compteBancaireService.getComptes();
      const safeComptes = Array.isArray(comptesData) ? comptesData : [];
      setComptes(safeComptes);

      if (safeComptes.length === 0) {
        setMouvements([]);
        return;
      }

      const movementGroups = await Promise.all(
        safeComptes.map(async (compte) => {
          try {
            const data = await compteBancaireService.getMouvements(compte.id_compte, { skip: 0, limit: 80 });
            return (Array.isArray(data) ? data : []).map((movement) => ({
              ...movement,
              compte_nom: compte.nom_banque,
              compte_numero: compte.numero_compte,
            }));
          } catch (error) {
            console.error(`Erreur mouvements compte ${compte.id_compte}:`, error);
            return [];
          }
        })
      );

      setMouvements(movementGroups.flat());
    } catch (error) {
      console.error('Erreur chargement comptes bancaires:', error);
      notification.error('Erreur lors du chargement des comptes bancaires');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenMovement = (compte = null) => {
    setMovementForm(getInitialMovementForm(compte?.id_compte));
    setOpenMovement(true);
  };

  const handleAddCompte = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await compteBancaireService.createCompte({
        nom_banque: newCompte.nom_banque.trim(),
        numero_compte: newCompte.numero_compte.trim(),
        solde_initial: parseAmount(newCompte.solde_initial),
      });
      notification.success('Compte bancaire ajouté');
      setOpenAdd(false);
      setNewCompte(getInitialCompteForm());
      await fetchData();
    } catch (error) {
      console.error('Erreur création compte bancaire:', error);
      notification.error(error?.message || 'Erreur lors de la création du compte');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMovement = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (movementForm.source === 'lc' && movementForm.id_lc) {
        await lettreCreditService.verserBanque(movementForm.id_lc, {
          id_compte: Number(movementForm.id_compte),
          notes: movementForm.notes.trim() || null,
        });
      } else {
        await compteBancaireService.createMouvement(movementForm.id_compte, {
          type_mouvement: movementForm.type_mouvement,
          source: movementForm.source,
          montant: parseAmount(movementForm.montant),
          reference: movementForm.reference.trim() || null,
          notes: movementForm.notes.trim() || null,
        });
      }
      notification.success('Mouvement bancaire enregistré');
      setOpenMovement(false);
      await fetchData();
    } catch (error) {
      console.error('Erreur mouvement bancaire:', error);
      notification.error(error?.message || "Erreur lors de l'enregistrement du mouvement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    if (visibleMovements.length === 0) {
      notification.warning('Aucun mouvement à exporter');
      return;
    }

    exportToExcelAdvanced(
      visibleMovements.map((movement) => ({
        date: movement.date_mouvement,
        compte: movement.compte_nom || comptesMap.get(movement.id_compte)?.nom_banque || '-',
        operation: getMovementTitle(movement),
        type: movement.type_mouvement === 'ENTREE' ? 'Entrée' : 'Sortie',
        source: SOURCE_LABELS[movement.source] || movement.source || '-',
        reference: movement.reference || '',
        montant: getSignedAmount(movement),
      })),
      [
        { id: 'date', label: 'Date' },
        { id: 'compte', label: 'Compte' },
        { id: 'operation', label: 'Opération' },
        { id: 'type', label: 'Sens' },
        { id: 'source', label: 'Type' },
        { id: 'reference', label: 'Référence' },
        { id: 'montant', label: 'Montant' },
      ],
      `historique_bancaire_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
      'Historique bancaire',
      {
        date: (value) => formatDate(value, true),
        montant: (value) => Number(value || 0),
      }
    );
  };

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
            Comptes bancaires
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
            Voir l'argent disponible en banque, par compte, avec les derniers mouvements visibles directement.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button
            variant="outlined"
            startIcon={!isMobile && <AddIcon />}
            onClick={() => handleOpenMovement()}
            disabled={comptes.length === 0}
          >
            Ajouter mouvement
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile && <BankIcon />}
            onClick={() => setOpenAdd(true)}
          >
            Nouveau compte
          </Button>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr 1fr' },
          gap: 2,
          mb: 2.5,
        }}
      >
        <BigBalanceCard value={totalSolde} comptesCount={comptes.length} />
        <SummaryCard
          label="Comptes actifs"
          value={comptes.length}
          helper={comptes.length === 0 ? 'Aucun compte enregistré' : comptes.map((compte) => compte.nom_banque).join(', ')}
          icon={<BankIcon />}
          tone="info"
        />
        <SummaryCard
          label="Dernier mouvement"
          value={latestMovement ? formatSignedAmount(latestMovement) : '-'}
          helper={latestMovement ? `${latestMovement.compte_nom || '-'} · ${formatDate(latestMovement.date_mouvement)}` : 'Aucun mouvement'}
          icon={latestMovement?.type_mouvement === 'SORTIE' ? <TrendingDownIcon /> : <TrendingUpIcon />}
          tone={latestMovement?.type_mouvement === 'SORTIE' ? 'error' : 'success'}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : comptes.length === 0 ? (
        <EmptyBankState onCreate={() => setOpenAdd(true)} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.9fr) minmax(0, 1.35fr)' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Card variant="outlined" sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>Mes comptes</Typography>
                  <Typography color="text.secondary">Le solde de chaque banque reste visible.</Typography>
                </Box>
              </Stack>

              <Stack spacing={1.5}>
                {comptes.map((compte) => (
                  <AccountCard
                    key={compte.id_compte}
                    compte={compte}
                    movementsCount={mouvements.filter((movement) => movement.id_compte === compte.id_compte).length}
                    onMovement={() => handleOpenMovement(compte)}
                  />
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>Historique bancaire</Typography>
                  <Typography color="text.secondary">
                    {visibleMovements.length} mouvement(s) affiché(s)
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={!isMobile && <DownloadIcon />}
                  onClick={handleExport}
                  disabled={visibleMovements.length === 0}
                >
                  Exporter
                </Button>
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ mb: 2 }}>
                <TextField
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher mouvement, référence..."
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
                <TextField
                  select
                  size="small"
                  label="Compte"
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value)}
                  sx={{ minWidth: { md: 210 } }}
                >
                  <MenuItem value="all">Tous les comptes</MenuItem>
                  {comptes.map((compte) => (
                    <MenuItem key={compte.id_compte} value={String(compte.id_compte)}>
                      {compte.nom_banque}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              {visibleMovements.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Aucun mouvement bancaire trouvé.
                </Alert>
              ) : isMobile ? (
                <Stack spacing={1.25}>
                  {visibleMovements.map((movement) => (
                    <MovementMobileCard key={movement.id_mouvement} movement={movement} />
                  ))}
                </Stack>
              ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: 820 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Compte</TableCell>
                        <TableCell>Opération</TableCell>
                        <TableCell>Référence</TableCell>
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
      )}

      <AddAccountDialog
        open={openAdd}
        form={newCompte}
        setForm={setNewCompte}
        submitting={submitting}
        onClose={() => !submitting && setOpenAdd(false)}
        onSubmit={handleAddCompte}
      />

      <MovementDialog
        open={openMovement}
        comptes={comptes}
        form={movementForm}
        setForm={setMovementForm}
        submitting={submitting}
        onClose={() => !submitting && setOpenMovement(false)}
        onSubmit={handleAddMovement}
      />
    </Box>
  );
}

function getInitialCompteForm() {
  return {
    nom_banque: '',
    numero_compte: '',
    solde_initial: '',
  };
}

function getInitialMovementForm(idCompte = '') {
  return {
    id_compte: idCompte ? String(idCompte) : '',
    type_mouvement: 'ENTREE',
    source: 'virement',
    montant: '',
    reference: '',
    notes: '',
    id_lc: '',
  };
}

function BigBalanceCard({ value, comptesCount }) {
  const amount = parseAmount(value);
  const formattedAmount = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
  const helper = comptesCount === 0
    ? 'Ajoutez votre premier compte pour commencer le suivi bancaire.'
    : `Somme de ${comptesCount} compte(s). Les LC déposées en banque apparaissent ici après versement.`;

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
      <CardContent sx={{ p: { xs: 2.5, md: 3 }, '&:last-child': { pb: { xs: 2.5, md: 3 } } }}>
        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.78)', fontWeight: 900, letterSpacing: 1 }}>
          Solde bancaire total
        </Typography>
        <Stack
          direction="row"
          alignItems="baseline"
          spacing={1}
          sx={{
            mt: 1,
            minWidth: 0,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: { xs: '3rem', sm: '3.5rem', md: '3.9rem' },
              lineHeight: 0.95,
              fontWeight: 950,
              letterSpacing: '-0.045em',
              color: '#ffffff',
              textShadow: '0 8px 22px rgba(0, 0, 0, 0.16)',
            }}
          >
            {formattedAmount}
          </Typography>
          <Typography
            component="span"
            sx={{
              fontSize: { xs: '1.15rem', sm: '1.35rem' },
              lineHeight: 1,
              fontWeight: 950,
              letterSpacing: 0.5,
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            MAD
          </Typography>
        </Stack>
        <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, maxWidth: 420 }}>
          {helper}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, helper, icon, tone }) {
  const colors = {
    info: { bg: '#eff6ff', color: '#2563eb' },
    success: { bg: '#ecfdf3', color: '#047857' },
    error: { bg: '#fef2f2', color: '#dc2626' },
  }[tone] || { bg: '#f8fafc', color: '#475569' };

  return (
    <Card variant="outlined" sx={{ height: '100%', borderRadius: 4 }}>
      <CardContent sx={{ height: '100%' }}>
        <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ height: '100%' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900, letterSpacing: 1 }}>
              {label}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 950, mt: 1, letterSpacing: '-0.05em' }}>
              {value}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }} noWrap>
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

function AccountCard({ compte, movementsCount, onMovement }) {
  return (
    <Box
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: '#fffdfa',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row', lg: 'column', xl: 'row' }} justifyContent="space-between" spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={950} sx={{ wordBreak: 'break-word' }}>
            {compte.nom_banque}
          </Typography>
          <Typography color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {compte.numero_compte}
          </Typography>
        </Box>
        <Typography variant="h6" fontWeight={950} color="primary.main" sx={{ flexShrink: 0 }}>
          {formatMontant(parseAmount(compte.solde_actuel), { useCompactNotation: false, maximumFractionDigits: 0 })}
        </Typography>
      </Stack>

      <Divider sx={{ my: 1.75 }} />

      <Stack direction={{ xs: 'column', sm: 'row', lg: 'column', xl: 'row' }} alignItems={{ xs: 'stretch', sm: 'center', lg: 'stretch', xl: 'center' }} justifyContent="space-between" spacing={1.25}>
        <Chip
          label={`${movementsCount} mouvement(s) chargé(s)`}
          size="small"
          variant="outlined"
          sx={{ alignSelf: { xs: 'flex-start', sm: 'center', lg: 'flex-start', xl: 'center' }, fontWeight: 800 }}
        />
        <Button variant="contained" size="small" onClick={onMovement} sx={{ borderRadius: 999, px: 2.25 }}>
          Mouvement
        </Button>
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
        <Typography fontWeight={800}>{movement.compte_nom || '-'}</Typography>
        <Typography variant="caption" color="text.secondary">{movement.compte_numero || ''}</Typography>
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          {isEntry ? <TrendingUpIcon color="success" fontSize="small" /> : <TrendingDownIcon color="error" fontSize="small" />}
          <Box>
            <Typography fontWeight={900}>{getMovementTitle(movement)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {SOURCE_LABELS[movement.source] || movement.source || '-'} · {isEntry ? 'Entrée' : 'Sortie'}
            </Typography>
          </Box>
        </Stack>
      </TableCell>
      <TableCell>{movement.reference || '-'}</TableCell>
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
          <Typography fontWeight={950}>{getMovementTitle(movement)}</Typography>
          <Typography color="text.secondary" variant="body2">
            {movement.compte_nom || '-'} · {formatDate(movement.date_mouvement)}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            {movement.reference || SOURCE_LABELS[movement.source] || movement.source || '-'}
          </Typography>
        </Box>
        <Typography fontWeight={950} color={isEntry ? 'success.main' : 'error.main'} sx={{ whiteSpace: 'nowrap' }}>
          {formatSignedAmount(movement)}
        </Typography>
      </Stack>
    </Box>
  );
}

function EmptyBankState({ onCreate }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4 }}>
      <CardContent sx={{ minHeight: 260, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box sx={{ maxWidth: 480 }}>
          <RegisterIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h5" fontWeight={900}>Aucun compte bancaire</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 2.5 }}>
            Ajoutez le premier compte pour suivre les virements, chèques, dépôts LC et frais bancaires.
          </Typography>
          <Button variant="contained" startIcon={<BankIcon />} onClick={onCreate}>
            Nouveau compte
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

function AddAccountDialog({ open, form, setForm, submitting, onClose, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 900 }}>Nouveau compte bancaire</DialogTitle>
      <DialogContent dividers>
        <Box component="form" id="bank-account-form" onSubmit={onSubmit}>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Nom de la banque"
              fullWidth
              required
              value={form.nom_banque}
              onChange={(event) => setForm({ ...form, nom_banque: event.target.value })}
            />
            <TextField
              label="Numéro de compte / RIB"
              fullWidth
              required
              value={form.numero_compte}
              onChange={(event) => setForm({ ...form, numero_compte: event.target.value })}
            />
            <TextField
              label="Solde actuel (MAD)"
              type="number"
              fullWidth
              value={form.solde_initial}
              onChange={(event) => setForm({ ...form, solde_initial: event.target.value })}
              inputProps={{ step: '0.01' }}
              helperText="Mettez 0 si vous voulez commencer sans solde."
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Annuler</Button>
        <Button
          type="submit"
          form="bank-account-form"
          variant="contained"
          disabled={submitting || !form.nom_banque.trim() || !form.numero_compte.trim()}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
        >
          Ajouter
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MovementDialog({ open, comptes, form, setForm, submitting, onClose, onSubmit }) {
  const [availableLcs, setAvailableLcs] = useState([]);
  const [loadingLcs, setLoadingLcs] = useState(false);

  useEffect(() => {
    if (open && form.source === 'lc') {
      const fetchLcs = async () => {
        setLoadingLcs(true);
        try {
          const lcs = await lettreCreditService.getAvailable();
          setAvailableLcs(lcs || []);
        } catch (error) {
          console.error('Erreur chargement LC disponibles:', error);
        } finally {
          setLoadingLcs(false);
        }
      };
      fetchLcs();
    }
  }, [open, form.source]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>Ajouter un mouvement bancaire</DialogTitle>
      <DialogContent dividers>
        <Box component="form" id="bank-movement-form" onSubmit={onSubmit}>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              select
              label="Compte bancaire"
              fullWidth
              required
              value={form.id_compte}
              onChange={(event) => setForm({ ...form, id_compte: event.target.value })}
            >
              {comptes.map((compte) => (
                <MenuItem key={compte.id_compte} value={String(compte.id_compte)}>
                  {compte.nom_banque} - {formatMontant(parseAmount(compte.solde_actuel), { useCompactNotation: false, maximumFractionDigits: 0 })}
                </MenuItem>
              ))}
            </TextField>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                select
                label="Sens"
                fullWidth
                value={form.type_mouvement}
                onChange={(event) => setForm({ ...form, type_mouvement: event.target.value })}
                disabled={form.source === 'lc'}
              >
                <MenuItem value="ENTREE">Entrée</MenuItem>
                <MenuItem value="SORTIE">Sortie</MenuItem>
              </TextField>
              <TextField
                select
                label="Type"
                fullWidth
                value={form.source}
                onChange={(event) => {
                  const newSource = event.target.value;
                  const updatedForm = { ...form, source: newSource };
                  if (newSource === 'lc') {
                    updatedForm.type_mouvement = 'ENTREE';
                    updatedForm.reference = '';
                    updatedForm.id_lc = '';
                    updatedForm.montant = '';
                  }
                  setForm(updatedForm);
                }}
              >
                {SOURCE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </TextField>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Montant (MAD)"
                type="number"
                fullWidth
                required
                value={form.montant}
                onChange={(event) => setForm({ ...form, montant: event.target.value })}
                inputProps={{ min: 0, step: '0.01' }}
                disabled={form.source === 'lc'}
                helperText={form.source === 'lc' ? 'Le montant est défini par la lettre de crédit sélectionnée' : ''}
              />
              {form.source === 'lc' ? (
                <TextField
                  select
                  label="Lettre de crédit"
                  fullWidth
                  required
                  value={form.reference}
                  onChange={(event) => {
                    const ref = event.target.value;
                    const selectedLc = availableLcs.find(lc => lc.numero_reference === ref);
                    setForm({
                      ...form,
                      reference: ref,
                      id_lc: selectedLc ? selectedLc.id_lc : '',
                      montant: selectedLc ? String(selectedLc.montant) : '',
                    });
                  }}
                  disabled={loadingLcs}
                  helperText={loadingLcs ? 'Chargement des LC...' : availableLcs.length === 0 ? 'Aucune LC disponible' : ''}
                >
                  <MenuItem value="">
                    <em>Sélectionner une LC</em>
                  </MenuItem>
                  {availableLcs.map((lc) => (
                    <MenuItem key={lc.id_lc} value={lc.numero_reference}>
                      {lc.numero_reference} ({formatMontant(parseAmount(lc.montant), { useCompactNotation: false, maximumFractionDigits: 0 })} MAD) {lc.detenteur_nom ? `· ${lc.detenteur_nom}` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  label="Référence"
                  fullWidth
                  placeholder="N° chèque, virement, LC..."
                  value={form.reference}
                  onChange={(event) => setForm({ ...form, reference: event.target.value })}
                />
              )}
            </Box>

            <TextField
              label="Note simple"
              fullWidth
              multiline
              minRows={2}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Annuler</Button>
        <Button
          type="submit"
          form="bank-movement-form"
          variant="contained"
          disabled={submitting || !form.id_compte || !form.montant || Number(form.montant) <= 0 || (form.source === 'lc' && !form.reference)}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
        >
          Enregistrer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CompteBancaireList;
