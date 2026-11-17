/* ===== Divisão de circuitos (NBR 5410) — servidor =====
 * Cada "unidade" é um cômodo sozinho ou um grupo de cômodos vizinhos. Cada unidade gera:
 *   - um circuito de iluminação (qualquer cômodo pode dividir a luz) + circuitos de tomadas (só dividem cômodos compatíveis:
 *     cozinha/serviço entre si, comuns com banheiros; área externa com aviso), ou
 *   - um circuito só (iluminação + tomadas), quando `unico` e todos os cômodos forem comuns ou banheiros.
 * No grupo, o cabo é medido UMA vez: trajeto até o quadro do 1º cômodo + metros extras até cada vizinho
 * (nunca o trajeto inteiro de cada cômodo) — assim cabo e eletroduto não se duplicam.
 */
import type { CircuitoManual, ConfigCircuitos, Equip, GrupoCircuito, ModoCircuitos, Room } from '../types';
import { num, routeLen } from '../util';
import { podeDividirCircuito } from '../ponto-equip';
import { potenciaIluminacao, potenciaTUG } from '../motor/eletrica';
import { pontosTomada } from '../nbr5410-regras';
import { aceitaMisto, classeCircuito, podarConfig, tomadasCompativeis } from '../circuitos-config';

/** Teto de potência de um circuito que junta cômodos ou iluminação+tomadas (≈ 20 A em 127 V). Acima disso, volta a separar. */
export const LIMITE_VA_AGRUPADO = 2500;

export interface Unidade { rooms: Room[]; dists: number[]; unico: boolean }
export interface Resolucao { unidades: Unidade[]; avisos: string[] }
export interface CircuitoBruto {
  nome: string; tipo: 'iluminacao' | 'tug' | 'misto'; potenciaW: number; comprimentoM: number;
  comodo: string; unidade: number; rooms: Room[];
}

const nomeDe = (r: Room) => r?.nome || r?.base || 'Cômodo';

/** Pontos de tomada do cômodo (mesma regra de countMods, sem importar o calculator). */
function nTomadas(r: Room): number {
  let n = 0;
  for (const p of r?.pontos ?? []) for (const m of p?.mods ?? []) if (String(m?.t ?? '').startsWith('T')) n += pontosTomada(m.t);
  for (const c of r?.comandos ?? []) for (const sw of c?.sws ?? []) if (String(sw?.tom ?? '').startsWith('T')) n += pontosTomada(sw.tom);
  return n;
}
const potIlum = (r: Room) => ((r?.luzes?.length ?? 0) > 0 ? potenciaIluminacao(num(r.c) * num(r.l), r.luzes.length) : 0);
const potTug = (r: Room) => (nTomadas(r) > 0 ? potenciaTUG(nTomadas(r), r.base || nomeDe(r)) : 0);
const mesmaInstalacao = (a: Room, b: Room) => (a?.inst ?? '') === (b?.inst ?? '') && (a?.materialAparente ?? '') === (b?.materialAparente ?? '');

/** Modo "mais econômico": junta o cômodo com aquele cujo caminho ele segue ("pelo caminho de outro"); metros extras = desvio (dr). */
function gruposPorVia(rooms: Room[]): GrupoCircuito[] {
  const porId = new Map(rooms.map((r) => [r.id, r]));
  const pai = new Map<string, string>();
  for (const r of rooms) {
    const p = r.via ? porId.get(r.via) : undefined;
    if (!p || p.id === r.id) continue;
    if (!mesmaInstalacao(r, p)) continue;
    pai.set(r.id, p.id);
  }
  const raiz = (id: string): string => { const seen = new Set<string>(); let x = id; while (pai.has(x) && !seen.has(x)) { seen.add(x); x = pai.get(x)!; } return x; };
  const comp = new Map<string, Room[]>();
  for (const r of rooms) { if (!pai.has(r.id) && ![...pai.values()].includes(r.id)) continue; const k = raiz(r.id); comp.set(k, [...(comp.get(k) ?? []), r]); }
  const out: GrupoCircuito[] = [];
  for (const [k, membros] of comp) {
    if (membros.length < 2) continue;
    const ordem = [porId.get(k)!, ...membros.filter((m) => m.id !== k)];
    out.push({
      id: `auto_${k}`, rooms: ordem.map((m) => m.id),
      dists: ordem.map((m, i) => (i === 0 || !(num(m.dr) > 0) ? '' : String(num(m.dr)))), unico: true,
    });
  }
  return out;
}

