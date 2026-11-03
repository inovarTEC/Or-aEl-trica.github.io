import { conferir, ok } from '@/lib/server/pedido';

export const runtime = 'nodejs';

/** Consulta o status real do Pix no Mercado Pago. Não libera nada, só informa. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const r = await conferir(
    u.searchParams.get('orcamentoId') ?? '',
    u.searchParams.get('pagamentoId') ?? '',
    req.headers.get('x-chave') ?? '',
  );
  if ('falha' in r) return r.falha;
  return ok({ status: r.estado });
}
