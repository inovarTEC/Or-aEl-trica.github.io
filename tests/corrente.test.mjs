/*
 * Testes do aviso de corrente dos equipamentos (ponto-equip.ts + calcPendencias) — sem dependências extras.
 * Rodar: node tests/corrente.test.mjs
 * Usa o TypeScript do próprio projeto (devDependency) para transpilar o código REAL em memória.
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

const { correnteEquip, avisoCorrente, pontoSugerido } = loadTs(resolve(ROOT, 'lib/ponto-equip.ts'));
const { calcPendencias } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.1, `${a} ≉ ${b}`);
const estado = (e) => ({ imovel: {}, rooms: [], equips: [{ id: 'e1', tipo: 'Chuveiro elétrico', room: 'r1', pot: '5500', tens: '220V', dist: '10', dint: '', alim: '', cx: '4x2', ...e }] });
const aviso = (ps) => ps.filter((x) => x.equipId === 'e1' && /corrente estimada/.test(x.msg));

t('chuveiro 5500W/220V (resistivo, fp 1,0) = 25,0 A', () => near(correnteEquip('5500', '220V', 'Chuveiro elétrico'), 25));
t('carga não resistiva 5500W/220V (fp 0,92) ≈ 27,2 A', () => near(correnteEquip('5500', '220V', 'Ar-condicionado'), 27.2));
t('1000W/127V ≈ 8,6 A; bivolt usa 127V; sem dados → null', () => {
  near(correnteEquip('1000', '127'), 8.6);
  near(correnteEquip('1000', 'bivolt'), 8.6);
  assert.equal(correnteEquip('', '220V'), null);
  assert.equal(correnteEquip('1000', ''), null);
});
t('limiares do aviso', () => {
  assert.equal(avisoCorrente(8.6), 'ok');
  assert.equal(avisoCorrente(10), 'ok');
  assert.equal(avisoCorrente(12), 'prefira20A');
  assert.equal(avisoCorrente(16), 'prefira20A');
  assert.equal(avisoCorrente(27.2), 'ligacaoDireta');
});
t('sugestão: corrente alta tem prioridade sobre o tipo', () => {
  assert.equal(pontoSugerido('Forno elétrico'), 'T20');
  assert.equal(pontoSugerido('Forno elétrico', '4000', '127V'), 'emenda');
  assert.equal(pontoSugerido('Chuveiro elétrico', '5500', '220V'), 'borne');
  assert.equal(pontoSugerido('Ar-condicionado', '1400', '220V'), 'T20');
});
t('pendência: chuveiro 5500W/220V com T20 gera aviso (step 3, equipId)', () => {
  const a = aviso(calcPendencias(estado({ ponto: 'T20' })));
  assert.equal(a.length, 1);
  assert.equal(a[0].tipo, 'aviso');
  assert.equal(a[0].step, 3);
  assert.match(a[0].msg, /25,0 A/); // chuveiro resistivo: fp 1,0
});
t('pendência: sem aviso com emenda/borne ou corrente baixa', () => {
  assert.equal(aviso(calcPendencias(estado({ ponto: 'emenda' }))).length, 0);
  assert.equal(aviso(calcPendencias(estado({ ponto: 'borne' }))).length, 0);
  assert.equal(aviso(calcPendencias(estado({ ponto: 'T20', pot: '1400' }))).length, 0);
});
console.log(`\n${ok} testes passaram`);