/**
 * Divide os cômodos de uma unidade em circuitos de TOMADAS: cada cômodo (com tomadas) entra no primeiro circuito
 * em que é compatível com todos os que já estão nele (cozinha/serviço só entre si; comuns com banheiros; externo com aviso).
 */
export function particoesTomadas(rooms: Room[]): Room[][] {
  const parts: Room[][] = [];
  for (const r of rooms) {
    if (nTomadas(r) === 0) continue;
    const alvo = parts.find((p) => p.every((x) => tomadasCompativeis(classeCircuito(x), classeCircuito(r)) !== 'nao'));
    if (alvo) alvo.push(r); else parts.push([r]);
  }
  return parts;
}

export function resolverUnidades(rooms: Room[], cfgIn: ConfigCircuitos | undefined, modoForcado?: ModoCircuitos): Resolucao {
  rooms = rooms ?? [];
  const cfg = podarConfig(cfgIn, rooms);
  const modo: ModoCircuitos = modoForcado ?? cfg.modo ?? 'norma';
  const avisos: string[] = [];
  const porId = new Map(rooms.map((r) => [r.id, r]));
  const unicoSolto = (r: Room) => aceitaMisto(classeCircuito(r))
    && (modo === 'economico' || modo === 'maximo' || (modo === 'manual' && cfg.unico.includes(r.id)));

  // 1) Grupos válidos: mesma instalação (embutida x aparente) e cada cômodo em 1 grupo. A classe do cômodo só limita as TOMADAS (ver particoesTomadas).
  const brutos: GrupoCircuito[] = modo === 'maximo' ? gruposPorVia(rooms) : modo === 'manual' ? cfg.grupos : [];
  const usados = new Set<string>();
  const grupos: { id: string; rooms: Room[]; dists: number[]; unico: boolean }[] = [];
  for (const g of brutos) {
    const membros: Room[] = [], dists: number[] = [];
    g.rooms.forEach((id, i) => {
      const r = porId.get(id);
      if (!r || usados.has(id) || membros.includes(r)) return; // cômodo inexistente, já em outro grupo ou repetido neste
      const primeiro = membros[0];
      const ok = !primeiro || mesmaInstalacao(r, primeiro);
      if (!ok) { if (modo === 'manual') avisos.push(`${nomeDe(r)} não pode dividir circuito com ${nomeDe(primeiro ?? r)} (instalação diferente: embutida x aparente): fica separado.`); return; }
      membros.push(r); dists.push(membros.length === 1 ? 0 : num(g.dists?.[i]));
    });
    if (membros.length < 2) continue;
    membros.forEach((m) => usados.add(m.id));
    grupos.push({ id: g.id, rooms: membros, dists, unico: membros.every((m) => aceitaMisto(classeCircuito(m))) && (modo === 'maximo' || !!g.unico) });
  }

  // 2) Unidades na ordem dos cômodos (o grupo entra onde está o primeiro membro).
  const unidades: Unidade[] = [];
  const emitidos = new Set<string>();
  for (const r of rooms) {
    const g = grupos.find((x) => x.rooms.includes(r));
    if (g) {
      if (emitidos.has(g.id)) continue;
      emitidos.add(g.id);
      unidades.push({ rooms: g.rooms, dists: g.dists, unico: g.unico });
    } else {
      unidades.push({ rooms: [r], dists: [0], unico: unicoSolto(r) });
    }
  }

  // 3) Teto de potência: se o circuito juntado passa do limite, volta a separar (primeiro iluminação/tomadas, depois os cômodos).
  const final: Unidade[] = [];
  for (const u of unidades) {
    const ilum = u.rooms.reduce((s, r) => s + potIlum(r), 0);
    const tug = u.rooms.reduce((s, r) => s + potTug(r), 0);
    const tugMax = Math.max(0, ...particoesTomadas(u.rooms).map((p) => p.reduce((s, r) => s + potTug(r), 0)));
    const nomes = u.rooms.map(nomeDe).join(' + ');
    let unico = u.unico;
    if (unico && ilum + tug > LIMITE_VA_AGRUPADO) {
      unico = false;
      if (ilum > 0 && tug > 0) avisos.push(`${nomes}: iluminação e tomadas somam mais de ${LIMITE_VA_AGRUPADO} VA — ficam em disjuntores separados.`);
    }
    if (u.rooms.length > 1 && !unico && (ilum > LIMITE_VA_AGRUPADO || tugMax > LIMITE_VA_AGRUPADO)) {
      avisos.push(`${nomes}: juntos passam de ${LIMITE_VA_AGRUPADO} VA num circuito — cada cômodo fica com o seu.`);
      for (const r of u.rooms) final.push({ rooms: [r], dists: [0], unico: false });
      continue;
    }
    if (!unico) for (const part of particoesTomadas(u.rooms)) {
      const classes = part.map(classeCircuito);
      if (part.length > 1 && classes.includes('externo') && classes.some((x) => x !== 'externo')) {
        avisos.push(`${part.map(nomeDe).join(' + ')}: tomadas de área externa dividindo circuito com outro tipo de cômodo — o circuito precisa de DR de 30 mA. Confirme com um eletricista.`);
      }
    }
    u.dists.forEach((d, i) => { if (i > 0 && !(d > 0)) avisos.push(`Informe a distância entre ${nomeDe(u.rooms[i - 1])} e ${nomeDe(u.rooms[i])} (cabo a mais para chegar lá).`); });
    final.push({ ...u, unico });
  }

  return { unidades: final, avisos };
}

