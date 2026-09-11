import { useEffect, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { get } from '../services/api';

const SEARCH_IDLE = 'idle';
const SEARCH_LOADING = 'loading';
const SEARCH_SUCCESS = 'success';
const SEARCH_EMPTY = 'empty';
const SEARCH_ERROR = 'error';

function UnifiedSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(SEARCH_IDLE);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(null);

  useEffect(() => {
    const normalized = query.trim();

    requestRef.current?.abort();
    requestRef.current = null;

    if (normalized.length < 2) {
      setResults([]);
      setStatus(SEARCH_IDLE);
      setOpen(false);
      return undefined;
    }

    setStatus(SEARCH_LOADING);
    setOpen(true);

    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      requestRef.current = controller;

      try {
        const response = await get('/search', {
          params: { q: normalized },
          signal: controller.signal,
          silent: true,
        });

        if (!controller.signal.aborted) {
          const nextResults = response?.results || [];
          setResults(nextResults);
          setStatus(nextResults.length ? SEARCH_SUCCESS : SEARCH_EMPTY);
          setOpen(true);
        }
      } catch (error) {
        if (error?.code !== 'ERR_CANCELED' && !controller.signal.aborted) {
          setResults([]);
          setStatus(SEARCH_ERROR);
          setOpen(true);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [query]);

  const choose = (result) => {
    setQuery('');
    setResults([]);
    setStatus(SEARCH_IDLE);
    setOpen(false);
    navigate(result.href);
  };

  const renderContent = () => {
    if (status === SEARCH_LOADING) {
      return (
        <ListItemText
          sx={{ px: 2, py: 1.5 }}
          primary="Recherche en cours…"
          secondary={<CircularProgress size={16} sx={{ mt: 1 }} />}
        />
      );
    }

    if (status === SEARCH_ERROR) {
      return (
        <ListItemText
          sx={{ px: 2, py: 1.5 }}
          primary="Recherche temporairement indisponible"
          secondary="Réessayez dans quelques instants."
        />
      );
    }

    if (status === SEARCH_EMPTY) {
      return <ListItemText sx={{ px: 2, py: 1.5 }} primary="Aucun résultat" />;
    }

    return results.map((result) => (
      <ListItemButton
        key={result.kind + '-' + result.id}
        onClick={() => choose(result)}
      >
        <ListItemText
          primary={result.label}
          secondary={[result.kind, result.subtitle].filter(Boolean).join(' · ')}
        />
      </ListItemButton>
    ));
  };

  return (
    <Box sx={{ position: 'relative', width: { xs: '100%', sm: 320, md: 400 } }}>
      <TextField
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder="Rechercher clients, produits…"
        size="small"
        fullWidth
        InputProps={{
          startAdornment: (
            <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
          ),
        }}
        inputProps={{
          'aria-label': 'Recherche globale',
          'aria-busy': status === SEARCH_LOADING,
        }}
      />
      {open && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            zIndex: 10,
            left: 0,
            right: 0,
            mt: 0.5,
            maxHeight: 360,
            overflow: 'auto',
          }}
        >
          <List dense aria-live="polite">
            {renderContent()}
          </List>
        </Paper>
      )}
    </Box>
  );
}

export default UnifiedSearch;
