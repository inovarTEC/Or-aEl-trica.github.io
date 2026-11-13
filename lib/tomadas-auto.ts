/* ===== Tomadas automáticas — NBR 5410, 9.5.2.2.1 =====
 * O modelo do cômodo (quarto típico, sala típica...) é só o PONTO DE PARTIDA: vale o maior entre
 * o que o modelo/usuário já tem e o mínimo da norma para as medidas informadas (perímetro e tipo).
 * Tomadas criadas aqui levam `auto: true`; só elas são removidas se o cômodo diminuir.
 * Roda no navegador (a cada mudança de medidas/nome); o servidor recebe os pontos já completos.
 */
import type { Ponto, Room } from './types';
import { uid, tomadaPadrao } from './templates';
import { caixaPorModulos, modulosDe } from './resumo-comodo';
import { tomadasNbr } from './validacao';
import { pontosTomada } from './nbr5410-regras';

/** Cozinha, serviço e banheiro usam tomadas na altura média (como nos modelos); os demais, baixa. */
const ALTURA_MEDIA = /cozinha|copa|servi|lavanderia|banheiro|lavabo/;

function pontosDoPonto(p: Ponto): number {
  let n = 0;
  for (const m of p?.mods ?? []) if (String(m?.t ?? '').startsWith('T')) n += pontosTomada(m.t);
  return n;
}

/**
 * Completa (ou enxuga) as tomadas automáticas do cômodo para bater com o mínimo da NBR 5410.
 * - Faltam tomadas → cria pontos automáticos (tomada padrão do tipo de cômodo).
 * - Sobram → remove só pontos automáticos, do último para o primeiro, sem passar do mínimo.
 * - Sem comprimento/largura válidos não mexe em nada.
 * Devolve o mesmo objeto se nada mudou.
 */
export function sincronizarTomadas(room: Room): Room {
  const nbr = tomadasNbr(room);
  if (!nbr) return room;
  const pontos: Ponto[] = [...(room?.pontos ?? [])];
  let atual = nbr.atual;

  if (atual < nbr.minimo) {
    const tipo = `${room?.base ?? ''} ${room?.nome ?? ''}`;
    const t = tomadaPadrao(tipo);
    const h = ALTURA_MEDIA.test(tipo.toLowerCase()) ? 'media' : 'baixa';
    for (; atual < nbr.minimo; atual++) {
      pontos.push({ id: uid(), h, d: '', cx: caixaPorModulos(modulosDe(t)), mods: [{ id: uid(), t }], auto: true });
    }
  } else if (atual > nbr.minimo) {
    for (let i = pontos.length - 1; i >= 0 && atual > nbr.minimo; i--) {
      const p = pontos[i];
      if (!p?.auto) continue;
      const n = pontosDoPonto(p);
      if (atual - n < nbr.minimo) continue;
      pontos.splice(i, 1);
      atual -= n;
    }
  }

  return pontos.length === (room?.pontos?.length ?? 0) ? room : { ...room, pontos };
}

/** Quantas tomadas automáticas o cômodo tem (para avisar na tela). */
export function qtdTomadasAuto(room: Room): number {
  return (room?.pontos ?? []).filter((p) => p?.auto).length;
}