/** Circuitos de iluminação/tomadas de cada unidade (potência e comprimento; o dimensionamento é feito no calc-materiais). */
export function circuitosBrutos(unidades: Unidade[]): CircuitoBruto[] {
  const out: CircuitoBruto[] = [];
  unidades.forEach((u, k) => {
    const ilum = u.rooms.reduce((s, r) => s + potIlum(r), 0);
    const tug = u.rooms.reduce((s, r) => s + potTug(r), 0);
    const temLuz = (r: Room) => (r?.luzes?.length ?? 0) > 0;
    const temTom = (r: Room) => nTomadas(r) > 0;
    /** Cabo do circuito: trajeto do 1º cômodo que usa o circuito + metros extras só até o último que usa (cômodo sem carga nas pontas não gasta cabo). */
    const comprimento = (usa: (r: Room) => boolean) => {
      const idx = u.rooms.map((r, i) => (usa(r) ? i : -1)).filter((i) => i >= 0);
      const de = Math.min(...idx), ate = Math.max(...idx);
      return routeLen(u.rooms[de]) + u.dists.slice(de + 1, ate + 1).reduce((s, d) => s + (d > 0 ? d : 0), 0);
    };
    const temI = u.rooms.some(temLuz), temT = u.rooms.some(temTom);
    // O circuito leva o nome (e os cômodos) de quem realmente usa: cômodo sem luz não aparece no circuito de iluminação, e assim por diante.
    const com = (rs: Room[]) => ({ comodo: rs.map(nomeDe).join(' + '), unidade: k, rooms: rs });
    if (u.unico && temI && temT) {
      const b = com(u.rooms.filter((r) => temLuz(r) || temTom(r)));
      out.push({ ...b, nome: `Iluminação e tomadas — ${b.comodo}`, tipo: 'misto', potenciaW: ilum + tug, comprimentoM: comprimento((r) => temLuz(r) || temTom(r)) });
      return;
    }
    if (temI) { const b = com(u.rooms.filter(temLuz)); out.push({ ...b, nome: `Iluminação — ${b.comodo}`, tipo: 'iluminacao', potenciaW: ilum, comprimentoM: comprimento(temLuz) }); }
    particoesTomadas(u.rooms).forEach((part) => {
      const b = com(part);
      out.push({
        ...b, nome: `Tomadas (TUG) — ${b.comodo}`, tipo: 'tug',
        potenciaW: part.reduce((s, r) => s + potTug(r), 0),
        comprimentoM: comprimento((r) => part.includes(r)),
      });
    });
  });
  return out;
}

