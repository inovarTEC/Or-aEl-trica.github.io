/*
 * Potência das TUGs por tipo de cômodo (NBR 5410, 9.5.2.2.2) — potenciaTUG e o circuito gerado.
 * Rodar: node tests/tug-potencias.test.mjs
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


const { potenciaTUG } = loadTs(resolve(ROOT, 'lib/motor/eletrica.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };

const MOLHADOS = ['Cozinha', 'Copa', 'Área de serviço', 'Lavanderia', 'Banheiro', 'Lavabo'];
const SECOS = ['Sala', 'Quarto', 'Suíte 1', 'Varanda', 'Garagem', 'Escritório', 'Cômodo'];

t('cozinha/copa/serviço/lavanderia/banheiro: 600 VA nas 3 primeiras, 100 VA nas demais', () => {
  for (const c of MOLHADOS) {
    assert.equal(potenciaTUG(1, c), 600, c);
    assert.equal(potenciaTUG(3, c), 1800, c);
    assert.equal(potenciaTUG(4, c), 1900, c);
    assert.equal(potenciaTUG(6, c), 2100, c);
  }
});

t('banheiro com 1 tomada (junto ao lavatório) = 600 VA', () => {
  assert.equal(potenciaTUG(1, 'Banheiro'), 600);
  assert.equal(potenciaTUG(1, 'banheiro social'), 600);
});

t('sala, quarto, suíte, varanda, garagem e demais: 100 VA por tomada', () => {
  for (const c of SECOS) {
    assert.equal(potenciaTUG(1, c), 100, c);
    assert.equal(potenciaTUG(5, c), 500, c);
  }
});

t('sem tomadas = 0 VA', () => {
  assert.equal(potenciaTUG(0, 'Cozinha'), 0);
  assert.equal(potenciaTUG(0, 'Sala'), 0);
});

t('o circuito de TUG do cálculo usa a potência por tipo e conta pontos de tomada (T10D = 1 ponto)', () => {
  let n = 0; const id = () => 'i' + (++n);
  const room = (base, mods) => ({
    id: id(), base, nome: base, c: '4', l: '3', medE: false, via: '', dq: '5', dd: '', dr: '',
    dqE: false, ddE: false, drE: false, dpad: '1.5', dpadE: true,
    pontos: mods.map((t) => ({ id: id(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: id(), t }] })),
    luzes: [], comandos: [], caixas: [], luzAuto: true, inst: 'Embutida na parede', pe: '2.8', obs: '',
  });
  const r = calcularMateriais({
    id: 'x', imovel: 'Casa', obra: 'Reforma', cobertura: 'Laje', rede: 'Monofásico', equips: [],
    rooms: [room('Cozinha', ['T10D', 'T10D']), room('Sala', ['T10D', 'T10D', 'T10'])],
  });
  const pot = (nome) => r.circuitos.find((c) => c.tipo === 'tug' && c.comodo === nome).potenciaW;
  assert.equal(pot('Cozinha'), 1200); // 2 pontos × 600
  assert.equal(pot('Sala'), 300);     // 3 pontos × 100
});

console.log(`\n${ok} testes OK`);
