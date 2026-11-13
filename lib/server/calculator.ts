import { AppState, Room, Pendencia, Totais } from '../types';
import { tomadasNbr } from '../validacao';
import { tomadasFisicas, pontosTomada } from '../nbr5410-regras';
import { correnteEquip } from '../ponto-equip';
import { avisosEntrada } from '../entrada-calc';
import { avisosAterramento } from '../aterramento-calc';
import { STEP_ATERRAMENTO, STEP_ENTRADA, STEP_EQUIPAMENTOS } from '../navegacao';
import { resolverUnidades } from './circuitos';

/* ---------- helpers ---------- */
import { num, routeLen } from '../util';
export { routeLen };

/**
 * Pontos de tomada por prefixo ('T' = tomadas, 'USB'), inclusive os montados na caixa do interruptor.
 * NBR 5410 conta pontos: simples, dupla ou tripla = 1 ponto (os módulos físicos ficam na lista de materiais).
 */
export function countMods(r: Room, prefix: string): number {
  let c = 0;
  for (const p of r?.pontos ?? []) {
    for (const m of p?.mods ?? []) {
      if ((m?.t ?? '').startsWith(prefix)) c += pontosTomada(m?.t);
    }
  }
  // tomadas na caixa do interruptor (não geram caixa extra)
  for (const cmd of r?.comandos ?? []) {
    for (const sw of cmd?.sws ?? []) {
      if (sw?.tom && (sw?.tom ?? '').startsWith(prefix)) c += pontosTomada(sw.tom);
    }
  }
  return c;
}

function entre(r: Room): number {
  const dpad = num(r?.dpad) || 1.5;
  let total = 0;
  for (let i = 0; i < (r?.pontos?.length ?? 0); i++) {
    const p = r?.pontos?.[i];
    const d = num(p?.d);
    total += d > 0 ? d : dpad;
  }
  for (let i = 0; i < (r?.luzes?.length ?? 0); i++) {
    const l = r?.luzes?.[i];
    total += num(l?.d) || dpad;
  }
  for (const cmd of r?.comandos ?? []) {
    for (let i = 1; i < (cmd?.sws?.length ?? 0); i++) {
      total += num(cmd?.sws?.[i]?.d) || dpad;
    }
  }
  return total;
}

