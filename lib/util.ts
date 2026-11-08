/* Helpers numéricos e de trajeto compartilhados pelo cálculo (servidor e cliente), sem dependências. */
import type { Room } from './types';

/** Converte texto/número em número; vazio ou inválido → 0. */
export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Trajeto do quadro até o cômodo: direto (dq) ou pelo caminho de outro (trecho compartilhado dd + desvio dr). */
export function routeLen(r: Room): number {
  return r?.via ? num(r?.dd) + num(r?.dr) : num(r?.dq);
}

/** Áreas que exigem DR 30 mA (NBR 5410 5.1.3.2.2): banheiro, cozinha, serviço, lavanderia e áreas externas. */
export const AREA_MOLHADA = /banheiro|lavabo|cozinha|copa|servi|lavanderia|piscina|externa|varanda|garagem/i;

export function areaMolhada(texto: string): boolean {
  return AREA_MOLHADA.test(texto);
}
