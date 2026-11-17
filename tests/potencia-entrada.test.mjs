/*
 * Potência estimada da entrada: carga instalada (kW) em monofásica/bifásica, demanda (kVA) em trifásica.
 * Rodar: node tests/potencia-entrada.test.mjs
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
const { potenciaAuto, sincronizarEntrada, entradaPadrao, tensaoDoSistema, patchUf, patchTensao, patchTrifasico } = loadTs(resolve(ROOT, 'lib/entrada-calc.ts'));
const { errosEtapa } = loadTs(resolve(ROOT, 'lib/validacao.ts'));

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const casa = (equips) => {
  useStore.getState().resetState();
  const ids = {};
  for (const [i, nome, c, l] of [[4, 'Sala', '5', '4'], [5, 'Cozinha', '4', '3'], [0, 'Quarto', '3.5', '3'], [6, 'Banheiro', '2.5', '2']]) {
    const r = novoComodo(ROOM_TEMPLATES[i], useStore.getState().rooms, { nome, c, l });
    ids[nome] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  for (const e of equips) useStore.getState().addEquip({ id: 'q' + Math.random(), room: ids.Banheiro, tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2', ...e });
  const q = calcularMateriais(useStore.getState()).quadro;
  return { q, p: { demandaKva: q.demandaKva, cargaInstaladaKw: q.cargaInstaladaKw, ligacaoNecessaria: q.ligacaoNecessaria, categoria: q.categoria, disjuntorGeralA: q.disjuntorGeralA, sistema: q.sistema, uf: null } };
};

t('carga pequena (monofásica/bifásica): potência automática = carga instalada em kW', () => {
  const { q, p } = casa([{ tipo: 'Chuveiro elétrico', pot: '4000' }]);
  assert.notEqual(q.ligacaoNecessaria, 'trifasico');
  const a = potenciaAuto(p);
  assert.equal(a.unidade, 'kW'); assert.equal(a.valor, q.cargaInstaladaKw); assert.equal(a.label, 'Carga instalada');
});
t('carga grande (trifásica): potência automática = demanda em kVA', () => {
  const { q, p } = casa([
    { tipo: 'Chuveiro elétrico', pot: '5500' }, { tipo: 'Chuveiro elétrico', pot: '5500' }, { tipo: 'Torneira elétrica', pot: '3500' },
    { tipo: 'Secadora', pot: '2500' }, { tipo: 'Ar-condicionado', pot: '2000' },
  ]);
  assert.equal(q.ligacaoNecessaria, 'trifasico');
  const a = potenciaAuto(p);
  assert.equal(a.unidade, 'kVA'); assert.equal(a.valor, q.demandaKva);
});
t('ligação necessária não depende do sistema escolhido (sem laço de sincronização)', () => {
  const { p } = casa([{ tipo: 'Chuveiro elétrico', pot: '4000' }]);
  const antes = potenciaAuto(p).valor;
  useStore.getState().updateEntrada({ sistema: 'trifasico', sistemaManual: true, tipoEntrada: 'aerea' });
  const q2 = calcularMateriais(useStore.getState()).quadro;
  assert.equal(q2.ligacaoNecessaria, p.ligacaoNecessaria);
  assert.equal(potenciaAuto({ ...p, ligacaoNecessaria: q2.ligacaoNecessaria, cargaInstaladaKw: q2.cargaInstaladaKw }).valor, antes);
});
t('sincronizarEntrada preenche com o valor automático e não sobrescreve o manual', () => {
  const { p } = casa([{ tipo: 'Chuveiro elétrico', pot: '4000' }]);
  const v = potenciaAuto(p).valor;
  assert.equal(sincronizarEntrada(entradaPadrao(), v).potenciaDemandada, String(Math.round(v * 100) / 100));
  assert.equal(sincronizarEntrada({ ...entradaPadrao(), potenciaDemandada: '9', potenciaManual: true }, v).potenciaDemandada, undefined);
});
t('sem dados do motor, usa a demanda em kVA', () => {
  assert.equal(potenciaAuto({ demandaKva: 7, categoria: 'M1', disjuntorGeralA: 63, sistema: '220/127', uf: null }).unidade, 'kVA');
  assert.equal(potenciaAuto(null), null);
});
t('aviso: soma dos circuitos acima do limite em kW da categoria (monofásica/bifásica)', () => {
  // Casa de 6 cômodos (67,5 m²) + chuveiro 5.500 W + ar 1.000 W: DIS = 10,8 kW (B0, até 11 kW); circuitos NBR ≈ 12,8 kW.
  useStore.getState().resetState();
  const ids = {};
  for (const [i, nome, c, l] of [[4, 'Sala', '5', '4'], [5, 'Cozinha', '4', '3'], [0, 'Quarto', '3.5', '3'], [1, 'Suíte', '4', '3.5'], [6, 'Banheiro', '2.5', '2'], [7, 'Área de serviço', '3', '2']]) {
    const r = novoComodo(ROOM_TEMPLATES[i], useStore.getState().rooms, { nome, c, l }); ids[nome] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  useStore.getState().addEquip({ id: 'c1', tipo: 'Chuveiro elétrico', room: ids.Banheiro, pot: '5500', tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2' });
  useStore.getState().addEquip({ id: 'c2', tipo: 'Ar-condicionado', room: ids.Suíte, pot: '1000', tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2' });
  const q = calcularMateriais(useStore.getState()).quadro;
  assert.notEqual(q.ligacaoSistema, 'trifasico');
  assert.ok(q.cargaTotalW / 1000 > 11, `circuitos ${q.cargaTotalW}`);
  assert.match(q.avisoCircuitos, /soma dos circuitos/);
  assert.match(q.avisoCircuitos, new RegExp(q.categoria));
});
t('sem aviso quando os circuitos cabem na categoria', () => {
  useStore.getState().resetState();
  const r = novoComodo(ROOM_TEMPLATES[7], [], { nome: 'Serviço', c: '2', l: '2' });
  useStore.getState().addRoom(r);
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  const q = calcularMateriais(useStore.getState()).quadro;
  assert.equal(q.avisoCircuitos, undefined);
});
// ---- Estado/tensão na etapa 1 e aviso de ligação trifásica ----
const casaGrande = () => {
  useStore.getState().resetState();
  const ids = {};
  for (const [i, nome, c, l] of [[4, 'Sala', '5', '4'], [5, 'Cozinha', '4', '3'], [0, 'Quarto', '3.5', '3'], [1, 'Suíte', '4', '3.5'], [6, 'Banheiro', '2.5', '2'], [7, 'Área de serviço', '3', '2']]) {
    const r = novoComodo(ROOM_TEMPLATES[i], useStore.getState().rooms, { nome, c, l }); ids[nome] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  useStore.getState().addEquip({ id: 'c1', tipo: 'Chuveiro elétrico', room: ids.Banheiro, pot: '5500', tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2' });
  useStore.getState().addEquip({ id: 'c2', tipo: 'Ar-condicionado', room: ids.Suíte, pot: '1000', tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2' });
  return useStore.getState();
};
t('estourou o limite: o aviso recomenda trifásico (categoria, disjuntor, cabo) e oferece o botão', () => {
  const q = calcularMateriais(casaGrande()).quadro;
  assert.match(q.avisoCircuitos, /Recomendamos ligação trifásica 220 V \(categoria T\d/);
  assert.match(q.avisoCircuitos, /pedida à distribuidora/);
  assert.ok(q.sugestaoTrifasica && /^T/.test(q.sugestaoTrifasica.categoria) && q.sugestaoTrifasica.tensao === '220 V');
});
t('botão "Usar trifásico": a categoria passa a ser T, o aviso some e o quadro mostra a demanda', () => {
  const st = casaGrande();
  useStore.getState().updateEntrada(patchTrifasico(st.entrada));
  const q = calcularMateriais(useStore.getState()).quadro;
  assert.equal(q.ligacaoSistema, 'trifasico');
  assert.match(q.categoria, /^T/);
  assert.equal(q.avisoCircuitos, undefined);
  const p = { demandaKva: q.demandaKva, cargaInstaladaKw: q.cargaInstaladaKw, ligacao: q.ligacaoSistema, categoria: q.categoria, disjuntorGeralA: q.disjuntorGeralA, sistema: q.sistema, uf: null };
  assert.equal(potenciaAuto(p, true).unidade, 'kVA'); assert.equal(potenciaAuto(p, true).label, 'Demanda total');
  assert.equal(potenciaAuto({ ...p, ligacao: 'bifasico' }, true).unidade, 'kW');
});
t('perto do limite (mais de 90%): alerta com a alternativa, sem botão', () => {
  // apartamento pequeno: circuitos de 9,2 kW contra 10 kW da categoria M1
  useStore.getState().resetState();
  const ids = {};
  for (const [i, nome, c, l] of [[4, 'Sala', '4', '3'], [0, 'Quarto', '3', '3'], [6, 'Banheiro', '2', '2'], [5, 'Cozinha', '3', '2.5']]) {
    const r = novoComodo(ROOM_TEMPLATES[i], useStore.getState().rooms, { nome, c, l }); ids[nome] = r.id; useStore.getState().addRoom(r);
  }
  useStore.getState().updateEntrada({ sistemaTensao: '220/127' });
  useStore.getState().addEquip({ id: 'x', tipo: 'Chuveiro elétrico', room: ids.Banheiro, pot: '5500', tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2' });
  const q = calcularMateriais(useStore.getState()).quadro;
  assert.match(q.avisoCircuitos, /perto do limite/);
  assert.match(q.avisoCircuitos, /a alternativa é ligação trifásica 220 V/);
  assert.equal(q.sugestaoTrifasica, undefined); // sem botão: ainda cabe na categoria
});
t('tensão dos sistemas: "não sei" adota 220/127 V (monofásico 127, bifásico 220, trifásico 220); 380/220 V: 220 e 380', () => {
  assert.equal(tensaoDoSistema('monofasico', undefined), '127');
  assert.equal(tensaoDoSistema('bifasico', undefined), '220');
  assert.equal(tensaoDoSistema('trifasico', undefined), '220');
  assert.equal(tensaoDoSistema('monofasico', '220/127'), '127');
  assert.equal(tensaoDoSistema('monofasico', '380/220'), '220');
  assert.equal(tensaoDoSistema('trifasico', '380/220'), '380');
});
t('escolher o estado na etapa 1 já define a tensão e o sistema da entrada (PE = 380/220 V)', () => {
  const p = patchUf('PE', 0);
  assert.equal(p.uf, 'PE'); assert.equal(p.sistemaTensao, '380/220'); assert.equal(p.sistemaManual, false);
  assert.deepEqual(patchUf('', 0), { uf: '', sistemaTensao: undefined });
  assert.equal(patchTensao({ sistema: 'trifasico' }, '380/220').tensao, '380');
});
t('etapa 1 exige o estado (UF)', () => {
  const st = useStore.getState();
  const base = { ...st, imovel: 'Casa', obra: 'Construção nova' };
  assert.ok(errosEtapa({ ...base, entrada: { ...entradaPadrao(), uf: '' } }, 0).some((m) => /estado/i.test(m)));
  assert.deepEqual(errosEtapa({ ...base, entrada: { ...entradaPadrao(), uf: 'PE' } }, 0), []);
});
t('equipamento 220 V com estado 380/220 V (tomadas de 220 V) pode dividir o circuito do cômodo', () => {
  useStore.getState().resetState();
  const r = novoComodo(ROOM_TEMPLATES[5], [], { nome: 'Serviço', c: '3', l: '2' }); useStore.getState().addRoom(r);
  useStore.getState().updateEntrada(patchUf('PE', 0));
  useStore.getState().addEquip({ id: 'b', tipo: 'Bomba', room: r.id, pot: '368', tens: '220V', dint: '1', dist: '', alim: '', cx: '4x2', circuito: 'comodo' });
  const m = calcularMateriais(useStore.getState());
  assert.ok(!m.circuitos.some((c) => c.tipo === 'tue'), 'dividiu');
  assert.deepEqual(m.avisosEquip, []);
});
t('sistema escolhido (trifásico): campo "Potência estimada" e quadro mostram o MESMO valor, a demanda em kVA', () => {
  const st = casaGrande();
  const q0 = calcularMateriais(st).quadro;
  const mono = { demandaKva: q0.demandaKva, cargaInstaladaKw: q0.cargaInstaladaKw, ligacao: q0.ligacaoSistema, ligacaoNecessaria: q0.ligacaoNecessaria, categoria: q0.categoria, disjuntorGeralA: q0.disjuntorGeralA, sistema: q0.sistema, uf: null };
  useStore.getState().updateEntrada(patchTrifasico(st.entrada));
  const s2 = useStore.getState();
  const q = calcularMateriais(s2).quadro;
  const p = { demandaKva: q.demandaKva, cargaInstaladaKw: q.cargaInstaladaKw, ligacao: q.ligacaoSistema, ligacaoNecessaria: q.ligacaoNecessaria, categoria: q.categoria, disjuntorGeralA: q.disjuntorGeralA, sistema: q.sistema, uf: null };
  assert.equal(s2.entrada.sistemaManual, true);
  const campo = potenciaAuto(p, s2.entrada.sistemaManual);   // o que o campo preenche
  assert.equal(campo.unidade, 'kVA');
  assert.equal(campo.valor, q.demandaKva);
  assert.equal(campo.valor, potenciaAuto(p, true).valor);    // o mesmo que o quadro exibe
  assert.ok(campo.valor < potenciaAuto(mono, false).valor);  // antes (monofásico/bifásico) era a carga em kW, maior
  // e o campo é gravado com esse valor e a bitola acompanha a categoria T
  const patch = sincronizarEntrada(s2.entrada, campo.valor);
  assert.equal(patch.potenciaDemandada, String(Math.round(campo.valor * 100) / 100));
});
t('sistema automático: o campo usa a ligação mínima (não depende do sistema, sem laço de sincronização)', () => {
  const st = casaGrande();
  const q = calcularMateriais(st).quadro;
  const p = { demandaKva: q.demandaKva, cargaInstaladaKw: q.cargaInstaladaKw, ligacao: 'trifasico', ligacaoNecessaria: 'bifasico', categoria: q.categoria, disjuntorGeralA: q.disjuntorGeralA, sistema: q.sistema, uf: null };
  assert.equal(potenciaAuto(p, false).unidade, 'kW');   // automático: pela ligação mínima (carga)
  assert.equal(potenciaAuto(p, true).unidade, 'kVA');   // escolhido trifásico: pela demanda
});
console.log(`${ok} testes OK`);
