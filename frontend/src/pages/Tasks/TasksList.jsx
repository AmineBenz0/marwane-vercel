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
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
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

const VIEWS = [
  { key: 'open', label: 'À faire' },
  { key: 'closed', label: 'Clôturées' },
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
  const [view, setView] = useState('open');
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
        setView('open');
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

  const handleReopen = async (id, status = 'en_attente') => {
    try {
      await changeTaskStatus(id, status);
      dismissUndoFor(id);
      setView('open');
      notifySuccess('Tâche rouverte');
    } catch {
      notifyError('Impossible de rouvrir la tâche');
    }
  };

  const { overdue, today, upcoming, unscheduled, completed, counts } = groupTasks(tasks);
  const panels = (view === 'open' ? [
    { key: 'overdue', title: 'En retard', tasks: overdue },
    { key: 'today', title: 'Aujourd’hui', tasks: today },
    { key: 'upcoming', title: 'À venir', tasks: upcoming },
    { key: 'unscheduled', title: 'Sans date', tasks: unscheduled },
  ] : [{ key: 'closed', tasks: completed }]).filter(panel => panel.tasks.length);

  const undoBusy = completionToUndo && (pendingStatusIds.has(completionToUndo.id)
    || (modalOpen && selectedTask?.id_tache === completionToUndo.id)
    || taskToDelete?.id_tache === completionToUndo.id);

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-end' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Typography component="h1" variant="h4" sx={{ fontWeight: 900 }}>
          Mes tâches
        </Typography>
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

      <Tabs
        value={view}
        onChange={(_, nextView) => setView(nextView)}
        aria-label="Liste des tâches"
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        {VIEWS.map(({ key, label }) => (
          <Tab
            key={key}
            id={`tasks-tab-${key}`}
            aria-controls={`tasks-panel-${key}`}
            value={key}
            label={loading ? label : `${label} (${counts[key]})`}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          />
        ))}
      </Tabs>

      {VIEWS.map(({ key }) => (
        <Box
          key={key}
          role="tabpanel"
          id={`tasks-panel-${key}`}
          aria-labelledby={`tasks-tab-${key}`}
          hidden={view !== key}
        >
          {view === key && (loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} aria-label="Chargement des tâches" />
            </Box>
          ) : panels.length === 0 ? (
            <Alert severity="info">
              {view === 'open' ? 'Aucune tâche à faire.' : 'Aucune tâche clôturée.'}
            </Alert>
          ) : (
            <Stack spacing={2}>
              {panels.map(({ key: panelKey, ...panel }) => (
                <TaskPanel
                  key={panelKey}
                  {...panel}
                  pendingStatusIds={pendingStatusIds}
                  onComplete={handleComplete}
                  onReopen={handleReopen}
                  onView={setTaskToViewId}
                  onEdit={handleEdit}
                  onDelete={setTaskToDelete}
                />
              ))}
            </Stack>
          ))}
        </Box>
      ))}

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
            <Typography variant="body2" color="text.secondary">
              {getTaskDate(taskToView)
                ? `Date prévue · ${formatTaskDate(taskToView)}`
                : 'Sans date prévue'}
            </Typography>
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
        action={completionToUndo && (
          <Button
            color="inherit"
            onClick={() => handleReopen(completionToUndo.id, completionToUndo.previousStatus)}
            disabled={Boolean(undoBusy)}
          >
            Annuler
          </Button>
        )}
      />
    </Box>
  );
}

function TaskPanel({ title, tasks, pendingStatusIds, onComplete, onReopen, onView, onEdit, onDelete }) {
  return (
    <Card component="section" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        {title && (
          <Typography component="h2" variant="subtitle1" sx={{ mb: 1.25, fontWeight: 800 }}>
            {title}
          </Typography>
        )}
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
              onReopen={onReopen}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

const taskActionSize = { width: { xs: 44, md: 36 }, height: { xs: 44, md: 36 } };

function TaskCard({ task, busy, onComplete, onReopen, onView, onEdit, onDelete }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const done = isTaskDone(task);
  const action = done ? 'Rouvrir' : 'Terminer';
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
          {date && (
            <Typography variant="caption" color={overdue ? 'error.dark' : 'text.secondary'}>
              {formatTaskDate(task, !done)}
            </Typography>
          )}
          {!done && task.priorite === 'haute' && (
            <Chip label="Prioritaire" color="warning" size="small" variant="outlined" />
          )}
          {done && (
            <Chip
              label={task.statut === 'annule' ? 'Annulée' : 'Terminée'}
              color={task.statut === 'annule' ? 'default' : 'success'}
              size="small"
            />
          )}
        </Stack>
        <Button
          aria-label={`${action} — ${task.titre}`}
          aria-busy={busy}
          disabled={busy}
          onClick={() => done ? onReopen(task.id_tache) : onComplete(task)}
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
          {action}
        </Button>
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

export default TasksList;