/* ---------- Lista de circuitos (modo "personalizado") ---------- */

const temLuzR = (r: Room) => (r?.luzes?.length ?? 0) > 0;
const temTomR = (r: Room) => nTomadas(r) > 0;

/** Dists de um subconjunto do trajeto: o 1º fica 0 e os seguintes somam os metros extras percorridos no caminho original. */
function subcaminho(membros: Room[], dists: number[], manter: Room[]): number[] {
  const idx = manter.map((r) => membros.indexOf(r));
  return idx.map((i, j) => (j === 0 ? 0 : dists.slice(idx[j - 1] + 1, i + 1).reduce((s, d) => s + (d > 0 ? d : 0), 0)));
}
const fmtD = (d: number) => (d > 0 ? String(d) : '');

/**
 * Lista de circuitos equivalente às unidades de um modo pronto (economico/maximo/manual): ponto de partida para editar.
 * montarCircuitos com essa lista (modo personalizado) devolve os MESMOS circuitos.
 */
export function listaDeUnidades(unidades: Unidade[]): CircuitoManual[] {
  const out: CircuitoManual[] = [];
  unidades.forEach((u, k) => {
    const ids = u.rooms.map((r) => r.id);
    const dists = u.dists.map((d, i) => (i === 0 ? '' : fmtD(d)));
    const temI = u.rooms.some(temLuzR), temT = u.rooms.some(temTomR);
    if (u.unico && temI && temT) { out.push({ id: `c${k}`, tipo: 'misto', rooms: ids, dists }); return; }
    if (temI) out.push({ id: `c${k}l`, tipo: 'luz', rooms: ids, dists });
    const partes = particoesTomadas(u.rooms);
    partes.forEach((part, j) => {
      if (partes.length === 1) out.push({ id: `c${k}t`, tipo: 'tomadas', rooms: ids, dists });
      else out.push({ id: `c${k}t${j}`, tipo: 'tomadas', rooms: part.map((r) => r.id), dists: subcaminho(u.rooms, u.dists, part).map((d, i) => (i === 0 ? '' : fmtD(d))) });
    });
  });
  return out;
}

/** Potência (VA) que cada cômodo leva em luz e em tomadas: a tela usa para avisar antes de passar do limite do circuito. */
export function cargasPorComodo(rooms: Room[]): Record<string, { luz: number; tomadas: number }> {
  return Object.fromEntries((rooms ?? []).map((r) => [r.id, { luz: potIlum(r), tomadas: potTug(r) }]));
}