/* ---------- totais ---------- */
export function calcTotais(state: AppState): Totais {
  const porComodo: Totais['porComodo'] = [];
  let totalCaixas = 0, totalTomadas = 0, totalInterruptores = 0, totalUsb = 0, totalLuzes = 0, distEletroduto = 0;

  // Trajetos até o quadro sem repetir trecho compartilhado: o dd de um cômodo "pelo caminho de outro" já está
  // dentro da rota do cômodo de referência; soma-se só o desvio dr (+ o que exceder essa rota, que vira pendência).
  const rooms = state?.rooms ?? [];
  let distTrunk = 0;
  for (const r of rooms) {
    if (r?.via) {
      const pai = rooms.find((x) => x?.id === r.via);
      const excesso = pai ? Math.max(0, num(r.dd) - routeLen(pai)) : num(r.dd);
      distTrunk += num(r.dr) + excesso;
    } else {
      distTrunk += num(r?.dq);
    }
  }

  // Ponto dos equipamentos: 1 caixa por equipamento com caixa definida; tomada 20A conta as tomadas físicas.
  // Equipamento sem cômodo entra só no total geral.
  const equipPorRoom = new Map<string, { caixas: number; tomadas: number }>();
  let eqCaixasSemRoom = 0, eqTomadasSemRoom = 0;
  for (const e of state?.equips ?? []) {
    const cx = e?.cx ? 1 : 0;
    const tom = e?.ponto === 'T20' || e?.ponto === 'T20D' ? tomadasFisicas(e.ponto) : 0;
    if (!cx && !tom) continue;
    if (e?.room && rooms.some((r) => r?.id === e.room)) {
      const acc = equipPorRoom.get(e.room) ?? { caixas: 0, tomadas: 0 };
      acc.caixas += cx; acc.tomadas += tom;
      equipPorRoom.set(e.room, acc);
    } else {
      eqCaixasSemRoom += cx; eqTomadasSemRoom += tom;
    }
  }
  totalCaixas += eqCaixasSemRoom;
  totalTomadas += eqTomadasSemRoom;

  for (const r of rooms) {
    const eq = equipPorRoom.get(r?.id ?? '') ?? { caixas: 0, tomadas: 0 };
    const nPontos = r?.pontos?.length ?? 0;
    const nLuzes = r?.luzes?.length ?? 0;
    const nSws = (r?.comandos ?? []).reduce((a: number, c: any) => a + (c?.sws?.length ?? 0), 0);
    const nCaixas = r?.caixas?.length ?? 0;
    const caixas = nPontos + nSws + nLuzes + nCaixas + eq.caixas;
    const tomadas = countMods(r, 'T') + eq.tomadas;
    const usbCount = countMods(r, 'USB');
    const interruptores = nSws;
    const dInterna = entre(r);

    porComodo.push({
      roomId: r?.id ?? '',
      nome: r?.nome ?? r?.base ?? '',
      caixas,
      tomadas,
      interruptores,
      luzes: nLuzes,
      distInterna: Math.round(dInterna * 10) / 10,
      distTrajeto: Math.round(routeLen(r) * 10) / 10,
    });

    totalCaixas += caixas;
    totalTomadas += tomadas;
    totalInterruptores += interruptores;
    totalUsb += usbCount;
    totalLuzes += nLuzes;
    distEletroduto += dInterna;
  }
  // Eletroduto da prévia = trechos internos + trajetos até o quadro (sem duplicar trecho compartilhado).
  // Equipamentos não entram: o circuito deles é dimensionado só no PDF pago.
  distEletroduto += distTrunk;

  return {
    totalCaixas,
    totalTomadas,
    totalInterruptores,
    totalUsb,
    totalLuzes,
    distEletroduto: Math.round(distEletroduto * 10) / 10,
    distTrunk: Math.round(distTrunk * 10) / 10,
    porComodo,
  };
}

