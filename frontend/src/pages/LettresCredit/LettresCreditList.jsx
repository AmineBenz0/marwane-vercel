import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AccountBalance as BankIcon,
  Add as AddIcon,
  AssignmentTurnedIn as UsedIcon,
  Business as SupplierIcon,
  Download as DownloadIcon,
  EventAvailable as AvailableIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import useNotification from '../../hooks/useNotification';
import { get } from '../../services/api';
import lettreCreditService from '../../services/lettreCreditService';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { formatMontant } from '../../utils/formatNumber';
import LCFormModal from './LCFormModal';

const FILTERS = [
  { value: 'disponibles', label: 'Disponibles' },
  { value: 'utilisees', label: 'Utilisées' },
  { value: 'toutes', label: 'Toutes' },
];

const parseMoney = (value) => Number(value || 0);

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('fr-FR');
};

const isActiveLc = (lc) => lc?.statut === 'active';
const isUsedLc = (lc) => !isActiveLc(lc);
const canUseLc = (lc) => isActiveLc(lc) && Boolean(lc?.est_disponible);

const getLcState = (lc) => {
  if (canUseLc(lc)) {
    return { label: 'Disponible', tone: 'success' };
  }

  if (isActiveLc(lc)) {
    return { label: `Le ${formatDate(lc.date_disponibilite)}`, tone: 'warning' };
  }

  return { label: 'Utilisée', tone: 'default' };
};

