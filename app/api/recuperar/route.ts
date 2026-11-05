import { EDICOES_MAX, carregarAcesso } from '@/lib/server/acesso';
import { formatarCodigo } from '@/lib/server/codigo';
import { ok } from '@/lib/server/pedido';
import { lerCorpo, rota } from '@/lib/server/rota';

export const runtime = 'nodejs';

/** Devolve os dados que o próprio cliente digitou, para ele continuar editando. Nunca devolve cálculo. */
export const POST = rota('recuperar', async (req) => {
  const corpo = await lerCorpo(req, 10_000);
  const r = await carregarAcesso(req, String(corpo?.codigo ?? ''), String(corpo?.email ?? ''));
  if ('falha' in r) return r.falha;
  return ok({
    estado: r.estado,
    dados: r.orc.dados,
    codigo: formatarCodigo(r.acesso.codigo),
    expiraEm: r.acesso.expiraEm,
    restantes: r.restantes,
    maximo: EDICOES_MAX,
  });
});
