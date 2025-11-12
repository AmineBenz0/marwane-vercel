/**
 * Test simple et rapide pour FournisseurProfile
 * 
 * Ce script vérifie :
 * - Que le fichier existe
 * - Que les imports sont corrects
 * - Que la route est configurée
 * 
 * Exécution : node test-fournisseur-profile-simple.js
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1 : Vérifier que le fichier FournisseurProfile.jsx existe
test('FournisseurProfile.jsx existe', () => {
  const filePath = join(__dirname, 'src', 'pages', 'Fournisseurs', 'FournisseurProfile.jsx');
  assert(existsSync(filePath), `Le fichier ${filePath} n'existe pas`);
  console.log('✅ FournisseurProfile.jsx existe');
});

// Test 2 : Vérifier que le fichier contient les imports nécessaires
test('FournisseurProfile.jsx contient les imports nécessaires', () => {
  const filePath = join(__dirname, 'src', 'pages', 'Fournisseurs', 'FournisseurProfile.jsx');
  const content = readFileSync(filePath, 'utf-8');
  
  assert(content.includes('useParams'), 'useParams manquant');
  assert(content.includes('useNavigate'), 'useNavigate manquant');
  assert(content.includes('/fournisseurs/'), 'Route fournisseurs manquante');
  assert(content.includes('montant_total_achats'), 'montant_total_achats manquant');
  assert(content.includes('Total achats'), 'Label "Total achats" manquant');
  assert(content.includes('Évolution des achats'), 'Label "Évolution des achats" manquant');
  assert(!content.includes('Total ventes'), 'Ancien label "Total ventes" présent');
  assert(!content.includes('/clients/'), 'Ancienne route /clients/ présente');
  
  console.log('✅ Tous les imports et labels sont corrects');
});

// Test 3 : Vérifier que la route est configurée dans App.jsx
test('Route configurée dans App.jsx', () => {
  const filePath = join(__dirname, 'src', 'App.jsx');
  const content = readFileSync(filePath, 'utf-8');
  
  assert(content.includes('FournisseurProfile'), 'Import FournisseurProfile manquant');
  assert(content.includes('/fournisseurs/:id/profile'), 'Route /fournisseurs/:id/profile manquante');
  
  console.log('✅ Route configurée dans App.jsx');
});

// Test 4 : Vérifier que le composant est exporté par défaut
test('FournisseurProfile est exporté par défaut', () => {
  const filePath = join(__dirname, 'src', 'pages', 'Fournisseurs', 'FournisseurProfile.jsx');
  const content = readFileSync(filePath, 'utf-8');
  
  assert(content.includes('export default FournisseurProfile'), 'Export par défaut manquant');
  
  console.log('✅ Composant exporté correctement');
});

// Test 5 : Vérifier la structure de base du composant
test('Structure de base du composant', () => {
  const filePath = join(__dirname, 'src', 'pages', 'Fournisseurs', 'FournisseurProfile.jsx');
  const content = readFileSync(filePath, 'utf-8');
  
  assert(content.includes('function FournisseurProfile'), 'Fonction FournisseurProfile manquante');
  assert(content.includes('useParams'), 'useParams utilisé');
  assert(content.includes('useState'), 'useState utilisé');
  assert(content.includes('useEffect'), 'useEffect utilisé');
  
  console.log('✅ Structure de base correcte');
});

// Exécuter tous les tests
console.log('\n🧪 Exécution des tests simples pour FournisseurProfile...\n');

tests.forEach(({ name, fn }) => {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error(`❌ ${name}: ${error.message}`);
  }
});

console.log(`\n📊 Résultats : ${passed} passés, ${failed} échoués`);

if (failed === 0) {
  console.log('✅ Tous les tests sont passés !\n');
  process.exit(0);
} else {
  console.log('❌ Certains tests ont échoué\n');
  process.exit(1);
}

