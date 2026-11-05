import { gerarHtmlPdf } from '@/lib/server/pdf-template';
import { conferir, erro, ok } from '@/lib/server/pedido';
import { entregaFeita } from '@/lib/server/store-blobs';
import { ErroApi, exigirDados, lerCorpo, rota } from '@/lib/server/rota';
import type { AppState } from '@/lib/types';

export const runtime = 'nodejs';

/** 15 dias de edição + 1 dia de folga (o navegador conta a partir da entrega, aqui conta do Pix). */
const PRAZO_SERVIDOR_MS = 16 * 24 * 60 * 60 * 1000;

/**
 * PDF atualizado de um orçamento já pago (edições gratuitas).
 * Corpo: { orcamentoId, pagamentoId, dados } + header x-chave. Resposta: { html }.
 * O limite de 3 edições é contado no navegador; aqui só se exige pagamento aprovado,
 * PDF original já entregue e o prazo de 15 dias.
 */
export const POST = rota('regerar', async (req) => {
  const corpo = await lerCorpo(req);
  const r = await conferir(
    String(corpo?.orcamentoId ?? ''),
    String(corpo?.pagamentoId ?? ''),
    req.headers.get('x-chave') ?? '',
  );
  if ('falha' in r) return r.falha;
  if (r.estado !== 'aprovado') return erro(402, 'pagamento_nao_aprovado');
  if (!(await entregaFeita(r.mp.id))) return erro(409, 'nao_entregue');
  if (Date.now() - Date.parse(r.pag.criadoEm) > PRAZO_SERVIDOR_MS) return erro(410, 'prazo_encerrado');

  const dados = exigirDados(corpo?.dados, true) as AppState;
  try {
    return ok({ html: gerarHtmlPdf(dados) });
  } catch (e) {
    throw new ErroApi(500, 'geracao_falhou', e);
  }
});
