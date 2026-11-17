/*
 * Circuitos personalizados: lista editável de circuitos (equivalência com os modos prontos, regras, cargas sem duplicar nem faltar).
 * Rodar: node tests/circuitos-personalizado.test.mjs
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
const { montarCircuitos, listaDeUnidades, cargasPorComodo, compararCircuitos, LIMITE_VA_AGRUPADO } = loadTs(resolve(ROOT, 'lib/server/circuitos.ts'));
const { gerarHtmlPdf } = loadTs(resolve(ROOT, 'lib/server/pdf-template.ts'));
const { ROOM_TEMPLATES, novoComodo } = loadTs(resolve(ROOT, 'lib/templates.ts'));
const { podarConfig, configPadrao, migrarModo } = loadTs(resolve(ROOT, 'lib/circuitos-config.ts'));
const { problemaEstrutura } = loadTs(resolve(ROOT, 'lib/validacao.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const T = Object.fromEntries(ROOM_TEMPLATES.map((x, i) => [x.label, i]));
const ids = {};
const montar = (comodos, modoCfg = { modo: 'economico', unico: [], grupos: [] }, equips = []) => {
  useStore.getState().resetState();
  for (const [tpl, nome, c, l, extra] of comodos) {
    const r = novoComodo(ROOM_TEMPLATES[T[tpl]], useStore.getState().rooms, { nome, c, l });
    r.dq = String(4 + 2 * useStore.getState().rooms.length);
    Object.assign(r, extra ?? {});
    ids[nome] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  for (const e of equips) useStore.getState().addEquip({ id: 'e' + Math.random(), room: ids[e.onde], tens: '127V', dint: '1', dist: '', alim: '', cx: '4x2', ...e });
  useStore.getState().setCircuitos(typeof modoCfg === 'function' ? modoCfg(useStore.getState().rooms) : modoCfg);
  return useStore.getState();
};
const CASA = [['Sala típica', 'Sala', '5', '4'], ['Cozinha típica', 'Cozinha', '4', '3'], ['Quarto típico', 'Quarto 1', '3.5', '3'], ['Quarto típico', 'Quarto 2', '3.5', '3'], ['Banheiro típico', 'Banheiro', '2.5', '2'], ['Área de serviço', 'Serviço', '3', '2'], ['Personalizado', 'Varanda', '4', '2']];
/** Potência de luz ('luz') ou de tomadas ('tomadas') atendida pelos circuitos, contando também os mistos. */
const atendida = (r, k) => r.circuitos.filter((c) => (k === 'luz' ? c.tipo === 'iluminacao' : c.tipo === 'tug')).reduce((a, c) => a + c.potenciaW, 0)
  + r.circuitos.filter((c) => c.tipo === 'misto').reduce((a, c) => a + c.rooms.reduce((b, x) => b + cargasPorComodo([x])[x.id][k], 0), 0);
const resumo = (lista) => lista.circuitos.map((c) => [c.nome, c.tipo, c.potenciaW, c.comprimentoM, c.comodo, c.rooms.map((r) => r.nome).join('|')]);
const fim = (st) => { const r = calcularMateriais(st); return { c: r.circuitos.map((x) => [x.nome, x.tipo, x.potenciaW, x.disjuntorA, x.bitolaMM2, x.comprimentoM, x.dr, x.comodo]), dj: r.quadro.nCircuitos, carga: r.quadro.cargaTotalW }; };

t('equivalência: a lista de cada modo pronto, vista como personalizada, dá exatamente os mesmos circuitos', () => {
  const st = montar(CASA);
  const manual = (rs) => ({ modo: 'manual', unico: [rs[0].id], grupos: [{ id: 'g', rooms: [rs[2].id, rs[3].id, rs[4].id], dists: ['', '3', '2'], unico: true }] });
  for (const cfg of [{ modo: 'norma', unico: [], grupos: [] }, { modo: 'economico', unico: [], grupos: [] }, { modo: 'maximo', unico: [], grupos: [] }, manual(st.rooms)]) {
    useStore.getState().setCircuitos(cfg);
    const s1 = useStore.getState();
    const base = montarCircuitos(s1.rooms, s1.circuitos);
    const lista = listaDeUnidades(base.unidades);
    useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista });
    const s2 = useStore.getState();
    assert.deepEqual(resumo(montarCircuitos(s2.rooms, s2.circuitos)), resumo(base), cfg.modo);
    assert.deepEqual(fim(s2), fim({ ...s1, circuitos: cfg }), cfg.modo); // inclui disjuntor, bitola e DR
  }
});

