import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalOverviewPage from './GlobalOverviewPage';
const mocks = vi.hoisted(() => ({ get: vi.fn(), cycles: vi.fn(), performance: vi.fn(), export: vi.fn() }));
vi.mock('../../services/api', () => ({ get: mocks.get }));
vi.mock('../../services/productionService', () => ({ cycleProductionService: { getCycles: mocks.cycles }, productionService: { getPerformance: mocks.performance } }));
vi.mock('./globalOverviewExport', () => ({ exportOverview: mocks.export }));
const cycles = [{id_cycle: 1, id_batiment: 1, nom_cycle: 'Lot réel', date_debut: '2026-09-30', date_fin_reelle: '2026-10-02', effectif_initial: 1000, statut: 'termine'}];
const rows = ['30/09/2026','01/10/2026'].map((date, index) => ({ rowType:'day', date, mort: 1, oeufs: 100, normal:100, effectif_debut:1000-index, effectif_fin:999-index, aliment_kg:'10', poids_oeuf: index ? '-' : '60', formule:'Ponte' }));
const select = async (label, value) => { fireEvent.mouseDown(screen.getByRole('combobox', {name: label})); fireEvent.click(await screen.findByRole('option', {name: value, exact: true})); };
async function exportRows() {
 fireEvent.click(screen.getByRole('button',{name:'Exporter',exact:true}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'Excel (.xlsx)',exact:true}));
 await waitFor(()=>expect(mocks.export).toHaveBeenCalled());
 return mocks.export.mock.calls.at(-1)[1];
}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('VITE_DEPLOYMENT_ENV','production');
 mocks.cycles.mockResolvedValue(cycles);mocks.performance.mockResolvedValue({rows});mocks.export.mockResolvedValue();
 mocks.get.mockImplementation(async(path)=>path==='/produits' ? [{id_produit:1,nom_produit:'Œufs normaux'}, {id_produit:2,nom_produit:'Aliment ponte'}] : path==='/charges' ? [{id_cycle:1,id_batiment:1,date_charge:'2026-10-01',montant:100,libelle:'Salaires'},{id_cycle:99,id_batiment:1,date_charge:'2026-10-01',montant:900,libelle:'Autre lot'}] : [{id_cycle:1,id_batiment:1,id_fournisseur:1,id_produit:2,date_transaction:'2026-09-30',quantite:100,montant_total:400}, {id_cycle:1,id_batiment:1,id_client:1,id_produit:1,date_transaction:'2026-10-02',quantite:100,montant_total:200}]);
});
describe('Suivi global release checks',()=>{
 it('keeps empty production accounts free of mock data',async()=>{
  mocks.cycles.mockResolvedValue([]);render(<GlobalOverviewPage/>);
  await screen.findByText('Aucun lot de production enregistré.');
  expect(screen.queryByText(/Données de démonstration/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Voir un exemple'})).not.toBeInTheDocument();
 });
 it('reconciles real monthly totals, dates without production, missing weights and exports',async()=>{
  render(<GlobalOverviewPage/>);await screen.findByText('01/10/2026');
  await select('Choisir une période','Toute la période');
  await select('Regrouper les lignes','Par mois');
  const exported=await exportRows();
  const [sept,oct,total]=exported;
  expect(sept.cost).toBe(40);expect(sept.sales).toBe(0);
  expect(oct.cost).toBe(140);expect(oct.sales).toBe(200);expect(oct.sold).toBe(100);
  expect(total.cost).toBe(sept.cost+oct.cost);expect(total.sales).toBe(sept.sales+oct.sales);
  expect(total.effectif_fin).toBe(998);expect(total.poidsOeuf).toBeNull();expect(total.fcr).toBeNull();
  expect(new Set(exported.map(row=>row.id)).size).toBe(exported.length);
  expect(mocks.export.mock.calls.at(-1)[3].demo).toBe(false);
  expect(mocks.export.mock.calls.at(-1)[3].period).toBe('Toute la période');
  await select('Regrouper les lignes','Par jour');mocks.export.mockClear();
  const daily=await exportRows();const financeDay=daily.find(row=>row.date==='02/10/2026');
  expect(financeDay.oeufs).toBeNull();expect(financeDay.sales).toBe(200);
  expect(financeDay.effectif_fin).toBe(998);
 });
 it('does not report missing feed prices as zero costs or a positive margin',async()=>{
  const previous=mocks.get.getMockImplementation();
  mocks.get.mockImplementation(async(path)=>path==='/transactions' ? [] : previous(path));
  render(<GlobalOverviewPage/>);await screen.findByText('01/10/2026');
  const exported=await exportRows();const total=exported.at(-1);
  expect(total.cost).toBeNull();expect(total.margin).toBeNull();
  expect(total.totalDepenses).toBeNull();expect(total.valeurPoulette).toBeNull();
 });
 it('ignores a slow previous lot response after switching lots',async()=>{
  const second={...cycles[0],id_cycle:2,nom_cycle:'Lot suivant'};
  mocks.cycles.mockResolvedValue([...cycles,second]);
  let resolveOld;const old=new Promise(resolve=>{resolveOld=resolve;});
  mocks.performance.mockImplementation(id=>id===1 ? old : Promise.resolve({rows:[{...rows[0],oeufs:777}]}));
  render(<GlobalOverviewPage/>);
  await waitFor(()=>expect(mocks.performance).toHaveBeenCalledWith(1));
  await select('Choisir un lot','Lot suivant · termine');
  await screen.findByText('30/09/2026');
  resolveOld({rows:[{...rows[0],oeufs:9999}]});
  await waitFor(()=>expect(screen.queryByLabelText('Chargement du registre')).not.toBeInTheDocument());
  const exported=await exportRows();
  expect(exported[0].oeufs).toBe(777);
 });
 it('keeps the staging example available and labelled',async()=>{
  vi.stubEnv('VITE_DEPLOYMENT_ENV','preview');mocks.cycles.mockResolvedValue([]);render(<GlobalOverviewPage/>);
  await screen.findByText(/Données de démonstration/);
  expect(within(screen.getByRole('region',{name:'Registre de production'})).getAllByRole('row').length).toBeGreaterThan(300);
 });
});
