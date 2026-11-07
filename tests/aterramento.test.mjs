/*
 * Testes do aterramento principal (aterramento-calc.ts + calcPendencias) — sem dependências extras.
 * Rodar: node tests/aterramento.test.mjs
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

const { materiaisAterramento, avisosAterramento, aterramentoPadrao } = loadTs(resolve(ROOT, 'lib/aterramento-calc.ts'));
const { calcPendencias } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));
const { problemaEstrutura } = loadTs(resolve(ROOT, 'lib/validacao.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const at = (x = {}) => ({ ...aterramentoPadrao(), ...x });
const qtd = (itens, re) => itens.filter((m) => re.test(m.descricao)).reduce((a, m) => a + m.qtd, 0);

t('3 hastes: 3 hastes + 3 conectores + 1 caixa', () => {
  const m = materiaisAterramento(at());
  assert.equal(qtd(m, /^Haste de aterramento/), 3);
  assert.equal(qtd(m, /^Conector de haste/), 3);
  assert.equal(qtd(m, /^Caixa de inspeção/), 1);
});
t('distância 10 m: cabo com 11 m, fora da prévia', () => {
  const cabo = materiaisAterramento(at({ distancia: '10' })).filter((m) => /^Cabo/.test(m.descricao));
  assert.equal(cabo.length, 1);
  assert.equal(cabo[0].qtd, 11);
  assert.equal(cabo[0].mostrarNaPrevia, false);
});
t('sem distância não inclui cabo', () => {
  assert.equal(materiaisAterramento(at()).some((m) => /^Cabo/.test(m.descricao)), false);
});
t('sem distância gera aviso', () => {
  assert.ok(avisosAterramento(at()).some((a) => a.tipo === 'aviso' && /distância/.test(a.msg)));
});
t('nHastes=2 gera info', () => {
  assert.ok(avisosAterramento(at({ nHastes: 2, distancia: '5' })).some((a) => a.tipo === 'info' && /3 hastes/.test(a.msg)));
});
t('nCaixasInspecao=0 gera aviso', () => {
  assert.ok(avisosAterramento(at({ nCaixasInspecao: 0, distancia: '5' })).some((a) => a.tipo === 'aviso' && /caixa de inspeção/.test(a.msg)));
});
t('calcPendencias: aterramento gera avisos no passo 5; sem aterramento, nada', () => {
  const base = { imovel: 'Casa', obra: 'Reforma', cobertura: '', rede: '', rooms: [], equips: [] };
  const ps = calcPendencias({ ...base, aterramento: at() }).filter((p) => p.step === 5);
  assert.equal(ps.length, 1);
  assert.match(ps[0].msg, /^Aterramento: Informe a distância/);
  assert.equal(calcPendencias(base).filter((p) => p.step === 5).length, 0);
});
t('validação: aterramento válido passa, inválido é recusado', () => {
  const base = { rooms: [], equips: [] };
  assert.equal(problemaEstrutura({ ...base, aterramento: at({ distancia: '8' }) }), null);
  assert.equal(problemaEstrutura({ ...base, aterramento: at({ bitolaCabo: '16' }) }), 'aterramento inválido');
  assert.equal(problemaEstrutura({ ...base, aterramento: at({ nHastes: -1 }) }), 'aterramento inválido');
  assert.equal(problemaEstrutura({ ...base, aterramento: at({ distancia: '-2' }) }), 'medida do aterramento inválida');
});
console.log(`\n${ok} testes passaram`);
