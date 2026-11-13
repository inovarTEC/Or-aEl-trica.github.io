import { compararCircuitos } from '@/lib/server/circuitos';
import { ok } from '@/lib/server/pedido';
import { exigirDados, lerCorpo, rota } from '@/lib/server/rota';

export const runtime = 'nodejs';

/** Compara as formas de dividir os circuitos (padrão, econômico, mais econômico) para a tela "Circuitos do quadro". */
export const POST = rota('circuitos', async (req) => {
  const corpo = await lerCorpo(req);
  const dados = exigirDados(corpo?.dados, false);
  return ok(compararCircuitos(dados.rooms, dados.equips ?? [], dados.circuitos));
});
