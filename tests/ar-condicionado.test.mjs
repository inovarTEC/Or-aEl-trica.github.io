/*
 * Ar-condicionado: a demanda usa a Tabela 11 (BTU → VA) quando a capacidade foi escolhida.
 * Rodar: node tests/ar-condicionado.test.mjs
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

const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { ROOM_TEMPLATES, novoComodo } = loadTs(resolve(ROOT, 'lib/templates.ts'));
const { tabela11 } = loadTs(resolve(ROOT, 'lib/tensao-por-uf.ts'));
const { problemaEstrutura } = loadTs(resolve(ROOT, 'lib/validacao.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const demandaCom = (eqExtra) => {
  useStore.getState().resetState();
  const q = novoComodo(ROOM_TEMPLATES[0], [], { nome: 'Quarto', c: '4', l: '3' });
  useStore.getState().addRoom(q);
  useStore.getState().addEquip({ id: 'ac1', tipo: 'Ar-condicionado', room: q.id, pot: '1066', tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2', ...eqExtra });
  return calcularMateriais(useStore.getState()).quadro.demandaKva;
};

t('com BTU escolhido, a demanda usa a Tabela 11 (12.000 BTU = 1,9 kVA)', () => {
  const sem = demandaCom({});
  const com = demandaCom({ btu: 12000 });
  assert.equal(tabela11(12000), 1900);
  assert.ok(Math.abs((com - sem) - (1.9 - 1.066)) < 0.02, `diferença ${com - sem}`);
});
t('sem BTU (potência digitada à mão) mantém o cálculo pela potência', () => {
  assert.equal(demandaCom({ btu: undefined }), demandaCom({}));
});
t('a potência em watts do circuito não muda com o BTU', () => {
  const circ = (eq) => { demandaCom(eq); return calcularMateriais(useStore.getState()).circuitos.find((c) => /Ar-cond/.test(c.nome)).potenciaW; };
  assert.equal(circ({ btu: 12000 }), circ({}));
});
t('validação aceita btu inteiro positivo e recusa lixo', () => {
  const base = () => { useStore.getState().resetState(); return { ...useStore.getState() }; };
  const v = (btu) => { const d = base(); d.equips = [{ id: 'x', tipo: 'Ar-condicionado', room: '', pot: '1000', tens: '220V', dint: '', dist: '', alim: '', btu }]; return problemaEstrutura(d); };
  assert.equal(v(12000), null);
  assert.equal(v(undefined), null);
  assert.ok(v(-5) && v('12000') && v(1.5));
});
console.log(`${ok} testes OK`);
