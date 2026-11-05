import { EDICOES_MAX, carregarAcesso } from '@/lib/server/acesso';
import { formatarCodigo } from '@/lib/server/codigo';
import { erro, ok } from '@/lib/server/pedido';

export const runtime = 'nodejs';

/** Devolve os dados que o próprio cliente digitou, para ele continuar editando. Nunca devolve cálculo. */
export async function POST(req: Request) {
  let corpo: any;
  try { corpo = await req.json(); } catch { return erro(400, 'json_invalido'); }
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
}
