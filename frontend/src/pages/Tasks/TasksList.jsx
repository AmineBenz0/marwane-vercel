import { useEffect, useState } from 'react';
import { format, isToday, isTomorrow, startOfToday } from 'date-fns';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  MoreHoriz as MoreHorizIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { getTaskDate, groupTasks, isTaskDone } from './taskListModel';
import { formatShortDate, formatShortDateTime } from '../../utils/dateFormatting';
import TaskModal from '../../components/Tasks/TaskModal';
import taskService from '../../services/taskService';
import useNotificationStore from '../../store/notificationStore';

const STATUS_LABELS = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  complete: 'Terminée',
  annule: 'Annulée',
};

const PRIORITY_LABELS = {
  basse: 'Basse',
  moyenne: 'Moyenne',
  haute: 'Haute',
};

const FILTERS = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'aujourdhui', label: "Aujourd'hui" },
  { key: 'en_attente', label: 'En attente' },
  { key: 'urgentes', label: 'Urgentes' },
  { key: 'terminees', label: 'Clôturées' },
];

const formatTaskDate = (task, relative = false) => {
  const date = getTaskDate(task);
  if (!date) return 'Sans date prévue';
  const day = relative && (isToday(date) ? 'Aujourd’hui' : isTomorrow(date) ? 'Demain' : null);
  if (day) return task.est_toute_la_journee ? day : `${day} à ${format(date, 'HH:mm')}`;
  if (task.est_toute_la_journee) return formatShortDate(date);
  return formatShortDateTime(date);
};

