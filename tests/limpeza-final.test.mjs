/*
 * LIMPEZA FINAL: apagar cômodo, equipamento ou pontos não deixa circuito, material, lista de circuitos nem texto do PDF para trás (todos os modos).
 * Rodar: node tests/limpeza-final.test.mjs
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
const { montarCircuitos, listaDeUnidades } = loadTs(resolve(ROOT, 'lib/server/circuitos.ts'));
const { gerarHtmlPdf } = loadTs(resolve(ROOT, 'lib/server/pdf-template.ts'));
const { ROOM_TEMPLATES, novoComodo } = loadTs(resolve(ROOT, 'lib/templates.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const T = Object.fromEntries(ROOM_TEMPLATES.map((x, i) => [x.label, i]));
const COMODOS = [['Sala típica', 'SalaAlfa', '5', '4'], ['Quarto típico', 'QuartoBeta', '3.5', '3'], ['Banheiro típico', 'BanheiroGama', '2.5', '2'], ['Cozinha típica', 'CozinhaDelta', '4', '3'], ['Área de serviço', 'ServicoEpsilon', '3', '2'], ['Personalizado', 'VarandaZeta', '4', '2']];
const NOMES = COMODOS.map((c) => c[1]);
const ids = {};

function montar(modo) {
  useStore.getState().resetState();
  for (const [tpl, nome, c, l] of COMODOS) {
    const r = novoComodo(ROOM_TEMPLATES[T[tpl]], useStore.getState().rooms, { nome, c, l });
    r.dq = String(5 + 2 * useStore.getState().rooms.length); ids[nome] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  const eq = (tipo, pot, onde, tens, extra = {}) => useStore.getState().addEquip({ id: `eq_${tipo}_${onde}`, tipo, room: ids[onde], pot, tens, dint: '1', dist: '', alim: '', cx: '4x2', ...extra });
  eq('Chuveiro elétrico', '5500', 'BanheiroGama', '220V');
  eq('Ar-condicionado', '1100', 'QuartoBeta', '220V', { btu: 12000 });
  eq('Bomba', '368', 'ServicoEpsilon', '127V', { circuito: 'comodo' });   // divide o circuito do serviço
  eq('Bomba', '300', 'VarandaZeta', '127V');                              // circuito próprio
  const s = useStore.getState();
  if (modo === 'personalizado') {
    const lista = listaDeUnidades(montarCircuitos(s.rooms, { modo: 'maximo', unico: [], grupos: [] }).unidades);
    useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista });
  } else useStore.getState().setCircuitos({ modo, unico: [], grupos: [] });
  return useStore.getState();
}

/** Tudo que o cálculo, a prévia e o PDF mostram tem de bater entre si e não citar o que foi apagado. */
function conferir(st, apagados, rotulo) {
  const r = calcularMateriais(st);
  const html = gerarHtmlPdf(st);
  for (const nome of apagados) {
    assert.ok(!r.circuitos.some((c) => (c.nome + (c.comodo ?? '')).includes(nome)), `${rotulo}: circuito cita ${nome}`);
    assert.ok(!r.materiais.some((m) => `${m.item} ${m.detalhe ?? ''}`.includes(nome)), `${rotulo}: material cita ${nome}`);
    assert.ok(!html.includes(nome), `${rotulo}: PDF cita ${nome}`);
  }
  const dj = r.materiais.filter((m) => /^Disjuntor \d+A$/.test(m.item)).reduce((a, m) => a + m.qtd, 0);
  assert.equal(dj, r.circuitos.length, `${rotulo}: disjuntores x circuitos`);
  assert.equal(Math.round(r.circuitos.reduce((a, c) => a + c.potenciaW, 0)), r.quadro.cargaTotalW, `${rotulo}: carga total`);
  const idsVivos = new Set(st.rooms.map((x) => x.id)), idsEq = new Set(st.equips.map((e) => e.id));
  for (const e of st.equips) assert.ok(idsVivos.has(e.room), `${rotulo}: equipamento de cômodo apagado`);
  for (const c of st.circuitos.lista ?? []) for (const id of c.rooms) assert.ok(idsVivos.has(id), `${rotulo}: lista guarda cômodo apagado`);
  assert.ok(Number.isFinite(r.quadro.demandaKva), `${rotulo}: demanda`);
  return r;
}

for (const modo of ['economico', 'maximo', 'personalizado']) {
  t(`[${modo}] estado inicial consistente`, () => { conferir(montar(modo), [], modo); });

  t(`[${modo}] apagar cada cômodo (um por vez) não deixa circuito, material, lista nem PDF para trás`, () => {
    for (const nome of NOMES) {
      montar(modo);
      useStore.getState().removeRoom(ids[nome]);
      const st = useStore.getState();
      assert.equal(st.rooms.length, NOMES.length - 1);
      conferir(st, [nome], `${modo}/${nome}`);
    }
  });

  t(`[${modo}] apagar cada equipamento: some o circuito (ou a potência que dividia) e a demanda cai`, () => {
    const base = calcularMateriais(montar(modo));
    for (const eqId of useStore.getState().equips.map((e) => e.id)) {
      montar(modo);
      useStore.getState().removeEquip(eqId);
      const st = useStore.getState();
      assert.ok(!st.equips.some((e) => e.id === eqId));
      const r = conferir(st, [], `${modo}/${eqId}`);
      assert.ok(r.quadro.demandaKva <= base.quadro.demandaKva + 1e-9, `${eqId}: demanda subiu`);
      assert.ok(r.quadro.cargaTotalW < base.quadro.cargaTotalW, `${eqId}: carga não caiu`);
    }
  });

  t(`[${modo}] tirar todos os pontos (luz e tomadas) de um cômodo: ele some dos circuitos`, () => {
    for (const nome of ['QuartoBeta', 'CozinhaDelta', 'BanheiroGama']) {
      montar(modo);
      useStore.getState().updateRoom(ids[nome], { pontos: [], luzes: [], comandos: [] });
      const r = conferir(useStore.getState(), [], `${modo}/${nome}`);
      assert.ok(!r.circuitos.some((c) => c.tipo === 'iluminacao' && c.comodo.includes(nome)), `${modo}/${nome}: luz sobrou no nome do circuito`);
      assert.ok(!r.circuitos.some((c) => c.tipo === 'tug' && c.comodo.includes(nome)), `${modo}/${nome}: tomadas sobraram`);
    }
  });

  t(`[${modo}] apagar todos os cômodos: sem circuito, sem erro`, () => {
    montar(modo);
    for (const nome of NOMES) useStore.getState().removeRoom(ids[nome]);
    const r = calcularMateriais(useStore.getState());
    assert.equal(r.circuitos.filter((c) => c.tipo !== 'tue').length, 0);
    assert.ok(!gerarHtmlPdf(useStore.getState()).includes('SalaAlfa'));
  });
}
console.log(`${ok} testes OK`);