t('lista editada: mover as tomadas do quarto 2 para o circuito do quarto 1 (e do banheiro)', () => {
  const st = montar(CASA);
  const [q1, q2, ban] = [ids['Quarto 1'], ids['Quarto 2'], ids['Banheiro']];
  const lista = [
    { id: 'a', tipo: 'misto', rooms: [q1], dists: [''] },
    { id: 'b', tipo: 'luz', rooms: [q2], dists: [''] },
    { id: 'c', tipo: 'tomadas', rooms: [q2, ban], dists: ['', '2'] },
  ];
  useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista });
  const r = montarCircuitos(useStore.getState().rooms, useStore.getState().circuitos);
  const nomes = r.circuitos.map((c) => c.nome);
  assert.ok(nomes.includes('Iluminação e tomadas — Quarto 1'));
  assert.ok(nomes.includes('Iluminação — Quarto 2'));
  assert.ok(nomes.includes('Tomadas (TUG) — Quarto 2 + Banheiro'));
  // o que não estava na lista (sala, cozinha, serviço, varanda e a luz do banheiro) ganhou circuito próprio
  assert.ok(nomes.includes('Iluminação e tomadas — Sala') && nomes.includes('Iluminação — Cozinha') && nomes.includes('Iluminação — Banheiro'));
  const dr = calcularMateriais(useStore.getState()).circuitos.find((c) => c.nome === 'Tomadas (TUG) — Quarto 2 + Banheiro');
  assert.ok(dr && dr.dr); // banheiro no circuito: DR
});

t('regras valem também na lista: tomadas da cozinha não dividem com a sala (separa e avisa)', () => {
  montar(CASA);
  const lista = [{ id: 'x', tipo: 'tomadas', rooms: [ids.Sala, ids.Cozinha], dists: ['', '2'] }];
  useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista });
  const r = montarCircuitos(useStore.getState().rooms, useStore.getState().circuitos);
  assert.ok(r.circuitos.some((c) => c.nome === 'Tomadas (TUG) — Sala') && r.circuitos.some((c) => c.nome === 'Tomadas (TUG) — Cozinha'));
  assert.ok(r.avisos.some((a) => /não dividem circuito/.test(a)));
});

t('luz e tomadas juntas só para cômodo comum/banheiro: cozinha em circuito "misto" é separada com aviso', () => {
  montar(CASA);
  useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista: [{ id: 'x', tipo: 'misto', rooms: [ids.Cozinha], dists: [''] }] });
  const r = montarCircuitos(useStore.getState().rooms, useStore.getState().circuitos);
  assert.ok(r.circuitos.some((c) => c.nome === 'Iluminação — Cozinha') && r.circuitos.some((c) => c.nome === 'Tomadas (TUG) — Cozinha'));
  assert.ok(r.avisos.some((a) => /não levam iluminação e tomadas no mesmo disjuntor/.test(a)));
});

t('cômodo repetido em dois circuitos do mesmo tipo: fica só no primeiro (sem duplicar carga)', () => {
  montar(CASA);
  const lista = [
    { id: 'a', tipo: 'tomadas', rooms: [ids['Quarto 1']], dists: [''] },
    { id: 'b', tipo: 'tomadas', rooms: [ids['Quarto 1'], ids['Quarto 2']], dists: ['', '2'] },
  ];
  useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista });
  const st = useStore.getState();
  const r = montarCircuitos(st.rooms, st.circuitos);
  assert.ok(r.avisos.some((a) => /já está em outro circuito/.test(a)));
  const esperado = Object.values(cargasPorComodo(st.rooms)).reduce((s, x) => s + x.tomadas, 0);
  assert.equal(atendida(r, 'tomadas'), esperado);
});

t('teto de potência: circuito de tomadas que passa de 2.500 VA volta a um por cômodo', () => {
  montar([['Quarto típico', 'Q1', '12', '10'], ['Quarto típico', 'Q2', '12', '10'], ['Quarto típico', 'Q3', '12', '10']]);
  const rs = useStore.getState().rooms;
  const soma = rs.reduce((s, r) => s + cargasPorComodo([r])[r.id].tomadas, 0);
  assert.ok(soma > LIMITE_VA_AGRUPADO, `tomadas somam ${soma}`);
  useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista: [{ id: 'x', tipo: 'tomadas', rooms: rs.map((r) => r.id), dists: ['', '2', '2'] }] });
  const r = montarCircuitos(useStore.getState().rooms, useStore.getState().circuitos);
  assert.equal(r.circuitos.filter((c) => c.tipo === 'tug').length, 3);
  assert.ok(r.avisos.some((a) => /passam de 2500 VA/.test(a)));
});

t('cômodo novo depois de personalizar: ganha circuito próprio; cômodo apagado some da lista e dos materiais', () => {
  const st = montar(CASA);
  const lista = listaDeUnidades(montarCircuitos(st.rooms, { modo: 'economico', unico: [], grupos: [] }).unidades);
  useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista });
  const novo = novoComodo(ROOM_TEMPLATES[T['Quarto típico']], useStore.getState().rooms, { nome: 'Quarto 3', c: '3', l: '3' });
  useStore.getState().addRoom(novo);
  let r = montarCircuitos(useStore.getState().rooms, useStore.getState().circuitos);
  assert.ok(r.circuitos.some((c) => c.nome === 'Iluminação e tomadas — Quarto 3'));
  useStore.getState().removeRoom(ids.Serviço);
  const cfg = useStore.getState().circuitos;
  assert.ok(!JSON.stringify(cfg.lista).includes(ids.Serviço)); // saiu da lista guardada
  r = montarCircuitos(useStore.getState().rooms, cfg);
  assert.ok(!r.circuitos.some((c) => /Serviço/.test(c.nome)));
  const m = calcularMateriais(useStore.getState());
  assert.ok(!m.circuitos.some((c) => /Serviço/.test(c.nome)));
});