/* ---------- pendências ---------- */
export function calcPendencias(state: AppState): Pendencia[] {
  const p: Pendencia[] = [];

  if (!state?.imovel) p.push({ tipo: 'erro', msg: 'Tipo de imóvel não informado', step: 0 });
  if (!state?.obra) p.push({ tipo: 'erro', msg: 'Tipo de obra não informado', step: 0 });
  if (!state?.cobertura) p.push({ tipo: 'aviso', msg: 'Tipo de cobertura não informado', step: 0 });
  if (!state?.rede) p.push({ tipo: 'aviso', msg: 'Tipo de ligação elétrica não informado', step: 0 });

  if ((state?.rooms?.length ?? 0) === 0) {
    p.push({ tipo: 'erro', msg: 'Nenhum cômodo adicionado', step: 1 });
  }

  for (const r of state?.rooms ?? []) {
    const rn = r?.nome || r?.base || 'Cômodo';
    if (!r?.nome) p.push({ tipo: 'aviso', msg: `${rn}: sem nome definido`, step: 1, roomId: r?.id });
    if (!r?.c || !r?.l) p.push({ tipo: 'aviso', msg: `${rn}: medidas não informadas`, step: 1, roomId: r?.id });
    if (!r?.dq && !r?.via) p.push({ tipo: 'aviso', msg: `${rn}: distância ao quadro não informada`, step: 1, roomId: r?.id });
    if (r?.via) {
      if (!r?.dd) p.push({ tipo: 'aviso', msg: `${rn}: distância do trecho compartilhado não informada`, step: 1, roomId: r?.id });
      if (!r?.dr) p.push({ tipo: 'aviso', msg: `${rn}: distância do desvio ao cômodo não informada`, step: 1, roomId: r?.id });
      const pai = (state?.rooms ?? []).find((x: any) => x?.id === r.via);
      if (pai && num(r.dd) > routeLen(pai)) {
        p.push({ tipo: 'erro', msg: `${rn}: trecho compartilhado maior que a rota de "${pai?.nome || pai?.base}"`, step: 1, roomId: r?.id });
      }
    }
    if ((r?.pontos?.length ?? 0) === 0 && (r?.luzes?.length ?? 0) === 0) {
      p.push({ tipo: 'aviso', msg: `${rn}: nenhum ponto elétrico adicionado`, step: 2, roomId: r?.id });
    }
    // NBR 5410 (9.5.2.2.1): quantidade mínima de pontos de tomada pelo perímetro/tipo do cômodo
    const nbr = tomadasNbr(r);
    if (nbr && nbr.atual < nbr.minimo) {
      p.push({
        tipo: 'aviso',
        msg: `${rn}: ${nbr.atual} ${nbr.atual === 1 ? 'tomada' : 'tomadas'} — a NBR 5410 pede no mínimo ${nbr.minimo} para este cômodo`,
        step: 2,
        roomId: r?.id,
      });
    }
    if (!r?.inst) p.push({ tipo: 'aviso', msg: `${rn}: tipo de instalação não definido`, step: 2, roomId: r?.id });

    // Luzes sem interruptor
    const luzIds = new Set((r?.luzes ?? []).map((l: any) => l?.id));
    const luzComCmd = new Set<string>();
    for (const cmd of r?.comandos ?? []) {
      for (const lid of cmd?.luzes ?? []) luzComCmd.add(lid);
      if ((cmd?.luzes?.length ?? 0) === 0) {
        p.push({ tipo: 'aviso', msg: `${rn}: interruptor sem luz associada`, step: 2, roomId: r?.id });
      }
    }
    for (const lid of luzIds) {
      if (!luzComCmd.has(lid)) {
        p.push({ tipo: 'aviso', msg: `${rn}: ponto de luz sem interruptor`, step: 2, roomId: r?.id });
      }
    }
  }

  for (const e of state?.equips ?? []) {
    const en = e?.tipo || 'Equipamento';
    if (!e?.tipo) p.push({ tipo: 'erro', msg: `Equipamento sem tipo definido`, step: 3, equipId: e?.id });
    if (!e?.room) p.push({ tipo: 'aviso', msg: `${en}: cômodo não definido`, step: 3, equipId: e?.id });
    if (!e?.pot) p.push({ tipo: 'aviso', msg: `${en}: potência não informada`, step: 3, equipId: e?.id });
    if (!e?.tens) p.push({ tipo: 'aviso', msg: `${en}: tensão não informada`, step: 3, equipId: e?.id });
    const I = correnteEquip(e?.pot, e?.tens, e?.tipo);
    if (I !== null && I > 16 && e?.ponto !== 'emenda' && e?.ponto !== 'borne') {
      p.push({ tipo: 'aviso', msg: `${en}: corrente estimada ${I.toFixed(1).replace('.', ',')} A — considere ligação direta`, step: 3, equipId: e?.id });
    }
  }

  // Divisão dos circuitos (passo 3): distância entre cômodos que dividem circuito, limites de potência etc.
  if (state?.circuitos && state.circuitos.modo !== 'norma') {
    for (const msg of resolverUnidades(state.rooms ?? [], state.circuitos).avisos) p.push({ tipo: 'aviso', msg: `Circuitos: ${msg}`, step: STEP_EQUIPAMENTOS });
  }

  // Entrada / alimentador (passo 4). Orçamentos sem `entrada` (antigos ou do fluxo do PDF) não geram pendência.
  const ent = state?.entrada;
  if (ent) {
    if (!ent.percurso) p.push({ tipo: 'aviso', msg: 'Entrada: percurso não informado', step: STEP_ENTRADA });
    for (const a of avisosEntrada(ent)) {
      if (!ent.percurso && a.msg.startsWith('Informe o percurso')) continue; // já coberto acima
      p.push({ tipo: 'aviso', msg: `Entrada: ${a.msg}`, step: STEP_ENTRADA });
    }
  }

  // Aterramento principal (passo 5). Sem `aterramento` (orçamentos antigos / fluxo do PDF) não gera pendência.
  if (state?.aterramento) {
    for (const a of avisosAterramento(state.aterramento)) p.push({ tipo: a.tipo, msg: `Aterramento: ${a.msg}`, step: STEP_ATERRAMENTO });
  }

  return p;
}
