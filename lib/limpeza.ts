/* ===== Limpeza de itens órfãos =====
 * Rede de segurança: descarta o que ficou sem função, para nunca virar material na prévia nem no PDF.
 *  - ponto de tomada sem nenhum módulo (a caixa dele contaria no orçamento)
 *  - interruptor sem luz e sem tomada na placa (caixa e placa contariam)
 *  - referência a luz que não existe mais
 *  - rota "via" apontando para cômodo removido
 *  - equipamento ligado a um cômodo que não existe mais (room vazio é permitido: "só no total geral")
 * Função pura: não altera o objeto recebido. Usada no servidor (exigirDados) e ao carregar do navegador.
 */
import type { Comando, Equip, Room } from './types';

/** O interruptor tem tomada na placa? (então tem função mesmo sem luz) */
export const comandoTemTomada = (c: Comando): boolean =>
  !!c?.comTomada || (c?.sws ?? []).some((sw) => !!sw?.tom);

function limparRoom(r: Room, ids: Set<string>): Room {
  const luzIds = new Set((r?.luzes ?? []).map((l) => l?.id));
  const pontos = (r?.pontos ?? []).filter((p) => (p?.mods ?? []).length > 0);
  const comandos = (r?.comandos ?? [])
    .map((c) => ({ ...c, luzes: (c?.luzes ?? []).filter((id) => luzIds.has(id)) }))
    .filter((c) => c.luzes.length > 0 || comandoTemTomada(c));
  return {
    ...r,
    pontos,
    comandos,
    via: r?.via && !ids.has(r.via) ? '' : (r?.via ?? ''),
  };
}

export function limparOrfaos<T extends { rooms: Room[]; equips?: Equip[] }>(d: T): T {
  const rooms = d?.rooms ?? [];
  const ids = new Set(rooms.map((r) => r?.id));
  const out: T = { ...d, rooms: rooms.map((r) => limparRoom(r, ids)) };
  if (d?.equips) out.equips = d.equips.filter((e) => !e?.room || ids.has(e.room));
  return out;
}