function montarDaLista(rooms: Room[], cfgIn: ConfigCircuitos): ListaCircuitos {
  const cfg = podarConfig(cfgIn, rooms);
  const avisos: string[] = [];
  const porId = new Map(rooms.map((r) => [r.id, r]));
  type Tipo = CircuitoManual['tipo'];
  interface Item { id: string; tipo: Tipo; rooms: Room[]; dists: number[] }
  const itens: Item[] = [];
  const usado = { luz: new Set<string>(), tomadas: new Set<string>() };
  const nomesDe = (rs: Room[]) => rs.map(nomeDe).join(' + ');
  const pot = (k: 'luz' | 'tomadas', rs: Room[]) => rs.reduce((s, r) => s + (k === 'luz' ? potIlum(r) : potTug(r)), 0);
  const usa = (tipo: Tipo) => (r: Room) => (tipo === 'luz' ? temLuzR(r) : tipo === 'tomadas' ? temTomR(r) : temLuzR(r) || temTomR(r));

  const empilhar = (it: Item) => { itens.push(it); for (const r of it.rooms) { if (it.tipo !== 'tomadas' && temLuzR(r)) usado.luz.add(r.id); if (it.tipo !== 'luz' && temTomR(r)) usado.tomadas.add(r.id); } };

  /** Aplica as regras ao circuito e acrescenta 1 ou mais itens (separando o que a norma ou o limite de potência não permitem). */
  const emitir = (id: string, tipo: Tipo, membros: Room[], dists: number[]): void => {
    if (!membros.some(usa(tipo))) return; // circuito sem nenhuma carga (a pessoa tirou os pontos do cômodo): some
    if (tipo === 'misto') {
      if (!membros.every((r) => aceitaMisto(classeCircuito(r)))) {
        avisos.push(`${nomesDe(membros)}: cozinha, área de serviço e áreas externas não levam iluminação e tomadas no mesmo disjuntor — ficam separadas.`);
        emitir(`${id}l`, 'luz', membros, dists); emitir(`${id}t`, 'tomadas', membros, dists); return;
      }
      if (pot('luz', membros) + pot('tomadas', membros) > LIMITE_VA_AGRUPADO) {
        avisos.push(`${nomesDe(membros)}: iluminação e tomadas somam mais de ${LIMITE_VA_AGRUPADO} VA — ficam em disjuntores separados.`);
        emitir(`${id}l`, 'luz', membros, dists); emitir(`${id}t`, 'tomadas', membros, dists); return;
      }
      empilhar({ id, tipo, rooms: membros, dists }); return;
    }
    if (tipo === 'tomadas') {
      const parts = particoesTomadas(membros);
      if (parts.length > 1) {
        avisos.push(`${nomesDe(membros)}: as tomadas de cozinha/área de serviço não dividem circuito com os outros cômodos — ficam em circuitos separados.`);
        parts.forEach((p, j) => emitir(`${id}_${j}`, 'tomadas', p, subcaminho(membros, dists, p)));
        return;
      }
    }
    if (membros.length > 1 && pot(tipo, membros) > LIMITE_VA_AGRUPADO) {
      avisos.push(`${nomesDe(membros)}: juntos passam de ${LIMITE_VA_AGRUPADO} VA num circuito — cada cômodo fica com o seu.`);
      membros.forEach((r, j) => emitir(`${id}_${j}`, tipo, [r], [0]));
      return;
    }
    empilhar({ id, tipo, rooms: membros, dists });
  };

  for (const c of cfg.lista ?? []) {
    let membros: Room[] = [], dists: number[] = [];
    c.rooms.forEach((rid, i) => {
      const r = porId.get(rid);
      if (!r || membros.includes(r)) return;
      if (membros.length > 0 && !mesmaInstalacao(r, membros[0])) {
        avisos.push(`${nomeDe(r)} não pode dividir circuito com ${nomeDe(membros[0])} (instalação diferente: embutida x aparente): fica separado.`);
        return;
      }
      membros.push(r); dists.push(membros.length === 1 ? 0 : num(c.dists?.[i]));
    });
    // Um cômodo só entra uma vez por tipo: se já está em outro circuito, sai deste.
    const kinds: ('luz' | 'tomadas')[] = c.tipo === 'misto' ? ['luz', 'tomadas'] : [c.tipo];
    const livres = membros.filter((r) => !kinds.some((k) => (k === 'luz' ? temLuzR(r) : temTomR(r)) && usado[k].has(r.id)));
    for (const r of membros) if (!livres.includes(r) && !(c.tipo === 'misto' ? !usa('misto')(r) : !usa(c.tipo)(r))) avisos.push(`${nomeDe(r)} já está em outro circuito: fica só no primeiro.`);
    if (livres.length < membros.length) { dists = subcaminho(membros, dists, livres); membros = livres; }
    if (membros.length) emitir(c.id, c.tipo, membros, dists);
  }

  // Carga que ficou fora de qualquer circuito (cômodo novo, ponto novo): ganha circuito próprio.
  for (const r of rooms) {
    const faltaL = temLuzR(r) && !usado.luz.has(r.id), faltaT = temTomR(r) && !usado.tomadas.has(r.id);
    if (faltaL && faltaT && aceitaMisto(classeCircuito(r)) && potIlum(r) + potTug(r) <= LIMITE_VA_AGRUPADO) emitir(`auto_${r.id}_m`, 'misto', [r], [0]);
    else { if (faltaL) emitir(`auto_${r.id}_l`, 'luz', [r], [0]); if (faltaT) emitir(`auto_${r.id}_t`, 'tomadas', [r], [0]); }
  }

  // Cômodos ligados por circuito formam uma "unidade" (mesmo trecho de eletroduto: fator de agrupamento).
  const pai = new Map(rooms.map((r) => [r.id, r.id]));
  const raiz = (x: string): string => { while (pai.get(x) !== x) x = pai.get(x)!; return x; };
  for (const it of itens) for (const r of it.rooms.slice(1)) pai.set(raiz(r.id), raiz(it.rooms[0].id));
  const unidades: Unidade[] = [];
  const idxRaiz = new Map<string, number>();
  const unidadeDoComodo = new Map<string, number>();
  for (const r of rooms) {
    const k = raiz(r.id);
    if (!idxRaiz.has(k)) { idxRaiz.set(k, unidades.length); unidades.push({ rooms: [], dists: [], unico: false }); }
    const u = unidades[idxRaiz.get(k)!];
    u.rooms.push(r); u.dists.push(0); unidadeDoComodo.set(r.id, idxRaiz.get(k)!);
  }
  for (const it of itens) if (it.tipo === 'misto') unidades[unidadeDoComodo.get(it.rooms[0].id)!].unico = true;

  const circuitos: CircuitoBruto[] = itens.map((it) => {
    const usam = it.rooms.filter(usa(it.tipo)); // só quem usa o circuito aparece no nome e na lista de cômodos dele
    const nomes = nomesDe(usam);
    const idx = it.rooms.map((r, i) => (usa(it.tipo)(r) ? i : -1)).filter((i) => i >= 0);
    const de = Math.min(...idx), ate = Math.max(...idx);
    const comprimentoM = routeLen(it.rooms[de]) + it.dists.slice(de + 1, ate + 1).reduce((s, d) => s + (d > 0 ? d : 0), 0);
    const base = { comodo: nomes, unidade: unidadeDoComodo.get(it.rooms[0].id)! };
    if (it.tipo === 'misto') return { ...base, rooms: usam, nome: `Iluminação e tomadas — ${nomes}`, tipo: 'misto' as const, potenciaW: pot('luz', it.rooms) + pot('tomadas', it.rooms), comprimentoM };
    if (it.tipo === 'luz') return { ...base, rooms: usam, nome: `Iluminação — ${nomes}`, tipo: 'iluminacao' as const, potenciaW: pot('luz', it.rooms), comprimentoM };
    return { ...base, rooms: usam, nome: `Tomadas (TUG) — ${nomes}`, tipo: 'tug' as const, potenciaW: pot('tomadas', it.rooms), comprimentoM };
  });

  // Avisos: área externa dividindo tomadas com outro tipo e metros extras sem informar.
  for (const it of itens) {
    if (it.tipo !== 'luz') {
      const classes = it.rooms.filter(temTomR).map(classeCircuito);
      if (it.tipo === 'tomadas' && classes.includes('externo') && classes.some((x) => x !== 'externo')) {
        avisos.push(`${nomesDe(it.rooms)}: tomadas de área externa dividindo circuito com outro tipo de cômodo — o circuito precisa de DR de 30 mA. Confirme com um eletricista.`);
      }
    }
    it.dists.forEach((d, i) => { if (i > 0 && !(d > 0)) avisos.push(`Informe a distância entre ${nomeDe(it.rooms[i - 1])} e ${nomeDe(it.rooms[i])} (cabo a mais para chegar lá).`); });
  }

  const listaNormalizada: CircuitoManual[] = itens.map((it) => ({ id: it.id, tipo: it.tipo, rooms: it.rooms.map((r) => r.id), dists: it.dists.map((d, i) => (i === 0 ? '' : fmtD(d))) }));
  return { unidades, avisos, circuitos, unidadeDoComodo, listaNormalizada };
}

