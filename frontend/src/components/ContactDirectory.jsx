import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import {
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { get, post } from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatShortDate } from '../utils/dateFormatting';
import { exportToExcelAdvanced } from '../utils/exportToExcel';
import ContactCard from './ContactCard';
import { contactGridSx } from './contactGrid';
import useCorrectionRefresh from './Corrections/useCorrectionRefresh';
import SmartFilterPanel from './Filters/SmartFilterPanel';
import PageHeader from './Layout/PageHeader';
import ModalForm from './ModalForm/ModalForm';

function ContactSummary({ label, value, icon, color }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" gap={1} alignItems="center">
          <Box sx={{ color, display: 'flex', '& .MuiSvgIcon-root': { fontSize: 20 } }}>{icon}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="div" variant="caption" color="text.secondary">{label}</Typography>
            <Typography component="div" variant="h5" fontWeight={800}>{value}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function ContactDirectory({
  type,
  pageKey,
  title,
  icon,
  initialValues,
  fields,
  validationSchema,
  successMessage,
}) {
  const endpoint = '/' + pageKey;
  const idField = 'id_' + type;
  const nameField = 'nom_' + type;
  const notification = useNotification();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [filters, setFilters] = useState({ nom: '' });
  const search = filters.nom.trim();
  const reload = () => setReloadVersion((version) => version + 1);
  useCorrectionRefresh(reload);

  const filterDefinitions = useMemo(() => [{
    id: 'nom',
    label: `Rechercher un ${type}`,
    type: 'search',
    placeholder: `Nom du ${type}...`,
    alwaysInline: true,
  }], [type]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    async function loadContacts() {
      try {
        const params = { est_actif: true, limit: 1000, include_balance: true };
        if (search) params.recherche = search;
        const data = await get(endpoint, { params, silent: true });
        if (active) setContacts(data || []);
      } catch (err) {
        if (active) {
          setContacts([]);
          setLoadError(err?.message || `Impossible de charger les ${title.toLowerCase()}.`);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadContacts();
    return () => { active = false; };
  }, [endpoint, reloadVersion, search, title]);

  const createdThisMonth = useMemo(() => {
    const now = new Date();
    return contacts.filter((contact) => {
      if (!contact.date_creation) return false;
      const created = new Date(contact.date_creation);
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;
  }, [contacts]);

  const handleCreate = () => {
    setFormError(null);
    setModalOpen(true);
  };

  const handleClose = () => {
    if (!formLoading) {
      setModalOpen(false);
      setFormError(null);
    }
  };

  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);
    try {
      await post(endpoint, { ...data, est_actif: true });
      setModalOpen(false);
      reload();
      notification.success(successMessage);
    } catch (err) {
      const message = err?.message || "Une erreur est survenue lors de l'enregistrement";
      setFormError(message);
      notification.error(message);
      throw err;
    } finally {
      setFormLoading(false);
    }
  };

  const handleExport = async () => {
    setExportError(null);
    try {
      await exportToExcelAdvanced(
        contacts,
        [
          { id: nameField, label: `Nom du ${type}` },
          { id: 'date_creation', label: 'Date de création' },
        ],
        `${pageKey}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        title,
        { date_creation: formatShortDate }
      );
    } catch {
      setExportError("Une erreur est survenue lors de l'export Excel");
    }
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        title={title}
        description={`Retrouvez rapidement un ${type}, consultez son profil ou ajoutez-en un nouveau.`}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExport}
              disabled={loading || Boolean(loadError) || contacts.length === 0}
            >
              Exporter Excel
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              Créer un {type}
            </Button>
          </>
        }
      />

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={reload}>Réessayer</Button>}>
          {loadError}
        </Alert>
      )}
      {exportError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError(null)}>{exportError}</Alert>
      )}

      <SmartFilterPanel
        pageKey={pageKey}
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={(name, value) => setFilters((current) => ({ ...current, [name]: value }))}
        onClearAll={() => setFilters({ nom: '' })}
        maxInlineFilters={1}
        resultCount={contacts.length}
        totalCount={contacts.length}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5, mb: 2.5 }}>
        <ContactSummary label={title} value={contacts.length} icon={icon} color="primary.main" />
        <ContactSummary label="Créés ce mois" value={createdThisMonth} icon={<PersonAddIcon />} color="info.main" />
      </Box>

      <Box component="section" aria-label={`Liste des ${title.toLowerCase()}`} aria-busy={loading}>
        {loading ? (
          <Box sx={contactGridSx} aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} variant="rounded" height={150} sx={{ borderRadius: 3 }} />
            ))}
          </Box>
        ) : contacts.length > 0 ? (
          <Box sx={contactGridSx} data-testid="contact-grid">
            {contacts.map((contact) => (
              <ContactCard
                key={contact[idField]}
                to={`${endpoint}/${contact[idField]}/profile`}
                name={contact[nameField]}
                balance={contact.outstanding_balance}
                type={type}
              />
            ))}
          </Box>
        ) : !loadError && (
          <Card variant="outlined" sx={{ borderRadius: 3, p: { xs: 2.5, sm: 4 }, textAlign: 'center' }}>
            <Typography component="h2" variant="h6" fontWeight={800}>Aucun {type} trouvé</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              {search ? `Essayez une autre recherche ou créez un nouveau ${type}.` : `Ajoutez un ${type} pour commencer.`}
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              Nouveau {type}
            </Button>
          </Card>
        )}
      </Box>

      <ModalForm
        open={modalOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        initialValues={initialValues}
        validationSchema={validationSchema}
        fields={fields}
        title={`Nouveau ${type}`}
        submitLabel={`Créer le ${type}`}
        loading={formLoading}
        errorMessage={formError}
      />
    </Box>
  );
}
