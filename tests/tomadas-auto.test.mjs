/*
 * Tomadas automáticas pela NBR 5410 (lib/tomadas-auto.ts + store).
 * Rodar: node tests/tomadas-auto.test.mjs
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


// Navegador simulado: o store grava no localStorage a cada mudança.
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { useStore } = loadTs(resolve(ROOT, 'lib/store-cliente.ts'));
const { ROOM_TEMPLATES } = loadTs(resolve(ROOT, 'lib/templates.ts'));
const { calcularMateriais } = loadTs(resolve(ROOT, 'lib/server/calc-materiais.ts'));
const { calcTotais } = loadTs(resolve(ROOT, 'lib/server/calculator.ts'));
const { tomadasNbr } = loadTs(resolve(ROOT, 'lib/validacao.ts'));
const { limparOrfaos } = loadTs(resolve(ROOT, 'lib/limpeza.ts'));
const { exigirDados } = loadTs(resolve(ROOT, 'lib/server/rota.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const S = () => useStore.getState();
const tpl = (label) => ROOM_TEMPLATES.find((x) => x.label === label).create();
const roomDe = (id) => S().rooms.find((r) => r.id === id);
const nPontos = (r) => r.pontos.length;

function novo(label, c, l) {
  S().resetState();
  const r = tpl(label);
  S().addRoom(r);
  S().updateRoom(r.id, { c: String(c), l: String(l) });
  return r.id;
}

t('quarto típico 3×3 (perímetro 12, mínimo 3): continua com as 3 do modelo', () => {
  const id = novo('Quarto típico', 3, 3);
  assert.equal(nPontos(roomDe(id)), 3);
  assert.equal(roomDe(id).pontos.filter((p) => p.auto).length, 0);
});

t('quarto típico 8×8 (perímetro 32, mínimo 7): completa para 7 com 4 automáticas', () => {
  const id = novo('Quarto típico', 8, 8);
  const r = roomDe(id);
  assert.equal(nPontos(r), 7);
  assert.equal(r.pontos.filter((p) => p.auto).length, 4);
  const nbr = tomadasNbr(r);
  assert.equal(nbr.atual, nbr.minimo);
});

t('as tomadas automáticas entram no cálculo (prévia e PDF): mais caixas, tomadas e potência', () => {
  const id = novo('Quarto típico', 3, 3);
  const antes = calcTotais(S());
  const potAntes = calcularMateriais(S()).circuitos.filter((c) => c.tipo === 'tug').reduce((a, c) => a + c.potenciaW, 0);
  S().updateRoom(id, { c: '8', l: '8' });
  const depois = calcTotais(S());
  const potDepois = calcularMateriais(S()).circuitos.filter((c) => c.tipo === 'tug').reduce((a, c) => a + c.potenciaW, 0);
  assert.equal(depois.totalTomadas, antes.totalTomadas + 4);
  assert.ok(depois.totalCaixas >= antes.totalCaixas + 4);
  assert.equal(potDepois, potAntes + 4 * 100); // quarto: 100 VA por ponto
});

t('reduzir o cômodo remove só as automáticas que sobraram', () => {
  const id = novo('Quarto típico', 8, 8);
  S().updateRoom(id, { c: '4', l: '3' }); // perímetro 14 → mínimo 3
  const r = roomDe(id);
  assert.equal(nPontos(r), 3);
  assert.equal(r.pontos.filter((p) => p.auto).length, 0);
});

t('nunca remove tomada do modelo nem a que o usuário editou', () => {
  const id = novo('Quarto típico', 8, 8);
  const editada = roomDe(id).pontos.find((p) => p.auto);
  S().updatePonto(id, editada.id, { h: 'alta' }); // usuário assumiu esta tomada
  S().updateRoom(id, { c: '2', l: '2' });
  const r = roomDe(id);
  assert.ok(r.pontos.some((p) => p.id === editada.id), 'tomada editada deve ficar');
  assert.equal(r.pontos.filter((p) => p.auto).length, 0);
  assert.equal(nPontos(r), 4); // 3 do modelo + 1 editada
});

t('cozinha típica 6×5 (perímetro 22, mínimo 7): completa com tomada média; 600/100 VA na potência', () => {
  const id = novo('Cozinha típica', 6, 5);
  const r = roomDe(id);
  assert.equal(tomadasNbr(r).atual, 7);
  const extras = r.pontos.filter((p) => p.auto);
  assert.equal(extras.length, 2);
  assert.ok(extras.every((p) => p.h === 'media'));
  const tug = calcularMateriais(S()).circuitos.filter((c) => c.tipo === 'tug').reduce((a, c) => a + c.potenciaW, 0);
  assert.equal(tug, 3 * 600 + 4 * 100);
});

t('área de serviço 4×4 (perímetro 16, mínimo 5): completa com tomada simples T10', () => {
  const id = novo('Área de serviço', 4, 4);
  const extras = roomDe(id).pontos.filter((p) => p.auto);
  assert.equal(extras.length, 2);
  assert.ok(extras.every((p) => p.mods[0].t === 'T10'));
});

t('sem medidas válidas não mexe nas tomadas', () => {
  S().resetState();
  const r = tpl('Quarto típico');
  S().addRoom(r);
  S().updateRoom(r.id, { c: '8' }); // falta largura
  assert.equal(nPontos(roomDe(r.id)), 3);
  S().updateRoom(r.id, { l: '' });
  assert.equal(nPontos(roomDe(r.id)), 3);
});

t('digitar a medida aos poucos (1 → 10 → 8) termina no valor certo, sem sobras', () => {
  S().resetState();
  const r = tpl('Quarto típico');
  S().addRoom(r);
  S().updateRoom(r.id, { l: '8' });
  for (const c of ['1', '10', '1', '8']) S().updateRoom(r.id, { c });
  const fim = roomDe(r.id);
  assert.equal(fim.pontos.length, 7);
  assert.equal(fim.pontos.filter((p) => p.auto).length, 4);
});

t('cômodo personalizado também recebe o mínimo pelo perímetro', () => {
  const id = novo('Personalizado', 5, 4); // genérico, área 20 → ceil(18/5)=4
  assert.equal(nPontos(roomDe(id)), 4);
  assert.ok(roomDe(id).pontos.every((p) => p.auto));
});

t('as tomadas automáticas passam na validação do servidor', () => {
  const id = novo('Quarto típico', 8, 8);
  S().setField('imovel', 'Casa'); S().setField('obra', 'Reforma');
  const dados = exigirDados({ imovel: 'Casa', obra: 'Reforma', rooms: S().rooms, equips: [] }, false);
  assert.equal(dados.rooms[0].pontos.length, 7);
});

console.log(`\n${ok} testes OK`);