function TasksList() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [activeFilter, setActiveFilter] = useState('toutes');
  const [pendingStatusIds, setPendingStatusIds] = useState(() => new Set());
  const [completionToUndo, setCompletionToUndo] = useState(null);
  const [taskToViewId, setTaskToViewId] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const notifyError = useNotificationStore(state => state.error);
  const notifySuccess = useNotificationStore(state => state.success);
  const taskToView = tasks.find(task => task.id_tache === taskToViewId);

  useEffect(() => {
    let active = true;
    taskService.getTasks().then(data => {
      if (active) setTasks(data || []);
    }).catch(() => {
      if (active) notifyError('Erreur lors du chargement des tâches');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [notifyError]);

  const handleCreate = () => {
    setSelectedTask(null);
    setModalOpen(true);
  };

  const handleEdit = (task) => {
    setSelectedTask(task);
    setModalOpen(true);
  };

  const dismissUndoFor = (id) => {
    setCompletionToUndo(current => current?.id === id ? null : current);
  };

  const handleDelete = async () => {
    const id = taskToDelete.id_tache;
    setDeleting(true);
    try {
      await taskService.deleteTask(id);
      setTasks(current => current.filter(task => task.id_tache !== id));
      dismissUndoFor(id);
      setTaskToDelete(null);
      notifySuccess('Tâche supprimée');
    } catch {
      notifyError('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const updateTask = async (id, data, config) => {
    const saved = await taskService.updateTask(id, data, config);
    setTasks(current => current.map(task => task.id_tache === id ? saved : task));
  };

  const handleSave = async (data) => {
    try {
      if (selectedTask) {
        await updateTask(selectedTask.id_tache, data);
        dismissUndoFor(selectedTask.id_tache);
        notifySuccess('Tâche mise à jour');
      } else {
        const saved = await taskService.createTask(data);
        setTasks(current => [...current.filter(task => task.id_tache !== saved.id_tache), saved]);
        notifySuccess('Tâche créée');
      }
    } catch (err) {
      notifyError("Erreur lors de l’enregistrement");
      throw err;
    }
  };

  const changeTaskStatus = async (id, status) => {
    setPendingStatusIds(current => new Set(current).add(id));
    try {
      await updateTask(id, { statut: status }, { silent: true });
    } finally {
      setPendingStatusIds(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const handleComplete = async (task) => {
    try {
      await changeTaskStatus(task.id_tache, 'complete');
      setCompletionToUndo({ id: task.id_tache, previousStatus: task.statut });
    } catch {
      notifyError('Impossible de terminer la tâche');
    }
  };

  const handleUndo = async () => {
    const { id, previousStatus } = completionToUndo;
    try {
      await changeTaskStatus(id, previousStatus);
      dismissUndoFor(id);
      notifySuccess('Tâche rouverte');
    } catch {
      notifyError('Impossible de rouvrir la tâche');
    }
  };

  const taskGroups = groupTasks(tasks);
  const { sortedTasks, overdue: overdueTasks, today: todayTasks, upcoming: upcomingTasks,
    unscheduled: unscheduledTasks, completed: completedTasks,
    counts: taskCounts } = taskGroups;

  const filteredTasks = {
    aujourdhui: todayTasks,
    en_attente: sortedTasks.filter(task => task.statut === 'en_attente'),
    urgentes: sortedTasks.filter(task => task.priorite === 'haute' && !isTaskDone(task)),
    terminees: completedTasks,
  }[activeFilter];
  const panels = activeFilter === 'toutes' ? [
    { title: 'En retard', tasks: overdueTasks },
    { title: "À faire aujourd’hui", tasks: todayTasks },
    { title: 'Prochaines tâches', tasks: upcomingTasks },
    { title: 'Sans date prévue', tasks: unscheduledTasks },
    { title: 'Tâches clôturées', tasks: completedTasks },
  ].filter(panel => panel.tasks.length) : [{
    title: FILTERS.find(filter => filter.key === activeFilter).label,
    tasks: filteredTasks,
    emptyText: 'Aucune tâche pour ce filtre.',
  }];
  const undoBusy = completionToUndo && (pendingStatusIds.has(completionToUndo.id)
    || (modalOpen && selectedTask?.id_tache === completionToUndo.id)
    || taskToDelete?.id_tache === completionToUndo.id);

  const stats = [
    { label: "Aujourd'hui", value: taskCounts.aujourdhui },
    { label: 'En attente', value: taskCounts.en_attente },
    { label: 'Urgentes', value: taskCounts.urgentes },
    { label: 'Clôturées', value: taskCounts.terminees, helper: 'Terminées ou annulées' },
  ];

  const filterOptions = FILTERS.map((filter) => ({
    ...filter,
    count: taskCounts[filter.key] ?? taskCounts.toutes,
  }));

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-end' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#17211D' }}>
            Mes tâches
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 680 }}>
            Ce qui doit être fait maintenant, puis ce qui arrive ensuite.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
          disabled={loading}
          sx={{ minHeight: 46, borderRadius: 2 }}
        >
          Nouvelle tâche
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {stats.map((stat) => (
          <Grid item xs={6} md={3} key={stat.label}>
            <Card sx={{ height: '100%', borderRadius: 3 }}>
              <CardContent sx={{ p: { xs: 1.75, md: 2.25 } }}>
                <Typography
                  variant="overline"
                  sx={{ color: 'text.secondary', fontWeight: 900, letterSpacing: '0.08em' }}
                >
                  {stat.label}
                </Typography>
                <Typography sx={{ mt: 1, fontSize: { xs: '1.75rem', md: '2.1rem' }, fontWeight: 900, lineHeight: 1 }}>
                  {stat.value}
                </Typography>
                {stat.helper && <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.75, display: { xs: 'none', sm: 'block' } }}
                >
                  {stat.helper}
                </Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card
        sx={{
          mb: 2.5,
          borderRadius: 3,
          backgroundColor: '#F8FAF7',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <CardContent sx={{ p: { xs: 1.25, sm: 1.5 }, '&:last-child': { pb: { xs: 1.25, sm: 1.5 } } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(auto-fit, minmax(145px, 1fr))',
              },
              gap: 1,
            }}
          >
            {filterOptions.map((filter) => {
              const selected = activeFilter === filter.key;
              return (
                <Button
                  key={filter.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveFilter(filter.key)}
                  variant={selected ? 'contained' : 'outlined'}
                  sx={{
                    minHeight: { xs: 48, sm: 52 },
                    px: { xs: 1.25, sm: 1.5 },
                    borderRadius: 2.25,
                    justifyContent: 'space-between',
                    textTransform: 'none',
                    fontWeight: 900,
                    color: selected ? 'primary.contrastText' : '#26352F',
                    backgroundColor: selected ? undefined : '#FFFFFF',
                    borderColor: selected ? undefined : 'rgba(23, 33, 29, 0.14)',
                    boxShadow: selected ? '0 10px 22px rgba(10, 128, 105, 0.18)' : 'none',
                    '&:hover': {
                      backgroundColor: selected ? undefined : '#FFFFFF',
                      borderColor: selected ? undefined : 'primary.main',
                    },
                  }}
                >
                  <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {filter.label}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      ml: 1,
                      minWidth: 28,
                      height: 28,
                      px: 0.75,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '0.82rem',
                      backgroundColor: selected ? 'rgba(255,255,255,0.2)' : '#EEF4EF',
                    }}
                  >
                    {filter.count}
                  </Box>
                </Button>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={24} aria-label="Chargement des tâches" />
        </Box>
      ) : panels.length === 0 ? (
        <Alert severity="info">Aucune tâche pour le moment.</Alert>
      ) : (
        <Stack spacing={2}>
          {panels.map(panel => (
            <TaskPanel
              key={panel.title}
              {...panel}
              pendingStatusIds={pendingStatusIds}
              onComplete={handleComplete}
              onView={setTaskToViewId}
              onEdit={handleEdit}
              onDelete={setTaskToDelete}
            />
          ))}
        </Stack>
      )}

      <TaskModal
        key={selectedTask?.id_tache || 'new'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={selectedTask}
        onSave={handleSave}
      />

      <Dialog
        open={Boolean(taskToView)}
        onClose={() => setTaskToViewId(null)}
        aria-labelledby="task-details-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="task-details-title" sx={{ overflowWrap: 'anywhere' }}>
          {taskToView?.titre}
        </DialogTitle>
        {taskToView && (
          <DialogContent sx={{ overflowWrap: 'anywhere' }}>
            {taskToView.description && (
              <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
                {taskToView.description}
              </Typography>
            )}
            <Stack component="dl" spacing={0.5} sx={{ m: 0 }}>
              {[
                ['Date prévue', formatTaskDate(taskToView)],
                ['Statut', STATUS_LABELS[taskToView.statut] || taskToView.statut],
                ['Priorité', PRIORITY_LABELS[taskToView.priorite] || taskToView.priorite],
                ['Catégorie', taskToView.categorie],
              ].filter(([, value]) => value).map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }}>
                  <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0 }}>{value}</Typography>
                </Box>
              ))}
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setTaskToViewId(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(taskToDelete)}
        onClose={() => !deleting && setTaskToDelete(null)}
        aria-labelledby="delete-task-title"
        aria-describedby="delete-task-description"
      >
        <DialogTitle id="delete-task-title">Supprimer la tâche ?</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-task-description" sx={{ overflowWrap: 'anywhere' }}>
            {taskToDelete?.titre}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setTaskToDelete(null)} disabled={deleting}>Annuler</Button>
          <Button color="error" onClick={handleDelete} disabled={deleting}>Supprimer</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        key={completionToUndo?.id}
        open={Boolean(completionToUndo)}
        autoHideDuration={8000}
        onClose={(_, reason) => reason !== 'clickaway' && setCompletionToUndo(null)}
        message="Tâche terminée"
        action={<Button color="inherit" onClick={handleUndo} disabled={Boolean(undoBusy)}>Annuler</Button>}
      />
    </Box>
  );
}

function TaskPanel({ title, tasks, emptyText, pendingStatusIds, onComplete, onView, onEdit, onDelete }) {
  return (
    <Card component="section" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.25 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {tasks.length} {tasks.length === 1 ? 'tâche' : 'tâches'}
          </Typography>
        </Stack>
        {tasks.length === 0 ? (
          <Alert severity="info">{emptyText}</Alert>
        ) : (
          <Box sx={theme => ({
            display: 'grid',
            '--task-grid-gap': theme.spacing(1),
            gap: 'var(--task-grid-gap)',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              // Each track needs 248px or a quarter of the available width, whichever is larger.
              sm: 'repeat(auto-fill, minmax(min(100%, max(248px, calc((100% - 3 * var(--task-grid-gap)) / 4))), 1fr))',
            },
          })}>
            {tasks.map(task => (
              <TaskCard
                key={task.id_tache}
                task={task}
                busy={pendingStatusIds.has(task.id_tache)}
                onComplete={onComplete}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

const taskActionSize = { width: { xs: 44, md: 36 }, height: { xs: 44, md: 36 } };

function TaskCard({ task, busy, onComplete, onView, onEdit, onDelete }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const done = isTaskDone(task);
  const date = getTaskDate(task);
  const overdue = !done && date && date < startOfToday();
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Box
      component="article"
      aria-label={task.titre}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
      }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={0.5}>
        <Typography component="h3" variant="body2" sx={{ minWidth: 0 }}>
          <ButtonBase
            onClick={() => onView(task.id_tache)}
            sx={{
              display: 'block',
              minHeight: taskActionSize.height,
              maxWidth: '100%',
              py: 0.5,
              textAlign: 'left',
              font: 'inherit',
              fontWeight: 800,
              lineHeight: 1.35,
              overflowWrap: 'anywhere',
              '&:hover, &.Mui-focusVisible': { textDecoration: 'underline' },
            }}
          >
            {task.titre}
          </ButtonBase>
        </Typography>
        <Tooltip title="Actions">
          <span>
            <IconButton
              id={`task-actions-${task.id_tache}`}
              aria-label={`Actions — ${task.titre}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(menuAnchor)}
              aria-controls={menuAnchor ? `task-menu-${task.id_tache}` : undefined}
              disabled={busy}
              onClick={event => setMenuAnchor(event.currentTarget)}
              sx={taskActionSize}
            >
              <MoreHorizIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={0.75}
        sx={{ mt: 'auto', pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}
      >
        <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5} sx={{ minWidth: 0 }}>
          <Typography variant="caption" color={overdue ? 'error.dark' : 'text.secondary'}>
            {overdue && 'En retard · '}{formatTaskDate(task, !done)}
          </Typography>
          {!done && task.priorite === 'haute' && (
            <Chip label="Prioritaire" color="warning" size="small" variant="outlined" />
          )}
          {done && <StatusChip value={task.statut} />}
        </Stack>
        {!done && (
          <Button
            aria-label={`Terminer — ${task.titre}`}
            aria-busy={busy}
            disabled={busy}
            onClick={() => onComplete(task)}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
            size="small"
            sx={theme => ({
              flexShrink: 0,
              minHeight: taskActionSize.height,
              px: 1.25,
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 800,
              color: 'primary.dark',
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.18) },
            })}
          >
            Terminer
          </Button>
        )}
      </Stack>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        MenuListProps={{ id: `task-menu-${task.id_tache}`, 'aria-labelledby': `task-actions-${task.id_tache}` }}
      >
        <MenuItem onClick={() => { closeMenu(); onEdit(task); }}>Modifier</MenuItem>
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { closeMenu(); onDelete(task); }}>Supprimer</MenuItem>
      </Menu>
    </Box>
  );
}

function StatusChip({ value }) {
  const colors = {
    en_attente: 'default',
    en_cours: 'primary',
    complete: 'success',
    annule: 'error',
  };

  return (
    <Chip
      label={STATUS_LABELS[value] || value || 'Statut'}
      color={colors[value] || 'default'}
      size="small"
      sx={{ fontWeight: 800 }}
    />
  );
}

export default TasksList;
