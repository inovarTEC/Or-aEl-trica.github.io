/*
 * Testes da entrada / alimentador principal (entrada-calc.ts + calcPendencias) — sem dependências extras.
 * Rodar: node tests/entrada.test.mjs
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

const { materiaisEntrada, avisosEntrada, entradaPadrao } = loadTs(resolve(ROOT, 'lib/entrada-calc.ts'));
const { sistemaSugeridoUf, bitolaEntrada } = loadTs(resolve(ROOT, 'lib/tensao-por-uf.ts'));
const { calcPendencias } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));
const { problemaEstrutura, primeiraEtapaInvalida } = loadTs(resolve(ROOT, 'lib/validacao.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const ent = (x = {}) => ({ ...entradaPadrao(), ...x });
const qtd = (itens, re) => itens.filter((m) => re.test(m.descricao)).reduce((a, m) => a + m.qtd, 0);

t('sistemaSugeridoUf (220/127): 5→mono, 12→bi, 20→tri; (380/220): 12→mono, 20→tri', () => {
  assert.equal(sistemaSugeridoUf('220/127', 5), 'monofasico');
  assert.equal(sistemaSugeridoUf('220/127', 12), 'bifasico');
  assert.equal(sistemaSugeridoUf('220/127', 20), 'trifasico');
  assert.equal(sistemaSugeridoUf('380/220', 12), 'monofasico');
  assert.equal(sistemaSugeridoUf('380/220', 20), 'trifasico');
});
t('bitolaEntrada: seção 6 com 20→6, 35→10, 55→16; seção 16 com 10 m → 16', () => {
  assert.equal(bitolaEntrada(6, 20), '6');
  assert.equal(bitolaEntrada(6, 35), '10');
  assert.equal(bitolaEntrada(6, 55), '16');
  assert.equal(bitolaEntrada(16, 10), '16');
});
t('poste 6 m: 2 tubos, 1 curva 90°, 1 curva 180°, 4 luvas, 1 abraçadeira', () => {
  const m = materiaisEntrada(ent({ poste: '6m', percurso: '10' }));
  assert.equal(qtd(m, /^Tubo eletroduto \(3 m\)/), 2);
  assert.equal(qtd(m, /Curva 90°/), 1);
  assert.equal(qtd(m, /Curva 180°/), 1);
  assert.equal(qtd(m, /Luva de rosca/), 4);
  assert.equal(qtd(m, /Abraçadeira/), 1);
});
t('entrada aérea não inclui eletroduto de percurso; subterrânea inclui', () => {
  assert.equal(materiaisEntrada(ent({ tipoEntrada: 'aerea', percurso: '20' })).some((m) => /para alimentador/.test(m.descricao)), false);
  assert.equal(qtd(materiaisEntrada(ent({ tipoEntrada: 'subterranea', percurso: '20' })), /para alimentador/), 22);
});
t('cabo e disjuntor ficam fora da prévia', () => {
  const m = materiaisEntrada(ent({ percurso: '10' }));
  assert.ok(m.filter((x) => /Cabo|Disjuntor/.test(x.descricao)).every((x) => !x.mostrarNaPrevia));
});
t('percurso 35 m com bitola 6 gera aviso de bitola', () => {
  assert.ok(avisosEntrada(ent({ percurso: '35', bitola: '6' })).some((a) => /10 mm²/.test(a.msg)));
});
t('sem percurso gera aviso de percurso faltando', () => {
  assert.ok(avisosEntrada(ent()).some((a) => /percurso/i.test(a.msg)));
});
t('calcPendencias: entrada gera avisos no passo 4; sem entrada, nada', () => {
  const base = { imovel: 'Casa', obra: 'Reforma', cobertura: '', rede: '', rooms: [], equips: [] };
  const ps = calcPendencias({ ...base, entrada: ent() }).filter((p) => p.step === 4);
  assert.deepEqual(ps.map((p) => p.msg), ['Entrada: percurso não informado']);
  assert.equal(calcPendencias(base).filter((p) => p.step === 4).length, 0);
});
t('validação: entrada válida passa, valor inválido é recusado', () => {
  const base = { rooms: [], equips: [] };
  assert.equal(problemaEstrutura({ ...base, entrada: ent({ percurso: '12' }) }), null);
  assert.equal(problemaEstrutura({ ...base, entrada: ent({ bitola: '25' }) }), 'entrada inválida');
  assert.equal(problemaEstrutura({ ...base, entrada: ent({ percurso: '-3' }) }), 'medida da entrada inválida');
  assert.equal(problemaEstrutura(base), null);
});
console.log(`\n${ok} testes passaram`);