t('propriedade: em 300 listas aleatórias cada carga entra em exatamente 1 circuito (nada some, nada duplica)', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const tipos = ['Sala típica', 'Quarto típico', 'Banheiro típico', 'Cozinha típica', 'Área de serviço', 'Personalizado'];
  for (let n = 0; n < 300; n++) {
    const comodos = Array.from({ length: 2 + Math.floor(rnd() * 6) }, (_, i) => [tipos[Math.floor(rnd() * tipos.length)], `${i}-${n}`, String(2 + Math.floor(rnd() * 8)), String(2 + Math.floor(rnd() * 6))]);
    const st = montar(comodos);
    const rs = st.rooms;
    const lista = [];
    const tp = ['luz', 'tomadas', 'misto'];
    for (let k = 0; k < 1 + Math.floor(rnd() * 5); k++) {
      const sub = rs.filter(() => rnd() < 0.5).map((r) => r.id);
      if (sub.length) lista.push({ id: 'l' + k, tipo: tp[Math.floor(rnd() * 3)], rooms: sub, dists: sub.map((_, i) => (i === 0 ? '' : String(1 + Math.floor(rnd() * 4)))) });
    }
    useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista });
    const s = useStore.getState();
    const r = montarCircuitos(s.rooms, s.circuitos);
    const somaK = (k) => atendida(r, k);
    const cg = Object.values(cargasPorComodo(s.rooms));
    assert.equal(somaK('luz'), cg.reduce((a, x) => a + x.luz, 0), `luz, caso ${n}`);
    assert.equal(somaK('tomadas'), cg.reduce((a, x) => a + x.tomadas, 0), `tomadas, caso ${n}`);
    for (const c of r.circuitos) assert.ok(Number.isFinite(c.comprimentoM), `cabo, caso ${n}`);
    const m = calcularMateriais(s);
    const dj = m.materiais.filter((x) => /^Disjuntor \d+A$/.test(x.item)).reduce((a, x) => a + x.qtd, 0);
    assert.equal(dj, m.circuitos.length, `disjuntores, caso ${n}`);
  }
});

t('compararCircuitos devolve a lista atual (de qualquer modo) e as cargas por cômodo', () => {
  const st = montar(CASA);
  const c = compararCircuitos(st.rooms, [], { modo: 'maximo', unico: [], grupos: [] });
  assert.ok(c.lista.length > 0 && c.limiteVA === LIMITE_VA_AGRUPADO);
  assert.ok(Object.keys(c.cargas).length === st.rooms.length);
  const c2 = compararCircuitos(st.rooms, [], { modo: 'personalizado', unico: [], grupos: [], lista: c.lista });
  assert.deepEqual(c2.lista.map((x) => [x.tipo, x.rooms]), c.lista.map((x) => [x.tipo, x.rooms]));
});

t('migração: modo "norma" (separado) salvo passa para econômico; padrão novo é econômico', () => {
  assert.equal(configPadrao().modo, 'economico');
  assert.equal(migrarModo({ modo: 'norma', unico: [], grupos: [] }).modo, 'economico');
  assert.equal(migrarModo({ modo: 'maximo', unico: [], grupos: [] }).modo, 'maximo');
  assert.equal(podarConfig({ modo: 'personalizado', unico: [], grupos: [], lista: [{ id: 'a', tipo: 'luz', rooms: ['x', 'y'], dists: ['', '2'] }] }, [{ id: 'y' }]).lista[0].rooms.join(), 'y');
});

t('validação do servidor aceita a lista e recusa lixo', () => {
  const st = montar(CASA);
  const lista = [{ id: 'a', tipo: 'luz', rooms: [ids.Sala], dists: [''] }];
  assert.equal(problemaEstrutura({ ...st, circuitos: { modo: 'personalizado', unico: [], grupos: [], lista } }), null);
  assert.ok(problemaEstrutura({ ...st, circuitos: { modo: 'personalizado', unico: [], grupos: [], lista: [{ id: 'a', tipo: 'xx', rooms: [], dists: [] }] } }));
  assert.ok(problemaEstrutura({ ...st, circuitos: { modo: 'personalizado', unico: [], grupos: [], lista: [{ id: 'a', tipo: 'luz', rooms: [ids.Sala], dists: ['-5'] }] } }));
});

t('PDF do modo personalizado lista os circuitos juntados', () => {
  const st = montar(CASA);
  useStore.getState().setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista: [{ id: 'a', tipo: 'misto', rooms: [ids['Quarto 1'], ids.Banheiro], dists: ['', '2'] }] });
  const html = gerarHtmlPdf(useStore.getState());
  assert.ok(html.includes('personalizado (circuitos escolhidos pelo cliente)'));
  assert.ok(html.includes('Iluminação e tomadas — Quarto 1 + Banheiro'));
});
console.log(`${ok} testes OK`);
