/* Resumo gratuito por cômodo (passo 3) — calculado no navegador, sem bitola/disjuntor/metragem. */
import type { Room, TipoModulo } from './types';
import { tomadasFisicas, pontosTomada } from './nbr5410-regras';

/** Módulos ocupados por uma peça de tomada: simples=1, dupla=2, tripla=3, USB=1. */
export const modulosDe = (t: TipoModulo | '' | undefined | null): number => tomadasFisicas(t);

/** Caixa sugerida pela quantidade de módulos: até 3 → 4x2; acima → 4x4. */
export const caixaPorModulos = (n: number): '4x2' | '4x4' => (n <= 3 ? '4x2' : '4x4');

/** Módulos de uma caixa de interruptor: 1 do interruptor + os da tomada junto. */
export const modulosSw = (tom: TipoModulo | '' | undefined | null): number => 1 + modulosDe(tom);

export interface ResumoComodo {
  nTomadas: number; nModulos: number;
  nLuzes: number;
  nInterruptores: number; nIS: number; nIP: number; nII: number;
  nCaixas4x2: number; nCaixas4x4: number;
  pendencias: string[];
}

export function resumoComodo(room: Room): ResumoComodo {
  let nTomadas = 0, nModulos = 0, nCaixas4x2 = 0, nCaixas4x4 = 0;
  let nIS = 0, nIP = 0, nII = 0;
  const pendencias: string[] = [];

  for (const p of room?.pontos ?? []) {
    for (const m of p?.mods ?? []) {
      const n = modulosDe(m?.t);
      nModulos += n;
      if (String(m?.t ?? '').startsWith('T')) nTomadas += pontosTomada(m?.t);
    }
    if (p?.cx === '4x4') nCaixas4x4++; else nCaixas4x2++;
  }

  const luzComCmd = new Set<string>();
  (room?.comandos ?? []).forEach((c, i) => {
    if (c?.t === 'IP') nIP++; else if (c?.t === 'II') nII++; else nIS++;
    for (const lid of c?.luzes ?? []) luzComCmd.add(lid);
    if ((c?.luzes?.length ?? 0) === 0) pendencias.push(`Interruptor ${i + 1} sem luz vinculada`);
    for (const sw of c?.sws ?? []) {
      // tomada junto ao interruptor também é tomada física
      if (sw?.tom && String(sw.tom).startsWith('T')) nTomadas += pontosTomada(sw.tom);
      if (sw?.cx === '4x4') nCaixas4x4++; else nCaixas4x2++;
    }
  });

  (room?.luzes ?? []).forEach((l, i) => {
    if (!luzComCmd.has(l?.id)) pendencias.push(`Luz ${i + 1} sem interruptor`);
  });

  return {
    nTomadas, nModulos,
    nLuzes: room?.luzes?.length ?? 0,
    nInterruptores: nIS + nIP + nII, nIS, nIP, nII,
    nCaixas4x2, nCaixas4x4,
    pendencias,
  };
}
