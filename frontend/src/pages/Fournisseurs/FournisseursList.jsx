import { useEffect, useMemo, useState } from 'react';
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
  FileDownload as FileDownloadIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import * as yup from 'yup';
import { format } from 'date-fns';
import { formatShortDate } from '../../utils/dateFormatting';
import ContactCard from '../../components/ContactCard';
import { contactGridSx } from '../../components/contactGrid';
import ModalForm from '../../components/ModalForm/ModalForm';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import { get, post } from '../../services/api';
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
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
        include_balance: true,
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
    setFormError(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!formLoading) {
      setModalOpen(false);
      setFormError(null);
    }
  };

  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);
    try {
      const payload = { ...data, est_actif: true };
      await post('/fournisseurs', payload);
      setModalOpen(false);
      await fetchFournisseurs();
      notification.success('Fournisseur créé avec succès');
    } catch (err) {
      const message = err?.message || "Une erreur est survenue lors de l'enregistrement";
      setFormError(message);
      notification.error(message);
      throw err;
    } finally {
      setFormLoading(false);
    }
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
    date_creation: formatShortDate,
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
        <Box sx={contactGridSx}>
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
        <Box sx={contactGridSx} data-testid="contact-grid">
          {fournisseurs.map((fournisseur) => (
            <ContactCard
              key={fournisseur.id_fournisseur}
              to={`/fournisseurs/${fournisseur.id_fournisseur}/profile`}
              name={fournisseur.nom_fournisseur}
              createdAt={fournisseur.date_creation}
              balance={fournisseur.outstanding_balance}
              type="fournisseur"
            />
          ))}
        </Box>
      )}

      <ModalForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={{ nom_fournisseur: '' }}
        validationSchema={fournisseurValidationSchema}
        fields={fournisseurFields}
        title="Nouveau fournisseur"
        submitLabel="Créer le fournisseur"
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
