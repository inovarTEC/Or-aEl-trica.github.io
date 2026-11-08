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


const E = loadTs(resolve(ROOT, 'lib/motor/eletrica.ts'));
const D = loadTs(resolve(ROOT, 'lib/motor/demanda.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));

// Caso 1 — iluminação (NBR 5410 9.5.2.1.2)
for (const [a, v] of [[25, 340], [15, 220], [12, 160], [10, 160], [6, 100], [32, 460]]) assert.equal(E.cargaMinimaIluminacao(a), v, `área ${a}`);

// Caso 3 — chuveiro 5500 W / 220 V
const ch = E.dimensionarCircuito({ potencia: 5500, tensao: 220, tipo: 'tue', comprimentoM: 8 });
assert.ok(Math.abs(ch.ib - 25) < 0.01);
assert.ok(ch.secao >= 4 && [25, 32].includes(ch.disjuntor), JSON.stringify(ch));
assert.ok(Math.abs(E.quedaTensao(25, 8, 4, 220) - 1.02) < 0.05);

// Caso 4 — ar 1000 W / 220 V
const ar = E.dimensionarCircuito({ potencia: 1000, tensao: 220, fp: 0.92, tipo: 'tue', comprimentoM: 10 });
assert.ok(ar.ib >= 4.5 && ar.ib <= 4.95 && ar.secao === 2.5 && ar.disjuntor >= 10, JSON.stringify(ar));

// Caso 7 — reserva do quadro (Tabela 59)
assert.ok(11 + E.reservaQuadro(11) >= 14);
assert.ok(14 + E.reservaQuadro(14) >= 18);

// Casos 5, 12 — apartamento 380/220 T
const sala = (id, base, c, l, nT, nL) => ({ id, base, nome: base, c: String(c), l: String(l), dq: '8', via: '', dd: '', dr: '', pe: '2.8', inst: 'Embutida na parede',
  pontos: Array.from({ length: nT }, (_, i) => ({ id: `${id}p${i}`, h: 'baixa', d: '', cx: '', mods: [{ id: `${id}m${i}`, t: 'T10' }] })),
  luzes: Array.from({ length: nL }, (_, i) => ({ id: `${id}l${i}`, d: '', cx: '' })), comandos: [], caixas: [] });
const rooms = [sala('a', 'Quarto', 5, 5, 4, 2), sala('b', 'Sala', 3, 5, 4, 1), sala('c', 'Banheiro', 2, 3, 1, 1),
  sala('d', 'Área de serviço', 2, 5, 4, 1), sala('e', 'Cozinha', 3, 4, 4, 1), sala('f', 'Varanda', 4, 8, 3, 2)];
const equips = [{ id: 'x', tipo: 'Chuveiro elétrico', room: 'c', pot: '5500', tens: '220V', dint: '2', dist: '', alim: '' },
  { id: 'y', tipo: 'Ar-condicionado', room: 'a', pot: '1000', tens: '220V', dint: '2', dist: '', alim: '' }];
const apto = calcularMateriais({ rede: 'Trifásico', rooms, equips, entrada: { sistemaTensao: '380/220', ligacao: 'T' } });
assert.ok(apto.circuitos.every((c) => c.tensaoV !== 127), 'nenhum 127 V em 380/220');
assert.ok(apto.circuitos.filter((c) => c.tipo !== 'tue').every((c) => c.tensaoV === 220 && c.ligacao === 'F-N'));
const chA = apto.circuitos.find((c) => c.nome.startsWith('Chuveiro'));
assert.equal(chA.tensaoV, 220); assert.equal(chA.ligacao, 'F-N');
assert.ok(Math.abs(apto.quadro.demandaKva - 8.9) <= 0.3, `D=${apto.quadro.demandaKva}`);
assert.equal(apto.quadro.categoria, 'T6'); assert.equal(apto.quadro.disjuntorGeralA, 32);
// Caso 6 — banheiro com 1 tomada + chuveiro → TUG 600 VA
assert.equal(apto.circuitos.find((c) => c.nome === 'Tomadas (TUG) — Banheiro').potenciaW, 600);
// Caso 8 — DR em área molhada
assert.ok(apto.circuitos.some((c) => c.dr));

// Caso 13 — casa 220/127, 9,9 kW → M1, 63 A
const casa = calcularMateriais({ rede: 'Monofásico', rooms: [sala('a', 'Quarto', 5, 5, 4, 2), sala('b', 'Sala', 3, 5, 4, 1),
  sala('c', 'Banheiro', 2, 3, 3, 1), sala('d', 'Área de serviço', 2, 5, 4, 2), sala('e', 'Cozinha', 3, 4, 4, 1)],
  equips: [equips[0]], entrada: { sistemaTensao: '220/127', ligacao: 'M' } });
assert.ok(Math.abs(casa.quadro.cargaInstaladaKw - 9.9) <= 0.3, `C=${casa.quadro.cargaInstaladaKw}`);
assert.equal(casa.quadro.categoria, 'M1'); assert.equal(casa.quadro.disjuntorGeralA, 63);
console.log('motor OK');