function LettresCreditList() {
  const navigate = useNavigate();
  const notification = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [lettresCredit, setLettresCredit] = useState([]);
  const [comptes, setComptes] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('disponibles');
  const [actionDialog, setActionDialog] = useState(null);
  const [targetId, setTargetId] = useState('');
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lcData, compteData, fournisseurData] = await Promise.all([
        lettreCreditService.getAll({ limit: 1000 }),
        get('/comptes-bancaires'),
        get('/fournisseurs', { params: { limit: 1000, est_actif: true } }),
      ]);
      setLettresCredit(Array.isArray(lcData) ? lcData : []);
      setComptes(Array.isArray(compteData) ? compteData : []);
      setFournisseurs(Array.isArray(fournisseurData) ? fournisseurData : []);
    } catch (error) {
      console.error('Erreur chargement LC:', error);
      notification.error(error?.message || 'Erreur lors du chargement des LC');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const active = lettresCredit.filter(isActiveLc);
    const available = lettresCredit.filter(canUseLc);
    const future = active.filter((lc) => !lc.est_disponible);
    const used = lettresCredit.filter(isUsedLc);

    return {
      activeCount: active.length,
      availableCount: available.length,
      futureCount: future.length,
      usedCount: used.length,
      totalAvailable: available.reduce((sum, lc) => sum + parseMoney(lc.montant), 0),
      totalUsed: used.reduce((sum, lc) => sum + parseMoney(lc.montant), 0),
    };
  }, [lettresCredit]);

  const filteredLcs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return lettresCredit
      .filter((lc) => {
        if (activeFilter === 'disponibles') return isActiveLc(lc);
        if (activeFilter === 'utilisees') return isUsedLc(lc);
        return true;
      })
      .filter((lc) => {
        if (!normalizedSearch) return true;
        return [
          lc.numero_reference,
          lc.numero_serie,
          lc.detenteur_nom,
          lc.banque_emettrice,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => new Date(b.date_disponibilite || 0) - new Date(a.date_disponibilite || 0));
  }, [activeFilter, lettresCredit, searchTerm]);

  const openActionDialog = (type, lc) => {
    setActionDialog({ type, lc });
    setTargetId('');
    setNotes('');
  };

  const closeActionDialog = () => {
    if (actionLoading) return;
    setActionDialog(null);
    setTargetId('');
    setNotes('');
  };

  const handleConfirmAction = async () => {
    if (!actionDialog || !targetId) return;

    setActionLoading(true);
    try {
      const payloadNotes = notes.trim() || null;
      if (actionDialog.type === 'bank') {
        await lettreCreditService.verserBanque(actionDialog.lc.id_lc, {
          id_compte: Number(targetId),
          notes: payloadNotes,
        });
        notification.success('LC versée en banque');
      } else {
        await lettreCreditService.payerFournisseur(actionDialog.lc.id_lc, {
          id_fournisseur: Number(targetId),
          date_cession: format(new Date(), 'yyyy-MM-dd'),
          notes: payloadNotes,
        });
        notification.success('Fournisseur payé avec la LC');
      }

      closeActionDialog();
      fetchData();
    } catch (error) {
      console.error('Erreur action LC:', error);
      notification.error(error?.message || 'Action impossible pour cette LC');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = () => {
    if (filteredLcs.length === 0) {
      notification.warning('Aucune LC à exporter');
      return;
    }

    exportToExcelAdvanced(
      filteredLcs,
      [
        { id: 'numero_reference', label: 'Référence' },
        { id: 'detenteur_nom', label: 'Client' },
        { id: 'banque_emettrice', label: 'Banque' },
        { id: 'montant', label: 'Montant' },
        { id: 'date_disponibilite', label: 'Date disponible' },
        { id: 'etat_export', label: 'État' },
      ],
      `lettres-credit-${format(new Date(), 'yyyy-MM-dd')}`,
      'LC',
      {
        montant: (value) => parseMoney(value),
        date_disponibilite: (value) => formatDate(value),
        etat_export: (_, row) => getLcState(row).label,
      }
    );
  };

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 900, letterSpacing: '-0.04em' }}>
            Lettres de crédit
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 720, lineHeight: 1.6 }}>
            Les LC disponibles sont comptées dans la caisse jusqu'à leur versement en banque ou leur utilisation pour payer un fournisseur.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={filteredLcs.length === 0}
          >
            Exporter
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Nouvelle LC
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <SummaryCard
            title="Valeur disponible"
            value={formatMontant(stats.totalAvailable, { useCompactNotation: false })}
            helper={`${stats.availableCount} LC utilisable(s) maintenant`}
            tone="success"
            icon={<AvailableIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <SummaryCard
            title="LC disponibles"
            value={stats.activeCount}
            helper={stats.futureCount > 0 ? `${stats.futureCount} à venir` : 'Prêtes à suivre'}
            tone="info"
            icon={<BankIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <SummaryCard
            title="Déjà utilisées"
            value={stats.usedCount}
            helper={formatMontant(stats.totalUsed, { useCompactNotation: false })}
            tone="neutral"
            icon={<UsedIcon />}
          />
        </Grid>
      </Grid>

      <Card
        sx={{
          mb: 3,
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.06)',
        }}
      >
        <CardContent>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <TextField
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher référence, client ou banque"
              sx={{ flex: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />

            <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', flexShrink: 0, pb: { xs: 0.5, lg: 0 } }}>
              {FILTERS.map((filter) => (
                <Chip
                  key={filter.value}
                  label={`${filter.label} (${getFilterCount(filter.value, lettresCredit)})`}
                  color={activeFilter === filter.value ? 'primary' : 'default'}
                  variant={activeFilter === filter.value ? 'filled' : 'outlined'}
                  onClick={() => setActiveFilter(filter.value)}
                  sx={{ px: 0.5, flexShrink: 0, fontWeight: 800 }}
                />
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card
        sx={{
          borderRadius: 5,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            p: { xs: 2, md: 3 },
            bgcolor: 'rgba(248, 250, 252, 0.92)',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                Registre des LC
              </Typography>
              <Typography color="text.secondary">
                {filteredLcs.length} résultat(s), avec le montant visible sur chaque LC.
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
              Une LC active reste dans la caisse. Dès qu'elle est versée ou utilisée, elle passe en utilisée.
            </Typography>
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : filteredLcs.length === 0 ? (
            <EmptyLcState activeFilter={activeFilter} onCreate={() => setIsCreateModalOpen(true)} />
          ) : (
            <Grid container spacing={2}>
              {filteredLcs.map((lc) => (
                <Grid item xs={12} lg={6} key={lc.id_lc}>
                  <LcRegisterCard
                    lc={lc}
                    isMobile={isMobile}
                    onView={() => navigate(`/lettres-credit/${lc.id_lc}`)}
                    onBank={() => openActionDialog('bank', lc)}
                    onSupplier={() => openActionDialog('supplier', lc)}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      </Card>

      <ActionDialog
        open={Boolean(actionDialog)}
        actionDialog={actionDialog}
        comptes={comptes}
        fournisseurs={fournisseurs}
        targetId={targetId}
        setTargetId={setTargetId}
        notes={notes}
        setNotes={setNotes}
        loading={actionLoading}
        onClose={closeActionDialog}
        onConfirm={handleConfirmAction}
      />

      <LCFormModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchData}
      />
    </Box>
  );
}

function getFilterCount(filter, lcs) {
  if (filter === 'disponibles') return lcs.filter(isActiveLc).length;
  if (filter === 'utilisees') return lcs.filter(isUsedLc).length;
  return lcs.length;
}

function SummaryCard({ title, value, helper, icon, tone }) {
  const palette = {
    success: { bg: '#ecfdf3', color: '#047857' },
    info: { bg: '#eff6ff', color: '#2563eb' },
    neutral: { bg: '#f8fafc', color: '#475569' },
    warning: { bg: '#fff7ed', color: '#c2410c' },
  }[tone] || { bg: '#f8fafc', color: '#475569' };

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 18px 42px rgba(15, 23, 42, 0.06)',
      }}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900, letterSpacing: 1 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 900, mt: 1, letterSpacing: '-0.04em' }}>
              {value}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
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
              bgcolor: palette.bg,
              color: palette.color,
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

function LcRegisterCard({ lc, isMobile, onView, onBank, onSupplier }) {
  const state = getLcState(lc);
  const usable = canUseLc(lc);

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 4,
        border: '1px solid',
        borderColor: usable ? 'rgba(16, 185, 129, 0.36)' : 'divider',
        background: usable ? 'linear-gradient(135deg, #ffffff, #f0fdf4)' : undefined,
        bgcolor: usable ? undefined : 'background.paper',
        boxShadow: '0 16px 42px rgba(15, 23, 42, 0.05)',
      }}
    >
      <CardContent>
        <Stack spacing={2.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
                <Chip
                  label={state.label}
                  color={state.tone}
                  size="small"
                  sx={{ fontWeight: 900 }}
                />
                {lc.numero_serie && (
                  <Typography variant="caption" color="text.secondary">
                    Série {lc.numero_serie}
                  </Typography>
                )}
              </Stack>
              <Typography variant="h6" sx={{ fontWeight: 900, wordBreak: 'break-word' }}>
                {lc.numero_reference}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.25 }}>
                {lc.detenteur_nom || 'Client non précisé'}
              </Typography>
            </Box>

            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>
                Montant
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 950, letterSpacing: '-0.04em' }}>
                {formatMontant(parseMoney(lc.montant), { useCompactNotation: false })}
              </Typography>
            </Box>
          </Stack>

          <Divider />

          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <InfoBlock label="Banque" value={lc.banque_emettrice || '-'} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <InfoBlock label="Disponible le" value={formatDate(lc.date_disponibilite)} />
            </Grid>
          </Grid>

          {isActiveLc(lc) && !usable && (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Cette LC est enregistrée, mais pas encore utilisable.
            </Alert>
          )}

          <Stack
            direction={{ xs: 'column', sm: isMobile ? 'column' : 'row' }}
            spacing={1}
            sx={{ pt: 0.5 }}
          >
            {isActiveLc(lc) && (
              <>
                <Tooltip title={usable ? '' : 'La date de disponibilité n’est pas encore atteinte'}>
                  <span>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<BankIcon />}
                      onClick={onBank}
                      disabled={!usable}
                      sx={{ minHeight: 44 }}
                    >
                      Verser banque
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title={usable ? '' : 'La date de disponibilité n’est pas encore atteinte'}>
                  <span>
                    <Button
                      fullWidth
                      variant="outlined"
                      color="warning"
                      startIcon={<SupplierIcon />}
                      onClick={onSupplier}
                      disabled={!usable}
                      sx={{ minHeight: 44 }}
                    >
                      Payer fournisseur
                    </Button>
                  </span>
                </Tooltip>
              </>
            )}
            <Button
              fullWidth
              variant={isActiveLc(lc) ? 'text' : 'outlined'}
              startIcon={<ViewIcon />}
              onClick={onView}
              sx={{ minHeight: 44 }}
            >
              Voir détail
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function InfoBlock({ label, value }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 3,
        bgcolor: 'rgba(248, 250, 252, 0.9)',
        border: '1px solid',
        borderColor: 'divider',
        height: '100%',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, mt: 0.25, wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Box>
  );
}

