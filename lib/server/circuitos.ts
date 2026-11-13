/* ===== Divisão de circuitos (NBR 5410) — servidor =====
 * Cada "unidade" é um cômodo sozinho ou um grupo de cômodos vizinhos. Cada unidade gera:
 *   - circuito de iluminação + circuito de tomadas (separados, padrão da norma), ou
 *   - um circuito só (iluminação + tomadas), quando `unico` e o cômodo for comum.
 * No grupo, o cabo é medido UMA vez: trajeto até o quadro do 1º cômodo + metros extras até cada vizinho
 * (nunca o trajeto inteiro de cada cômodo) — assim cabo e eletroduto não se duplicam.
 */
import type { ConfigCircuitos, Equip, GrupoCircuito, ModoCircuitos, Room } from '../types';
import { num, routeLen } from '../util';
import { potenciaIluminacao, potenciaTUG } from '../motor/eletrica';
import { pontosTomada } from '../nbr5410-regras';
import { classeCircuito, configPadrao, podarConfig } from '../circuitos-config';

/** Teto de potência de um circuito que junta cômodos ou iluminação+tomadas (≈ 20 A em 127 V). Acima disso, volta a separar. */
export const LIMITE_VA_AGRUPADO = 2500;

export interface Unidade { rooms: Room[]; dists: number[]; unico: boolean; grupoId?: string }
export interface Resolucao { unidades: Unidade[]; avisos: string[]; resolvido: ConfigCircuitos }
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
    const c = classeCircuito(r);
    if (c === 'isolado' || c !== classeCircuito(p) || !mesmaInstalacao(r, p)) continue;
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

export function resolverUnidades(rooms: Room[], cfgIn: ConfigCircuitos | undefined, modoForcado?: ModoCircuitos): Resolucao {
  rooms = rooms ?? [];
  const cfg = podarConfig(cfgIn, rooms);
  const modo: ModoCircuitos = modoForcado ?? cfg.modo ?? 'norma';
  const avisos: string[] = [];
  const porId = new Map(rooms.map((r) => [r.id, r]));
  const unicoSolto = (r: Room) => classeCircuito(r) === 'comum'
    && (modo === 'economico' || modo === 'maximo' || (modo === 'manual' && cfg.unico.includes(r.id)));

  // 1) Grupos válidos: mesma classe (comum com comum, serviço com serviço), nunca isolado, mesma instalação, cada cômodo em 1 grupo.
  const brutos: GrupoCircuito[] = modo === 'maximo' ? gruposPorVia(rooms) : modo === 'manual' ? cfg.grupos : [];
  const usados = new Set<string>();
  const grupos: { id: string; rooms: Room[]; dists: number[]; unico: boolean }[] = [];
  for (const g of brutos) {
    const membros: Room[] = [], dists: number[] = [];
    g.rooms.forEach((id, i) => {
      const r = porId.get(id);
      if (!r || usados.has(id) || membros.includes(r)) return; // cômodo inexistente, já em outro grupo ou repetido neste
      const primeiro = membros[0];
      const ok = classeCircuito(r) !== 'isolado' && (!primeiro || (classeCircuito(r) === classeCircuito(primeiro) && mesmaInstalacao(r, primeiro)));
      if (!ok) { if (modo === 'manual') avisos.push(`${nomeDe(r)} não pode dividir circuito com ${nomeDe(primeiro ?? r)} (tipo de cômodo ou instalação diferente): fica separado.`); return; }
      membros.push(r); dists.push(membros.length === 1 ? 0 : num(g.dists?.[i]));
    });
    if (membros.length < 2) continue;
    membros.forEach((m) => usados.add(m.id));
    grupos.push({ id: g.id, rooms: membros, dists, unico: classeCircuito(membros[0]) === 'comum' && (modo === 'maximo' || !!g.unico) });
  }

  // 2) Unidades na ordem dos cômodos (o grupo entra onde está o primeiro membro).
  const unidades: Unidade[] = [];
  const emitidos = new Set<string>();
  for (const r of rooms) {
    const g = grupos.find((x) => x.rooms.includes(r));
    if (g) {
      if (emitidos.has(g.id)) continue;
      emitidos.add(g.id);
      unidades.push({ rooms: g.rooms, dists: g.dists, unico: g.unico, grupoId: g.id });
    } else {
      unidades.push({ rooms: [r], dists: [0], unico: unicoSolto(r) });
    }
  }

  // 3) Teto de potência: se o circuito juntado passa do limite, volta a separar (primeiro iluminação/tomadas, depois os cômodos).
  const final: Unidade[] = [];
  for (const u of unidades) {
    const ilum = u.rooms.reduce((s, r) => s + potIlum(r), 0);
    const tug = u.rooms.reduce((s, r) => s + potTug(r), 0);
    const nomes = u.rooms.map(nomeDe).join(' + ');
    let unico = u.unico;
    if (unico && ilum + tug > LIMITE_VA_AGRUPADO) {
      unico = false;
      if (ilum > 0 && tug > 0) avisos.push(`${nomes}: iluminação e tomadas somam mais de ${LIMITE_VA_AGRUPADO} VA — ficam em disjuntores separados.`);
    }
    if (u.rooms.length > 1 && !unico && (ilum > LIMITE_VA_AGRUPADO || tug > LIMITE_VA_AGRUPADO)) {
      avisos.push(`${nomes}: juntos passam de ${LIMITE_VA_AGRUPADO} VA num circuito — cada cômodo fica com o seu.`);
      for (const r of u.rooms) final.push({ rooms: [r], dists: [0], unico: false });
      continue;
    }
    u.dists.forEach((d, i) => { if (i > 0 && !(d > 0)) avisos.push(`Informe a distância entre ${nomeDe(u.rooms[i - 1])} e ${nomeDe(u.rooms[i])} (cabo a mais para chegar lá).`); });
    final.push({ ...u, unico });
  }

  const resolvido: ConfigCircuitos = {
    modo: 'manual',
    unico: final.filter((u) => u.rooms.length === 1 && u.unico).map((u) => u.rooms[0].id),
    grupos: final.filter((u) => u.rooms.length > 1).map((u) => ({
      id: u.grupoId ?? `g_${u.rooms[0].id}`, rooms: u.rooms.map((r) => r.id),
      dists: u.dists.map((d, i) => (i === 0 || !(d > 0) ? '' : String(d))), ...(u.unico ? { unico: true } : {}),
    })),
  };
  return { unidades: final, avisos, resolvido };
}

