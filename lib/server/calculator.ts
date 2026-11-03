import { AppState, Room, Pendencia, Totais } from '../types';

/* ---------- helpers ---------- */
function num(v: string | undefined | null): number {
  const n = parseFloat(v ?? '');
  return isNaN(n) ? 0 : n;
}

function routeLen(r: Room): number {
  return r?.via ? num(r?.dd) : num(r?.dq);
}

function countMods(r: Room, prefix: string): number {
  let c = 0;
  for (const p of r?.pontos ?? []) {
    for (const m of p?.mods ?? []) {
      if ((m?.t ?? '').startsWith(prefix)) c++;
    }
  }
  // tomadas em interruptores
  for (const cmd of r?.comandos ?? []) {
    for (const sw of cmd?.sws ?? []) {
      if (sw?.tom && (sw?.tom ?? '').startsWith(prefix)) c++;
    }
  }
  return c;
}

function countSwType(r: Room, t: string): number {
  let c = 0;
  for (const cmd of r?.comandos ?? []) {
    if (cmd?.t === t) {
      c += (cmd?.sws?.length ?? 0);
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

  // trunk: soma de routeLen sem repetir trecho compartilhado
  const usedVia = new Set<string>();
  let distTrunk = 0;
  for (const r of state?.rooms ?? []) {
    const rl = routeLen(r);
    if (r?.via) {
      // trecho dd contado só uma vez
      if (!usedVia.has(r.via)) {
        distTrunk += num(r.dd);
        usedVia.add(r.via);
      }
      distTrunk += num(r.dr);
    } else {
      distTrunk += rl;
    }
  }

  for (const r of state?.rooms ?? []) {
    const nPontos = r?.pontos?.length ?? 0;
    const nLuzes = r?.luzes?.length ?? 0;
    const nSws = (r?.comandos ?? []).reduce((a: number, c: any) => a + (c?.sws?.length ?? 0), 0);
    const nCaixas = r?.caixas?.length ?? 0;
    const caixas = nPontos + nSws + nLuzes + nCaixas;
    const tomadas = countMods(r, 'T');
    const usb = countMods(r, 'USB') - countMods(r, 'U'); // USB only from mods starting with USB
    const usbCount = (r?.pontos ?? []).reduce((a: number, p: any) => a + ((p?.mods ?? []).filter((m: any) => m?.t === 'USB')?.length ?? 0), 0);
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
    });

    totalCaixas += caixas;
    totalTomadas += tomadas;
    totalInterruptores += interruptores;
    totalUsb += usbCount;
    totalLuzes += nLuzes;
    distEletroduto += dInterna + routeLen(r);
  }

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
  }

  return p;
}
