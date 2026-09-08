import React, { useEffect, useRef, useState } from 'react';
import { Box, List, ListItemButton, ListItemText, Paper, TextField } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { get } from '../services/api';

function UnifiedSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(null);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      requestRef.current?.abort();
      requestRef.current = null;
      setResults([]);
      setOpen(false);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      try {
        const response = await get('/search', { params: { q: normalized }, signal: controller.signal });
        if (!controller.signal.aborted) { setResults(response?.results || []); setOpen(true); }
      } catch (error) {
        if (error?.code !== 'ERR_CANCELED' && !controller.signal.aborted) setResults([]);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [query]);

  const choose = (result) => { setQuery(''); setOpen(false); navigate(result.href); };
  return <Box sx={{ position: 'relative', width: { xs: '100%', sm: 320, md: 400 } }}>
    <TextField value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => results.length && setOpen(true)} placeholder="Rechercher clients, produits…" size="small" fullWidth InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }} inputProps={{ 'aria-label': 'Recherche globale' }} />
    {open && <Paper elevation={8} sx={{ position: 'absolute', zIndex: 10, left: 0, right: 0, mt: 0.5, maxHeight: 360, overflow: 'auto' }}><List dense>{results.length ? results.map((result) => <ListItemButton key={`${result.kind}-${result.id}`} onClick={() => choose(result)}><ListItemText primary={result.label} secondary={[result.kind, result.subtitle].filter(Boolean).join(' · ')} /></ListItemButton>) : <ListItemText sx={{ px: 2, py: 1.5 }} primary="Aucun résultat" />}</List></Paper>}
  </Box>;
}

export default UnifiedSearch;
