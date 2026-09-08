import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Grid, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import { Add as AddIcon, Factory as FactoryIcon, PlayArrow as PlayIcon, Refresh as RefreshIcon, Undo as UndoIcon } from '@mui/icons-material';
import { get, post } from '../../services/api';
import { getBusinessDateInput } from '../../utils/businessDate';

const money = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'MAD' }).format(Number(value || 0));

function ProductBomsPage() {
  const [products, setProducts] = useState([]);
  const [boms, setBoms] = useState([]);
  const [stock, setStock] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [form, setForm] = useState({ id_produit_sortie: '', version: 1, quantite_sortie: 1, lignes: [{ id_produit_entree: '', quantite: 1 }] });
  const [execution, setExecution] = useState({ id_nomenclature: '', quantite_sortie: 1, date_transformation: getBusinessDateInput() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [productData, bomData, stockData, transformationData] = await Promise.all([
        get('/produits', { params: { est_actif: true, limit: 1000 } }), get('/product-boms'), get('/stock'), get('/transformations'),
      ]);
      setProducts(productData || []); setBoms(bomData || []); setStock(stockData || []); setTransformations(transformationData || []);
    } catch (err) { setError(err?.response?.data?.detail || err?.message || 'Impossible de charger la production.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rawMaterials = useMemo(() => products.filter((product) => product.type_produit === 'matiere_premiere'), [products]);
  const finishedProducts = useMemo(() => products.filter((product) => product.type_produit === 'produit_fini'), [products]);
  const productName = useCallback((id) => products.find((product) => product.id_produit === id)?.nom_produit || `Produit #${id}`, [products]);

  const updateLine = (index, field, value) => setForm((current) => ({ ...current, lignes: current.lignes.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line) }));
  const createBom = async () => {
    if (!form.id_produit_sortie || form.lignes.some((line) => !line.id_produit_entree || Number(line.quantite) <= 0)) { setError('Sélectionnez un produit fini et des matières premières valides.'); return; }
    setSaving(true); setError(null);
    try { await post('/product-boms', { ...form, id_produit_sortie: Number(form.id_produit_sortie), version: Number(form.version), quantite_sortie: Number(form.quantite_sortie), lignes: form.lignes.map((line) => ({ ...line, id_produit_entree: Number(line.id_produit_entree), quantite: Number(line.quantite) })) }); setForm({ id_produit_sortie: '', version: 1, quantite_sortie: 1, lignes: [{ id_produit_entree: '', quantite: 1 }] }); await load(); } catch (err) { setError(err?.response?.data?.detail || err?.message || 'Le BOM n’a pas pu être créé.'); } finally { setSaving(false); }
  };
  const execute = async () => {
    if (!execution.id_nomenclature || Number(execution.quantite_sortie) <= 0) { setError('Choisissez un BOM actif et une quantité de sortie valide.'); return; }
    if (!window.confirm('Confirmer la transformation ? Le stock sera consommé de façon irréversible, avec possibilité de reversal auditable.')) return;
    setSaving(true); setError(null);
    try { await post('/transformations', { ...execution, id_nomenclature: Number(execution.id_nomenclature), quantite_sortie: Number(execution.quantite_sortie), cle_idempotence: window.crypto?.randomUUID?.() || `web-${Date.now()}` }); setExecution((current) => ({ ...current, id_nomenclature: '' })); await load(); } catch (err) { setError(err?.response?.data?.detail || err?.message || 'La transformation n’a pas pu être exécutée.'); } finally { setSaving(false); }
  };

  const previewTransformation = async () => {
    if (!execution.id_nomenclature || Number(execution.quantite_sortie) <= 0) {
      setError('Choisissez un BOM actif et une quantité de sortie valide.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const data = await post('/transformations/preview', {
        date_transformation: execution.date_transformation,
        id_nomenclature: Number(execution.id_nomenclature),
        quantite_sortie: Number(execution.quantite_sortie),
      });
      setPreview(data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'La prévisualisation n’a pas pu être calculée.');
      setPreview(null);
    } finally { setSaving(false); }
  };

  const reverseTransformation = async (id) => {
    if (!window.confirm(`Confirmer l'annulation auditable de la transformation #${id} ?`)) return;
    setSaving(true); setError(null);
    try { await post(`/transformations/${id}/reverse`); await load(); } catch (err) { setError(err?.response?.data?.detail || err?.message || 'La transformation ne peut pas être annulée.'); } finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;
  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 3 }}><Box><Typography variant="h4" fontWeight={700}>BOM & transformations</Typography><Typography color="text.secondary">Consommez les matières et valorisez automatiquement les produits finis.</Typography></Box><Button startIcon={<RefreshIcon />} onClick={load}>Actualiser</Button></Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Grid container spacing={2.5}>
      <Grid item xs={12} md={6}><Card variant="outlined"><CardContent><Stack spacing={2}><Stack direction="row" spacing={1} alignItems="center"><FactoryIcon color="primary" /><Typography variant="h6" fontWeight={700}>Nouvelle nomenclature</Typography></Stack><TextField select label="Produit fini" value={form.id_produit_sortie} onChange={(event) => setForm({ ...form, id_produit_sortie: event.target.value })} fullWidth><MenuItem value="">Choisir…</MenuItem>{finishedProducts.map((product) => <MenuItem value={product.id_produit} key={product.id_produit}>{product.nom_produit}</MenuItem>)}</TextField><Stack direction="row" spacing={2}><TextField label="Version" type="number" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} inputProps={{ min: 1 }} fullWidth /><TextField label="Sortie attendue" type="number" value={form.quantite_sortie} onChange={(event) => setForm({ ...form, quantite_sortie: event.target.value })} inputProps={{ min: 0.001, step: 0.001 }} fullWidth /></Stack><Typography variant="subtitle2">Matières premières requises</Typography>{form.lignes.map((line, index) => <Stack direction="row" spacing={1} key={`${index}-${line.id_produit_entree}`}><Select displayEmpty value={line.id_produit_entree} onChange={(event) => updateLine(index, 'id_produit_entree', event.target.value)} fullWidth size="small"><MenuItem value="">Choisir une matière…</MenuItem>{rawMaterials.map((product) => <MenuItem value={product.id_produit} key={product.id_produit}>{product.nom_produit}</MenuItem>)}</Select><TextField type="number" size="small" label="Qté" value={line.quantite} onChange={(event) => updateLine(index, 'quantite', event.target.value)} inputProps={{ min: 0.001, step: 0.001 }} sx={{ width: 120 }} />{form.lignes.length > 1 && <Button color="error" onClick={() => setForm((current) => ({ ...current, lignes: current.lignes.filter((_, lineIndex) => lineIndex !== index) }))}>×</Button>}</Stack>)}<Button startIcon={<AddIcon />} onClick={() => setForm((current) => ({ ...current, lignes: [...current.lignes, { id_produit_entree: '', quantite: 1 }] }))}>Ajouter une matière</Button><Button variant="contained" onClick={createBom} disabled={saving}>Créer le BOM</Button></Stack></CardContent></Card></Grid>
      <Grid item xs={12} md={6}><Card variant="outlined"><CardContent><Stack spacing={2}><Typography variant="h6" fontWeight={700}>Exécuter une transformation</Typography><TextField select label="BOM actif" value={execution.id_nomenclature} onChange={(event) => { setExecution({ ...execution, id_nomenclature: event.target.value }); setPreview(null); }} fullWidth><MenuItem value="">Choisir…</MenuItem>{boms.map((bom) => <MenuItem value={bom.id_nomenclature} key={bom.id_nomenclature}>{bom.produit_sortie_nom || productName(bom.id_produit_sortie)} · v{bom.version}</MenuItem>)}</TextField><Stack direction="row" spacing={2}><TextField label="Date" type="date" value={execution.date_transformation} onChange={(event) => setExecution({ ...execution, date_transformation: event.target.value })} InputLabelProps={{ shrink: true }} fullWidth /><TextField label="Quantité produite" type="number" value={execution.quantite_sortie} onChange={(event) => { setExecution({ ...execution, quantite_sortie: event.target.value }); setPreview(null); }} inputProps={{ min: 0.001, step: 0.001 }} fullWidth /></Stack><Alert severity="info">Les matières sont vérifiées puis consommées atomiquement. Le coût de sortie est calculé à partir du coût moyen pondéré.</Alert>{preview && <Alert severity={preview.stock_suffisant ? 'success' : 'warning'}>{preview.stock_suffisant ? 'Stock disponible pour cette production.' : 'Stock insuffisant pour cette production.'}<br />Coût estimé : {money(preview.cout_total)}{preview.lignes_entree?.length ? ` · ${preview.lignes_entree.map((line) => `${line.nom_produit}: ${Number(line.quantite_requise).toLocaleString('fr-FR')}`).join(' · ')}` : ''}</Alert>}<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button variant="outlined" onClick={previewTransformation} disabled={saving || !boms.length}>Prévisualiser les besoins</Button><Button variant="contained" color="success" startIcon={<PlayIcon />} onClick={execute} disabled={saving || !boms.length}>Exécuter</Button></Stack></Stack></CardContent></Card></Grid>
      <Grid item xs={12} md={6}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Stock disponible</Typography>{stock.length ? <Stack spacing={1}>{stock.map((item) => <Stack direction="row" justifyContent="space-between" key={item.id_produit}><Typography variant="body2">{item.nom_produit}</Typography><Typography variant="body2" fontWeight={700}>{Number(item.quantite_disponible).toLocaleString('fr-FR')} · {money(item.valeur_stock)}</Typography></Stack>)}</Stack> : <Typography color="text.secondary">Aucun stock général disponible.</Typography>}</Paper></Grid>
      <Grid item xs={12} md={6}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Dernières transformations</Typography>{transformations.length ? <Stack spacing={1.5}>{transformations.slice(0, 8).map((item) => <Box key={item.id_transformation}><Stack direction="row" justifyContent="space-between" spacing={1}><Box><Typography fontWeight={600}>#{item.id_transformation} · {item.date_transformation}</Typography><Typography variant="body2" color="text.secondary">{item.lignes?.filter((line) => line.type_ligne === 'OUTPUT').map((line) => productName(line.id_produit)).join(', ') || 'Sortie'} · coût {money(item.cout_total)}</Typography></Box><Button size="small" color="error" startIcon={<UndoIcon />} onClick={() => reverseTransformation(item.id_transformation)} disabled={saving}>Annuler</Button></Stack><Divider sx={{ mt: 1.5 }} /></Box>)}</Stack> : <Typography color="text.secondary">Aucune transformation enregistrée.</Typography>}</Paper></Grid>
    </Grid>
  </Box>;
}

export default ProductBomsPage;