function EmptyLcState({ activeFilter, onCreate }) {
  const message = activeFilter === 'disponibles'
    ? 'Aucune LC disponible pour le moment.'
    : activeFilter === 'utilisees'
      ? 'Aucune LC utilisée pour le moment.'
      : 'Aucune LC trouvée.';

  return (
    <Box
      sx={{
        minHeight: 260,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        px: 2,
      }}
    >
      <Box sx={{ maxWidth: 460 }}>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>
          {message}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.25, mb: 3 }}>
          Ajoutez une LC dès qu’un client vous la remet. Elle sera comptée dans la caisse quand elle devient disponible.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
          Nouvelle LC
        </Button>
      </Box>
    </Box>
  );
}

function ActionDialog({
  open,
  actionDialog,
  comptes,
  fournisseurs,
  targetId,
  setTargetId,
  notes,
  setNotes,
  loading,
  onClose,
  onConfirm,
}) {
  const isBank = actionDialog?.type === 'bank';
  const lc = actionDialog?.lc;
  const options = isBank ? comptes : fournisseurs;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>
        {isBank ? 'Verser la LC en banque' : 'Payer un fournisseur'}
      </DialogTitle>
      <DialogContent dividers>
        {lc && (
          <Stack spacing={2.5}>
            <Box
              sx={{
                p: 2,
                borderRadius: 3,
                bgcolor: 'rgba(248, 250, 252, 0.92)',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>
                LC sélectionnée
              </Typography>
              <Typography sx={{ fontWeight: 900 }}>{lc.numero_reference}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 950, mt: 0.5 }}>
                {formatMontant(parseMoney(lc.montant), { useCompactNotation: false })}
              </Typography>
            </Box>

            <TextField
              select
              label={isBank ? 'Compte bancaire' : 'Fournisseur'}
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              fullWidth
              required
            >
              <MenuItem value="">
                <em>Choisir</em>
              </MenuItem>
              {options.map((option) => (
                <MenuItem
                  key={isBank ? option.id_compte : option.id_fournisseur}
                  value={isBank ? option.id_compte : option.id_fournisseur}
                >
                  {isBank ? option.nom_compte : option.nom_fournisseur}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Note optionnelle"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              fullWidth
              multiline
              minRows={2}
              placeholder="Ex: dépôt du matin, paiement aliment..."
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={!targetId || loading}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
        >
          Confirmer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default LettresCreditList;
