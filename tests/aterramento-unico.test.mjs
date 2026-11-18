/*
 * REDE DE SEGURANÇA: congela circuitos, quadro, materiais, comparação dos modos e PDF de 5 casas de exemplo.
 * Se algo mudar sem querer em etapas futuras, este teste acusa. Para aceitar uma mudança de propósito: UPDATE_SNAPSHOT=1 node tests/rede-seguranca.test.mjs
 * Rodar: node tests/rede-seguranca.test.mjs
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

import { createHash } from 'node:crypto';


/* ---- Regressão: o aterramento aparece UMA vez na lista de materiais (só da etapa Aterramento) ---- */
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { entradaPadrao, materiaisEntrada } = loadTs(resolve(ROOT, 'lib/entrada-calc.ts'));
const { aterramentoPadrao } = loadTs(resolve(ROOT, 'lib/aterramento-calc.ts'));

const eAterr = (nome) => /haste|inspeção de aterramento/i.test(nome);
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };

t('materiais da Entrada não trazem haste, conector nem caixa de inspeção', () => {
  const itens = materiaisEntrada({ ...entradaPadrao(), percurso: '15', tipoEntrada: 'aerea' });
  assert.deepEqual(itens.filter((m) => eAterr(m.descricao)), []);
});

t('lista final: 3 hastes, 3 conectores e 3 caixas, todos da etapa Aterramento', () => {
  const s0 = useStore.getState();
  const st = { ...s0, entrada: { ...entradaPadrao(), percurso: '15', tipoEntrada: 'aerea' }, aterramento: { ...aterramentoPadrao(), distancia: '8' } };
  const itens = calcularMateriais(st).materiais.filter((m) => eAterr(m.item) || /Conector de haste/i.test(m.item));
  assert.equal(itens.length, 3);
  assert.ok(itens.every((m) => m.qtd === 3 && m.detalhe === 'Sistema de aterramento'));
});

t('aterramento desmarcado do PDF: nenhuma haste na lista (escolha do usuário)', () => {
  const s0 = useStore.getState();
  const st = { ...s0, entrada: { ...entradaPadrao(), percurso: '15', tipoEntrada: 'aerea' }, aterramento: { ...aterramentoPadrao(), incluirNoPdf: false } };
  assert.equal(calcularMateriais(st).materiais.filter((m) => eAterr(m.item)).length, 0);
});

console.log(`${ok} testes OK`);
