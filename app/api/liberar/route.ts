import { gerarHtmlPdf } from '@/lib/server/pdf-template';
import { conferir, erro, ok } from '@/lib/server/pedido';
import { travarEntrega } from '@/lib/server/store';

export const runtime = 'nodejs';

/** Entrega o relatório completo UMA vez por pagamento aprovado. */
export async function POST(req: Request) {
  let corpo: any;
  try { corpo = await req.json(); } catch { return erro(400, 'json_invalido'); }
  const r = await conferir(
    String(corpo?.orcamentoId ?? ''),
    String(corpo?.pagamentoId ?? ''),
    req.headers.get('x-chave') ?? '',
  );
  if ('falha' in r) return r.falha;
  if (r.estado !== 'aprovado') return erro(402, 'pagamento_nao_aprovado');

  let html: string;
  try {
    html = gerarHtmlPdf(r.orc.dados as any, r.orc.email);
  } catch (e) {
    console.error('[liberar] falha ao gerar', e);
    return erro(500, 'geracao_falhou');
  }

  // Só a primeira chamada deste pagamento passa daqui.
  const primeira = await travarEntrega(r.mp.id);
  if (!primeira) return erro(409, 'ja_entregue');

  return ok({ html });
}