/** Resultado único da divisão: as unidades (cômodos/grupos), a lista final de circuitos (1 item = 1 disjuntor) e os avisos. */
export interface ListaCircuitos extends Resolucao {
  circuitos: CircuitoBruto[];
  /** Índice da unidade de cada cômodo (todos os cômodos, mesmo os sem carga). */
  unidadeDoComodo: Map<string, number>;
  /** Só no modo personalizado: a lista depois de aplicar as regras (cômodos que não existem saem, carga sem circuito ganha um). */
  listaNormalizada?: CircuitoManual[];
}

/**
 * ÚNICA entrada para saber os circuitos de iluminação/tomadas: cálculo, prévia, PDF, avisos e a tela
 * "Circuitos do quadro" leem daqui (ninguém mais monta circuito por conta própria).
 */
export function montarCircuitos(rooms: Room[], cfg: ConfigCircuitos | undefined, modoForcado?: ModoCircuitos): ListaCircuitos {
  if (!modoForcado && cfg?.modo === 'personalizado') return montarDaLista(rooms ?? [], cfg);
  const res = resolverUnidades(rooms, cfg, modoForcado);
  const unidadeDoComodo = new Map<string, number>();
  res.unidades.forEach((u, k) => u.rooms.forEach((r) => unidadeDoComodo.set(r.id, k)));
  return { ...res, circuitos: circuitosBrutos(res.unidades), unidadeDoComodo };
}

