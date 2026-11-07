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
 expect(mocks.export.mock.calls.at(-1)[2].some(column=>column.key==='valeurPoulette')).toBe(false);
 return mocks.export.mock.calls.at(-1)[1];
}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('VITE_DEPLOYMENT_ENV','production');
 mocks.cycles.mockResolvedValue(cycles);mocks.performance.mockResolvedValue({rows});mocks.export.mockResolvedValue();
 mocks.get.mockImplementation(async(path)=>path==='/produits' ? [{id_produit:1,nom_produit:'Œufs normaux'}, {id_produit:2,nom_produit:'Aliment ponte'}] : path==='/charges' ? [{id_cycle:1,id_batiment:1,date_charge:'2026-10-01',montant:100,libelle:'Salaires'},{id_cycle:99,id_batiment:1,date_charge:'2026-10-01',montant:900,libelle:'Autre lot'}] : [{id_transaction:1,id_cycle:1,id_batiment:1,id_fournisseur:1,id_produit:2,date_transaction:'2026-09-30',quantite:100,montant_total:400}, {id_transaction:2,id_cycle:1,id_batiment:1,id_client:1,id_produit:1,date_transaction:'2026-10-02',quantite:100,montant_total:200}]);
});
describe('Suivi global release checks',()=>{
 it('refreshes the selected lot after a correction without losing filters', async () => {
  render(<GlobalOverviewPage/>);
  await screen.findByText('01/10/2026');
  const initialLoads = mocks.cycles.mock.calls.length;
  fireEvent(window, new Event('marwane:correction'));
  await waitFor(() => expect(mocks.cycles.mock.calls.length).toBeGreaterThan(initialLoads));
 });
 it('maps localized API labels using the ISO production date and retains recorded zeros',async()=>{
  mocks.cycles.mockResolvedValue([{...cycles[0],id_lot:5,id_cycle:5,id_batiment:8,nom_cycle:'Lot B',date_debut:'2026-10-09',date_fin_reelle:'2026-10-12'}]);
  mocks.performance.mockResolvedValue({rows:[
   {...rows[0],date:'10/10/26',date_production:'2026-10-10',oeufs:1750,normal:1750},
   {...rows[0],date:'11/10/26',date_production:'2026-10-11',oeufs:0,normal:0,mort:0,aliment_kg:'0'},
  ]});
  mocks.get.mockImplementation(async path=>path==='/charges' ? [{id_cycle:5,id_batiment:8,date_charge:'2026-10-12',montant:20,libelle:'Entretien'}] : []);
  render(<GlobalOverviewPage/>);await screen.findByText('12/10/2026');
  await select('Choisir une période','Toute la période');
  const exported=await exportRows();
  expect(mocks.performance).toHaveBeenCalledWith(5);
  expect(exported.find(row=>row.dateIso==='2026-10-10'&&row.rowType==='day').oeufs).toBe(1750);
  expect(exported.find(row=>row.dateIso==='2026-10-11'&&row.rowType==='day').oeufs).toBe(0);
  const missing=exported.find(row=>row.dateIso==='2026-10-12'&&row.rowType==='day');
  expect(missing.oeufs).toBeNull();expect(missing.mort).toBeNull();expect(missing.aliment_kg).toBeNull();expect(missing.normal).toBeNull();
  expect(exported.at(-1).oeufs).toBe(1750);
 });
 it('keeps production totals missing when the selected period only has financial entries',async()=>{
  mocks.performance.mockResolvedValue({rows:[]});
  render(<GlobalOverviewPage/>);await screen.findByText('01/10/2026');
  const exported=await exportRows();
  expect(exported.at(-1).oeufs).toBeNull();expect(exported.at(-1).mort).toBeNull();expect(exported.at(-1).normal).toBeNull();expect(exported.at(-1).aliment_kg).toBeNull();
 });
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
 it('attributes only completed promise quantities to production lots and keeps their original sale value proportional',async()=>{
  const previous=mocks.get.getMockImplementation();
  const promise={id_transaction:25,id_cycle:null,id_batiment:1,id_client:3,id_produit:1,est_promesse:true,est_actif:true,date_transaction:'2026-10-02',quantite:1000,montant_total:2000,repartition_stock:[{id_production:12,id_cycle:1,quantite:1000,quantite_livree:600,date_production:'2026-10-02'}]};
  mocks.get.mockImplementation(async(path,options)=>{
   if(path==='/transactions'&&options?.params?.est_promesse)return [promise];
   if(path==='/transactions')return [];
   return previous(path,options);
  });
  render(<GlobalOverviewPage/>);await screen.findByText('01/10/2026');
  await select('Choisir une période','Toute la période');
  await select('Regrouper les lignes','Par mois');
  const exported=await exportRows();
  const october=exported.find(row=>row.date==='Total mois · octobre 2026');
  expect(october.sold).toBe(600);
  expect(october.sales).toBe(1200);
 });
 it('counts ordinary allocated egg sales even when legacy completed quantity is zero', async () => {
  const previous = mocks.get.getMockImplementation();
  const ordinary = {
    id_transaction:27, id_cycle:1, id_batiment:1,
    id_client:3, id_produit:1, est_promesse:false, est_actif:true,
    date_transaction:'2026-10-02', quantite:1, montant_total:1.50,
    repartition_stock:[{id_production:12,id_cycle:1,quantite:1,quantite_livree:0,date_production:'2026-10-01'}],
  };
  mocks.get.mockImplementation(async(path,options) => {
    if (path === '/transactions' && options?.params?.est_promesse) return [];
    if (path === '/transactions') return [ordinary];
    return previous(path,options);
  });
  render(<GlobalOverviewPage/>);
  await screen.findByText('01/10/2026');
  await select('Choisir une période','Toute la période');
  const exported = await exportRows();
  expect(exported.at(-1).sold).toBe(1);
  expect(exported.at(-1).sales).toBe(1.5);
 });

 it('does not report missing feed prices as zero costs or a positive margin',async()=>{
  const previous=mocks.get.getMockImplementation();
  mocks.get.mockImplementation(async(path)=>path==='/transactions' ? [] : previous(path));
  render(<GlobalOverviewPage/>);await screen.findByText('01/10/2026');
  const exported=await exportRows();const total=exported.at(-1);
  expect(total.cost).toBeNull();expect(total.margin).toBeNull();
  expect(total.totalDepenses).toBeNull();expect(total).not.toHaveProperty('valeurPoulette');
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


 it('keeps unallocated costs/sales in the lot total without multiplying them by building', async () => {
  const sharedCycles = [
   {...cycles[0], id_lot:8, id_cycle:1, id_batiment:1, nom_batiment:'Bâtiment 1'},
   {...cycles[0], id_lot:8, id_cycle:2, id_batiment:2, nom_batiment:'Bâtiment 2'},
  ];
  mocks.cycles.mockResolvedValue(sharedCycles);
  mocks.performance.mockResolvedValue({ rows: [{...rows[1], date:'01/10/2026', aliment_kg:0}] });
  mocks.get.mockImplementation(async (path, options) => {
   if (path === '/produits') return [{id_produit:1,nom_produit:'Œufs normaux'}];
   if (path === '/charges') return [
    {id_cycle:null, id_batiment:null, date_charge:'2026-10-01', montant:100, libelle:'Électricité'},
    {id_cycle:null, id_batiment:1, date_charge:'2026-10-01', montant:10, libelle:'Entretien bâtiment 1'},
   ];
   if (path === '/transactions' && options?.params?.est_promesse) return [];
   if (path === '/transactions') return [
    {id_transaction:101, id_client:3, id_produit:1, date_transaction:'2026-10-01', quantite:2, montant_total:200, est_actif:true},
    {id_transaction:102, id_client:3, id_produit:1, id_batiment:1, date_transaction:'2026-10-01', quantite:1, montant_total:20, est_actif:true},
    // Allocated to building 2, even though this promise originated in building 1.
    {id_transaction:103, id_client:3, id_produit:1, id_batiment:1, est_promesse:true, est_actif:true,
     date_transaction:'2026-10-01', quantite:10, montant_total:100,
     repartition_stock:[{id_cycle:2, quantite:10, quantite_livree:4}]},
   ];
   return [];
  });
  render(<GlobalOverviewPage/>);
  await screen.findByText('01/10/2026');
  await select('Choisir une période','Toute la période');
  let exported = await exportRows();
  expect(exported.at(-1).sales).toBe(260);
  expect(exported.at(-1).cost).toBe(110);

  mocks.export.mockClear();
  await select('Choisir un bâtiment','Bâtiment 1');
  exported = await exportRows();
  expect(exported.at(-1).sales).toBe(20);
  expect(exported.at(-1).cost).toBe(10);

  mocks.export.mockClear();
  await select('Choisir un bâtiment','Bâtiment 2');
  exported = await exportRows();
  expect(exported.at(-1).sales).toBe(40);
  expect(exported.at(-1).cost).toBe(0);
 });
 it('does not include a shared unassigned expense or sale in two overlapping lot totals', async () => {
  const other = {...cycles[0], id_cycle:2, id_lot:2, id_batiment:2, nom_cycle:'Autre lot', date_debut:'2026-10-01', date_fin_reelle:'2026-10-02'};
  mocks.cycles.mockResolvedValue([{...cycles[0],id_lot:1}, other]);
  mocks.performance.mockResolvedValue({ rows: [{...rows[1], date:'01/10/2026', aliment_kg:0}] });
  mocks.get.mockImplementation(async(path,options) => {
    if (path === '/produits') return [{id_produit:1,nom_produit:'Œufs normaux'}];
    if (path === '/charges') return [
      {date_charge:'2026-10-01',montant:100,libelle:'Salaires'},
      {id_batiment:1,date_charge:'2026-10-01',montant:10,libelle:'Entretien'}];
    if (path === '/transactions' && options?.params?.est_promesse) return [];
    if (path === '/transactions') return [
      {id_transaction:2,id_client:1,id_produit:1,date_transaction:'2026-10-01',quantite:10,montant_total:100,est_actif:true},
      {id_transaction:3,id_client:1,id_produit:1,id_batiment:1,date_transaction:'2026-10-01',quantite:1,montant_total:20,est_actif:true},
    ];
    return [];
  });
  render(<GlobalOverviewPage/>);
  await screen.findByText(/sans lot ni bâtiment ne sont pas réparties/);
  await select('Choisir un lot','Lot réel · termine');
  await waitFor(() => expect(mocks.performance).toHaveBeenCalledWith(1));
  await waitFor(() => expect(screen.queryByLabelText('Chargement du registre')).not.toBeInTheDocument());
  const first = await exportRows();
  expect(first.at(-1).cost).toBe(10);
  expect(first.at(-1).sales).toBe(20);
  mocks.export.mockClear();
  await select('Choisir un lot','Autre lot · termine');
  await waitFor(() => expect(mocks.performance).toHaveBeenCalledWith(2));
  await waitFor(() => expect(screen.queryByLabelText('Chargement du registre')).not.toBeInTheDocument());
  const second = await exportRows();
  expect(second.at(-1).cost).toBe(0);
  expect(second.at(-1).sales).toBe(0);
 });
 it('keeps the staging example available and labelled',async()=>{
  vi.stubEnv('VITE_DEPLOYMENT_ENV','preview');mocks.cycles.mockResolvedValue([]);render(<GlobalOverviewPage/>);
  await screen.findByText(/Données de démonstration/);
  expect(within(screen.getByRole('region',{name:'Registre de production'})).getAllByRole('row').length).toBeGreaterThan(300);
 });
});
