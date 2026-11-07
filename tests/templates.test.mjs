/*
 * Modelos de cômodo (lib/templates.ts): instalação padrão, suítes, distância entre pontos e tomada dupla.
 * Rodar: node tests/templates.test.mjs
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


const { ROOM_TEMPLATES, dpadPorTipo, tomadaPadrao } = loadTs(resolve(ROOT, 'lib/templates.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const tpl = (label) => {
  const x = ROOM_TEMPLATES.find((m) => m.label.startsWith(label));
  assert.ok(x, `modelo ${label} não encontrado`);
  return x.create();
};
const tipos = (r) => r.pontos.flatMap((p) => p.mods.map((m) => m.t));

t('todos os modelos vêm com instalação "Embutida na parede"', () => {
  for (const m of ROOM_TEMPLATES) assert.equal(m.create().inst, 'Embutida na parede', m.label);
});

t('suítes 1, 2 e 3 ficam depois do Quarto e antes da Sala', () => {
  const labels = ROOM_TEMPLATES.map((m) => m.label);
  const iq = labels.findIndex((l) => l.startsWith('Quarto'));
  const is = labels.findIndex((l) => l.startsWith('Sala'));
  const s = [1, 2, 3].map((n) => labels.findIndex((l) => l.startsWith(`Suíte ${n}`)));
  assert.ok(iq >= 0 && iq < s[0] && s[0] < s[1] && s[1] < s[2] && s[2] < is, labels.join(' | '));
});

t('suíte 1: 2 duplas, 1 luz no interruptor simples', () => {
  const r = tpl('Suíte 1');
  assert.equal(r.nome, 'Suíte 1');
  assert.deepEqual(tipos(r), ['T10D', 'T10D']);
  assert.equal(r.luzes.length, 1);
  assert.equal(r.comandos.length, 1);
  assert.equal(r.comandos[0].t, 'IS');
  assert.deepEqual(r.comandos[0].luzes, [r.luzes[0].id]);
});

t('suíte 2: 3 duplas, 1 luz com IS, dpad 1,5', () => {
  const r = tpl('Suíte 2');
  assert.deepEqual(tipos(r), ['T10D', 'T10D', 'T10D']);
  assert.equal(r.luzes.length, 1);
  assert.equal(r.comandos[0].t, 'IS');
  assert.equal(r.dpad, '1.5');
});

t('suíte 3: 4 duplas, 2 luzes no mesmo interruptor simples, dpad 1,5', () => {
  const r = tpl('Suíte 3');
  assert.deepEqual(tipos(r), ['T10D', 'T10D', 'T10D', 'T10D']);
  assert.equal(r.luzes.length, 2);
  assert.equal(r.comandos.length, 1);
  assert.deepEqual(r.comandos[0].luzes, r.luzes.map((l) => l.id));
  assert.equal(r.dpad, '1.5');
});

t('suítes não trazem banheiro embutido', () => {
  for (const n of [1, 2, 3]) assert.ok(!/banheiro/i.test(tpl(`Suíte ${n}`).base));
});

t('dpad por tipo de cômodo', () => {
  const esperado = { 'Quarto': '1.5', 'Sala': '1.5', 'Cozinha': '1.0', 'Banheiro': '1.0', 'Área de serviço': '1.0', 'Personalizado': '1.5' };
  for (const [label, d] of Object.entries(esperado)) assert.equal(tpl(label).dpad, d, label);
  for (const n of [1, 2, 3]) assert.equal(tpl(`Suíte ${n}`).dpad, '1.5');
  for (const c of ['Copa', 'Lavanderia']) assert.equal(dpadPorTipo(c), '1.0', c);
  for (const c of ['Garagem', 'Varanda', 'Terraço', 'Subsolo']) assert.equal(dpadPorTipo(c), '2.0', c);
  assert.equal(dpadPorTipo('Escritório'), '1.5');
  assert.equal(dpadPorTipo(''), '1.5');
});

t('tomada dupla nos modelos Quarto, Sala e Suítes; simples em Banheiro e Área de serviço', () => {
  for (const l of ['Quarto', 'Sala', 'Suíte 1', 'Suíte 2', 'Suíte 3']) assert.ok(tipos(tpl(l)).every((x) => x === 'T10D'), l);
  for (const l of ['Banheiro', 'Área de serviço']) assert.ok(tipos(tpl(l)).filter((x) => x.startsWith('T10')).every((x) => x === 'T10'), l);
  assert.deepEqual(tipos(tpl('Cozinha')).filter((x) => x === 'T20').length, 2);
});

t('tomadaPadrao: T10 em banheiro/serviço/lavanderia/garagem, T10D nos demais', () => {
  for (const c of ['Banheiro Banheiro', 'Lavabo', 'Área de serviço', 'Lavanderia', 'Garagem']) assert.equal(tomadaPadrao(c), 'T10', c);
  for (const c of ['Sala', 'Quarto Suíte 1', 'Cozinha', 'Varanda', 'Cômodo', '']) assert.equal(tomadaPadrao(c), 'T10D', c);
});

console.log(`\n${ok} testes OK`);