/** Tensão das tomadas do sistema (fn) e tensão de cada aparelho: só divide circuito quem usa a mesma tensão. */
export interface CtxEquip { fn: number; tensaoEquip: (e: Equip) => number }

export interface DivisaoEquipamentos {
  /** Equipamentos que têm circuito próprio (TUE). */
  proprios: Equip[];
  /** Potência (W) que cada circuito da lista passa a levar por causa de aparelhos que dividem o circuito do cômodo (índice = posição em `circuitos`). */
  extra: Map<number, number>;
  /** Nomes dos aparelhos que dividem cada circuito. */
  nomes: Map<number, string[]>;
  /** id do equipamento → índice do circuito que ele divide. */
  compartilham: Map<string, number>;
  avisos: string[];
}

/** Por que o aparelho não pode dividir o circuito de tomadas do cômodo (motivo vazio = pode, e `alvo` é o circuito). */
function motivoNaoDivide(e: Equip, lista: ListaCircuitos, ctx: CtxEquip | undefined, extra: Map<number, number>): { motivo: string; alvo: number } {
  const nao = (motivo: string) => ({ motivo, alvo: -1 });
  const pode = podeDividirCircuito(e);
  if (!pode.ok) return nao(pode.motivo ?? '');
  if (!e.room) return nao('escolha o cômodo do aparelho.');
  if (!ctx) return nao('tensão do sistema não informada.');
  const tens = ctx.tensaoEquip(e);
  if (tens !== ctx.fn) return nao(`este aparelho é ${tens} V e as tomadas deste imóvel são ${ctx.fn} V: use circuito próprio.`);
  const potW = num(e.pot);
  const doComodo = lista.circuitos.map((c, i) => ({ c, i })).filter(({ c }) => c.tipo !== 'iluminacao' && c.rooms.some((r) => r.id === e.room));
  if (doComodo.length === 0) return nao('o cômodo não tem circuito de tomadas.');
  const alvo = doComodo.find(({ c, i }) => c.potenciaW + (extra.get(i) ?? 0) + potW <= LIMITE_VA_AGRUPADO);
  if (!alvo) return nao(`a soma passaria de ${LIMITE_VA_AGRUPADO} VA no circuito de tomadas.`);
  return { motivo: '', alvo: alvo.i };
}

/**
 * Quem tem circuito próprio e quem divide o circuito de tomadas do cômodo. Só divide se a pessoa escolheu ('comodo') E for permitido:
 * aparelho pequeno (≤ 10 A, não é de aquecimento), mesma tensão das tomadas e soma dentro do limite do circuito. Senão volta ao próprio, com aviso.
 */
export function decidirEquipamentos(equips: Equip[], lista: ListaCircuitos, ctx?: CtxEquip): DivisaoEquipamentos {
  const out: DivisaoEquipamentos = { proprios: [], extra: new Map(), nomes: new Map(), compartilham: new Map(), avisos: [] };
  for (const e of equips) {
    if (e.circuito !== 'comodo') { out.proprios.push(e); continue; }
    const nome = e.tipo || 'Equipamento';
    const { motivo, alvo } = motivoNaoDivide(e, lista, ctx, out.extra);
    if (motivo) { out.proprios.push(e); out.avisos.push(`${nome}: fica em circuito próprio — ${motivo}`); continue; }
    out.extra.set(alvo, (out.extra.get(alvo) ?? 0) + num(e.pot));
    out.nomes.set(alvo, [...(out.nomes.get(alvo) ?? []), nome]);
    out.compartilham.set(e.id, alvo);
  }
  return out;
}

