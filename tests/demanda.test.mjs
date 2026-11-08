/*
 * Demanda e categoria de atendimento (DIS-NOR-030 Rev.05) — lib/tensao-por-uf.ts.
 * Rodar: node tests/demanda.test.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const cache = new Map();
function loadTs(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const out = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const m = new Module(file);
  m.filename = file;
  cache.set(file, m);
  m.require = (spec) => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return require(spec);
    const base = spec.startsWith('@/') ? resolve(ROOT, spec.slice(2)) : resolve(dirname(file), spec);
    for (const c of [base + '.ts', base + '.tsx', resolve(base, 'index.ts')]) if (existsSync(c)) return loadTs(c);
    throw new Error(`não achei ${spec} a partir de ${file}`);
  };
  m._compile(out, file);
  return m.exports;
}


const U = loadTs(resolve(ROOT, 'lib/tensao-por-uf.ts'));
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log(`✓ ${nome}`); };
const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

t('UFs: 27 estados, PE em 380/220 e BA em 220/127', () => {
  assert.equal(U.UFS.length, 27);
  assert.equal(U.infoUf('PE').tensao, '380/220');
  assert.equal(U.infoUf('ba').tensao, '220/127');
});

t('casa 40 m², 4 cômodos, 1 chuveiro e 1 ferro em PE → M2, 40 A', () => {
  const d = U.calcularDemandaDIS({ areaM2: 40, nComodos: 4, resistivos: [5.5, 1.0] });
  near(d.cargaInstaladaKw, 9.3);
  const c = U.categoriaDisNor(d.cargaInstaladaKw, d.demandaKva, U.infoUf('PE').tensao);
  assert.equal(c.categoria, 'M2'); assert.equal(c.disjuntor, 40); assert.equal(c.sistema, 'monofasico');
});

// Casa 120 m², 8 cômodos: 2 chuveiros + ferro, 2 ar-condicionados (9000 e 12000 BTU, Tabela 11), lavadora, micro-ondas e secadora.
const casa120 = {
  areaM2: 120, nComodos: 8, resistivos: [5.5, 5.5, 1.0], arKva: [U.tabela11(9000) / 1000, U.tabela11(12000) / 1000],
  maquinas: [1.5, 1.2, 1.5],
};

t('casa 120 m² em PE → T6 (18,84 kVA), 32 A', () => {
  const d = U.calcularDemandaDIS(casa120);
  near(d.demandaKva, 18.84);
  const c = U.categoriaDisNor(d.cargaInstaladaKw, d.demandaKva, U.infoUf('PE').tensao);
  assert.equal(c.categoria, 'T6'); assert.equal(c.disjuntor, 32); assert.equal(c.sistema, 'trifasico');
  assert.equal(c.caboEntrada, '3x6/6/6 mm² Cu');
});

t('mesma casa na BA → T0 (18,84 kVA), 50 A', () => {
  const d = U.calcularDemandaDIS(casa120);
  const c = U.categoriaDisNor(d.cargaInstaladaKw, d.demandaKva, U.infoUf('BA').tensao);
  assert.equal(c.categoria, 'T0'); assert.equal(c.disjuntor, 50);
});

t('tabelas 14 e 16', () => {
  near(U.tabela14([2, 1, 1]), 3);
  assert.equal(U.tabela16(2), 0.56);
});

console.log(`\n${ok} testes passaram`);
