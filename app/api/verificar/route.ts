import { conferir, ok } from '@/lib/server/pedido';
import { rota } from '@/lib/server/rota';

export const runtime = 'nodejs';

/** Consulta o status real do Pix no Mercado Pago. Não libera nada, só informa. */
export const GET = rota('verificar', async (req) => {
  const u = new URL(req.url);
  const r = await conferir(
    u.searchParams.get('orcamentoId') ?? '',
    u.searchParams.get('pagamentoId') ?? '',
    req.headers.get('x-chave') ?? '',
  );
  if ('falha' in r) return r.falha;
  return ok({ status: r.estado });
});
