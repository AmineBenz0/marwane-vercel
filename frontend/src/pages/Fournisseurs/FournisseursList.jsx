import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Business as BusinessIcon,
  Edit as EditIcon,
  FileDownload as FileDownloadIcon,
  PersonAdd as PersonAddIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import * as yup from 'yup';
import { format } from 'date-fns';
import ModalForm from '../../components/ModalForm/ModalForm';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import { get, post, put } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import useNotification from '../../hooks/useNotification';

const fournisseurValidationSchema = yup.object().shape({
  nom_fournisseur: yup
    .string()
    .required('Le nom du fournisseur est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
});

const fournisseurFields = [
  {
    name: 'nom_fournisseur',
    label: 'Nom du fournisseur',
    type: 'text',
    placeholder: 'Ex. Coop Agadir',
    required: true,
    helperText: "Utilisez le nom que l'équipe reconnaît au quotidien.",
  },
];

function FournisseursList() {
  const notification = useNotification();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFournisseur, setEditingFournisseur] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [filters, setFilters] = useState({ nom: '' });

  const filterDefinitions = useMemo(() => [
    {
      id: 'nom',
      label: 'Rechercher un fournisseur',
      type: 'search',
      placeholder: 'Nom du fournisseur...',
      alwaysInline: true,
    },
  ], []);

  const fetchFournisseurs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        est_actif: true,
        limit: 1000,
      };
      if (filters.nom.trim()) {
        params.recherche = filters.nom.trim();
      }
      const data = await get('/fournisseurs', { params });
      setFournisseurs(data || []);
    } catch (err) {
      const message = err?.message || 'Une erreur est survenue lors du chargement des fournisseurs';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFournisseurs();
  }, [filters]);

  const handleFilterChange = (filterId, value) => {
    setFilters((prev) => ({ ...prev, [filterId]: value }));
  };

  const handleClearAllFilters = () => {
    setFilters({ nom: '' });
  };

  const handleCreate = () => {
    setEditingFournisseur(null);
    setFormError(null);
    setModalOpen(true);
  };

  const handleEdit = (fournisseur) => {
    setEditingFournisseur(fournisseur);
    setFormError(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!formLoading) {
      setModalOpen(false);
      setEditingFournisseur(null);
      setFormError(null);
    }
  };

  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);
    try {
      const payload = { ...data, est_actif: true };
      if (editingFournisseur) {
        await put(`/fournisseurs/${editingFournisseur.id_fournisseur}`, payload);
      } else {
        await post('/fournisseurs', payload);
      }
      setModalOpen(false);
      setEditingFournisseur(null);
      await fetchFournisseurs();
      notification.success(editingFournisseur ? 'Fournisseur modifié avec succès' : 'Fournisseur créé avec succès');
    } catch (err) {
      const message = err?.message || "Une erreur est survenue lors de l'enregistrement";
      setFormError(message);
      notification.error(message);
      throw err;
    } finally {
      setFormLoading(false);
    }
  };

  const handleViewProfile = (fournisseur) => {
    navigate(`/fournisseurs/${fournisseur.id_fournisseur}/profile`);
  };

  const handleExportExcel = async () => {
    try {
      await exportToExcelAdvanced(
        fournisseurs,
        [
          { id: 'nom_fournisseur', label: 'Nom du fournisseur' },
          { id: 'date_creation', label: 'Date de création' },
        ],
        `fournisseurs_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Fournisseurs',
        {
          date_creation: (value) => value ? new Date(value).toLocaleDateString('fr-FR') : '-',
        }
      );
    } catch (err) {
      setError("Une erreur est survenue lors de l'export Excel");
    }
  };

  const fournisseursSummary = useMemo(() => {
    const now = new Date();
    const createdThisMonth = fournisseurs.filter((fournisseur) => {
      if (!fournisseur.date_creation) return false;
      const createdAt = new Date(fournisseur.date_creation);
      return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    }).length;

    return {
      total: fournisseurs.length,
      createdThisMonth,
    };
  }, [fournisseurs]);

  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.5rem', md: '2.125rem' }, fontWeight: 900 }}>
            Fournisseurs
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Retrouvez rapidement un fournisseur, consultez son profil ou ajoutez-en un nouveau.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={!isMobile && <FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || fournisseurs.length === 0}
          >
            {isMobile ? 'Exporter' : 'Exporter Excel'}
          </Button>
          <Button variant="contained" startIcon={!isMobile && <AddIcon />} onClick={handleCreate}>
            {isMobile ? 'Créer' : 'Créer un fournisseur'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <SmartFilterPanel
        pageKey="fournisseurs"
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        maxInlineFilters={1}
        resultCount={fournisseurs.length}
        totalCount={fournisseurs.length}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 2.5 }}>
        <SummaryCard label="Fournisseurs" value={fournisseursSummary.total} icon={<BusinessIcon />} color="primary.main" />
        <SummaryCard label="Créés ce mois" value={fournisseursSummary.createdThisMonth} icon={<PersonAddIcon />} color="info.main" />
      </Box>

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton key={item} variant="rounded" height={150} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      ) : fournisseurs.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: 4, p: 4, textAlign: 'center' }}>
          <Typography variant="h6" fontWeight={900}>Aucun fournisseur trouvé</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Essayez une autre recherche ou créez un nouveau fournisseur.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            Nouveau fournisseur
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {fournisseurs.map((fournisseur) => (
            <Card
              key={fournisseur.id_fournisseur}
              variant="outlined"
              sx={{
                borderRadius: 4,
                transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 14px 34px rgba(15, 23, 42, 0.10)',
                  borderColor: 'primary.light',
                },
              }}
            >
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      variant="h6"
                      component="button"
                      onClick={() => handleViewProfile(fournisseur)}
                      sx={{
                        display: 'block',
                        width: '100%',
                        p: 0,
                        border: 0,
                        bgcolor: 'transparent',
                        color: 'text.primary',
                        font: 'inherit',
                        fontWeight: 900,
                        textAlign: 'left',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        '&:hover': { color: 'primary.main' },
                      }}
                    >
                      {fournisseur.nom_fournisseur}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                  <Button variant="contained" startIcon={<VisibilityIcon />} onClick={() => handleViewProfile(fournisseur)} fullWidth>
                    Profil
                  </Button>
                  <Button variant="outlined" startIcon={<EditIcon />} onClick={() => handleEdit(fournisseur)} fullWidth>
                    Modifier
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <ModalForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={{ nom_fournisseur: editingFournisseur?.nom_fournisseur || '' }}
        validationSchema={fournisseurValidationSchema}
        fields={fournisseurFields}
        title={editingFournisseur ? 'Modifier ce fournisseur' : 'Nouveau fournisseur'}
        submitLabel={editingFournisseur ? 'Enregistrer' : 'Créer le fournisseur'}
        loading={formLoading}
        errorMessage={formError}
      />
    </Box>
  );
}

function SummaryCard({ label, value, icon, color }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
              {label}
            </Typography>
            <Typography variant="h5" fontWeight={900}>{value}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default FournisseursList;