/** Situação de cada aparelho para a tela: divide ou não, em qual circuito, e se pode dividir (com o motivo quando não pode). */
export interface AvaliacaoEquip { id: string; tipo: string; room: string; pot: number; divide: boolean; alvo: number | null; podeDividir: boolean; motivo: string }
export function avaliarEquipamentos(equips: Equip[], lista: ListaCircuitos, ctx: CtxEquip | undefined, div: DivisaoEquipamentos): AvaliacaoEquip[] {
  return equips.map((e) => {
    const base = { id: e.id, tipo: e.tipo, room: e.room, pot: num(e.pot) };
    const alvo = div.compartilham.get(e.id);
    if (alvo !== undefined) return { ...base, divide: true, alvo, podeDividir: true, motivo: '' };
    const m = motivoNaoDivide(e, lista, ctx, div.extra);
    return { ...base, divide: false, alvo: null, podeDividir: m.motivo === '', motivo: m.motivo };
  });
}

export interface ResumoModo { circuitos: number; disjuntores: number; metrosCabo: number; avisos: string[] }
export interface ComparacaoCircuitos {
  nTUE: number;
  modos: Record<'norma' | 'economico' | 'maximo', ResumoModo>;
  atual: ResumoModo & { modo: ModoCircuitos };
  /** Lista de circuitos do modo atual (1 item = 1 disjuntor de luz/tomadas): é o que a tela mostra e o que a pessoa edita. */
  lista: CircuitoManual[];
  /** Situação de cada equipamento (divide o circuito do cômodo? pode? por quê não?). */
  equipamentos: AvaliacaoEquip[];
  /** Potência (VA) de luz e de tomadas de cada cômodo: para a tela avisar antes de passar do limite do circuito. */
  cargas: Record<string, { luz: number; tomadas: number }>;
  limiteVA: number;
  /** Tensão das tomadas deste imóvel (V), quando o sistema é conhecido. */
  tomadasV: number | null;
}

function resumir(rooms: Room[], equips: Equip[], ctx: CtxEquip | undefined, cfg: ConfigCircuitos | undefined, modo?: ModoCircuitos): { r: ResumoModo; res: ListaCircuitos; nTUE: number } {
  const res = montarCircuitos(rooms, cfg, modo);
  const br = res.circuitos;
  const nTUE = decidirEquipamentos(equips, res, ctx).proprios.length; // quem divide o circuito do cômodo não ganha disjuntor
  const metros = br.reduce((s, c) => s + c.comprimentoM, 0);
  return { res, nTUE, r: { circuitos: br.length, disjuntores: br.length + nTUE, metrosCabo: Math.round(metros * 10) / 10, avisos: res.avisos } };
}

/** Compara os três modos prontos e o modo atual (usado pela tela "Circuitos do quadro"). */
export function compararCircuitos(rooms: Room[], equips: Equip[], cfg?: ConfigCircuitos, ctx?: CtxEquip): ComparacaoCircuitos {
  const eq = (equips ?? []).filter((e) => e?.tipo && e?.pot);
  const modos = {
    norma: resumir(rooms, eq, ctx, cfg, 'norma').r,
    economico: resumir(rooms, eq, ctx, cfg, 'economico').r,
    maximo: resumir(rooms, eq, ctx, cfg, 'maximo').r,
  };
  const modo = (cfg?.modo ?? 'norma') as ModoCircuitos;
  const atual = resumir(rooms, eq, ctx, cfg);
  const lista = atual.res.listaNormalizada ?? listaDeUnidades(atual.res.unidades);
  const equipamentos = avaliarEquipamentos(eq, atual.res, ctx, decidirEquipamentos(eq, atual.res, ctx));
  return { nTUE: atual.nTUE, modos, atual: { ...atual.r, modo }, lista, equipamentos, cargas: cargasPorComodo(rooms), limiteVA: LIMITE_VA_AGRUPADO, tomadasV: ctx?.fn ?? null };
}