/** Circuitos de iluminação/tomadas de cada unidade (potência e comprimento; o dimensionamento é feito no calc-materiais). */
export function circuitosBrutos(unidades: Unidade[]): CircuitoBruto[] {
  const out: CircuitoBruto[] = [];
  unidades.forEach((u, k) => {
    const nomes = u.rooms.map(nomeDe).join(' + ');
    const ilum = u.rooms.reduce((s, r) => s + potIlum(r), 0);
    const tug = u.rooms.reduce((s, r) => s + potTug(r), 0);
    const temLuz = (r: Room) => (r?.luzes?.length ?? 0) > 0;
    const temTom = (r: Room) => nTomadas(r) > 0;
    /** Cabo do circuito: trajeto do 1º cômodo + metros extras só até o último cômodo que usa este circuito (cômodo vazio no fim não gasta cabo). */
    const comprimento = (usa: (r: Room) => boolean) => {
      let ultimo = 0;
      u.rooms.forEach((r, i) => { if (usa(r)) ultimo = i; });
      return routeLen(u.rooms[0]) + u.dists.slice(1, ultimo + 1).reduce((s, d) => s + (d > 0 ? d : 0), 0);
    };
    const temI = u.rooms.some(temLuz), temT = u.rooms.some(temTom);
    const base = { comodo: nomes, unidade: k, rooms: u.rooms };
    if (u.unico && temI && temT) {
      out.push({ ...base, nome: `Iluminação e tomadas — ${nomes}`, tipo: 'misto', potenciaW: ilum + tug, comprimentoM: comprimento((r) => temLuz(r) || temTom(r)) });
      return;
    }
    if (temI) out.push({ ...base, nome: `Iluminação — ${nomes}`, tipo: 'iluminacao', potenciaW: ilum, comprimentoM: comprimento(temLuz) });
    if (temT) out.push({ ...base, nome: `Tomadas (TUG) — ${nomes}`, tipo: 'tug', potenciaW: tug, comprimentoM: comprimento(temTom) });
  });
  return out;
}

export interface ResumoModo { circuitos: number; disjuntores: number; metrosCabo: number; avisos: string[] }
export interface ComparacaoCircuitos {
  nTUE: number;
  modos: Record<'norma' | 'economico' | 'maximo', ResumoModo>;
  atual: ResumoModo & { modo: ModoCircuitos };
  /** Configuração equivalente ao modo atual, para o usuário começar o ajuste manual a partir dela. */
  resolvido: ConfigCircuitos;
}

function resumir(rooms: Room[], nTUE: number, cfg: ConfigCircuitos | undefined, modo?: ModoCircuitos): { r: ResumoModo; res: Resolucao } {
  const res = resolverUnidades(rooms, cfg, modo);
  const br = circuitosBrutos(res.unidades);
  const metros = br.reduce((s, c) => s + c.comprimentoM, 0);
  return { res, r: { circuitos: br.length, disjuntores: br.length + nTUE, metrosCabo: Math.round(metros * 10) / 10, avisos: res.avisos } };
}

/** Compara os três modos prontos e o modo atual (usado pela tela "Circuitos do quadro"). */
export function compararCircuitos(rooms: Room[], equips: Equip[], cfg?: ConfigCircuitos): ComparacaoCircuitos {
  const nTUE = (equips ?? []).filter((e) => e?.tipo && e?.pot).length;
  const modos = {
    norma: resumir(rooms, nTUE, cfg, 'norma').r,
    economico: resumir(rooms, nTUE, cfg, 'economico').r,
    maximo: resumir(rooms, nTUE, cfg, 'maximo').r,
  };
  const modo = (cfg?.modo ?? configPadrao().modo) as ModoCircuitos;
  const atual = resumir(rooms, nTUE, cfg);
  return { nTUE, modos, atual: { ...atual.r, modo }, resolvido: atual.res.resolvido };
}
