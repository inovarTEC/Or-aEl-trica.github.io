import { EDICOES_MAX, novoAcesso } from '@/lib/server/acesso';
import { formatarCodigo, gerarCodigo } from '@/lib/server/codigo';
import { gerarHtmlPdf } from '@/lib/server/pdf-template';
import { conferir, erro, ok } from '@/lib/server/pedido';
import {
  acessoPorCodigo, acessoPorPagamento, comRetentativas, gravarAcesso, travarEntrega,
} from '@/lib/server/store-blobs';
import { ErroApi, lerCorpo, rota } from '@/lib/server/rota';
import { logErro } from '@/lib/server/log';

export const runtime = 'nodejs';

/**
 * Entrega o relatório completo UMA vez por pagamento aprovado e abre a edição gratuita (prazo e limite).
 *
 * Ordem obrigatória: 1) salvar o acesso  2) travar a entrega  3) devolver o PDF.
 * Assim o código impresso no PDF SEMPRE existe no banco. Se salvar falhar, nada é travado e
 * a resposta é 500 — o navegador volta a consultar o Pix e chama esta rota de novo sozinho.
 */
export const POST = rota('liberar', async (req) => {
  const corpo = await lerCorpo(req, 10_000);
  const r = await conferir(
    String(corpo?.orcamentoId ?? ''),
    String(corpo?.pagamentoId ?? ''),
    req.headers.get('x-chave') ?? '',
  );
  if ('falha' in r) return r.falha;
  if (r.estado !== 'aprovado') return erro(402, 'pagamento_nao_aprovado');

  // Idempotente: se uma tentativa anterior já gravou o acesso, reaproveita o MESMO código
  // (nunca cria um segundo código para o mesmo pagamento).
  const existente = await comRetentativas(() => acessoPorPagamento(r.mp.id)).catch((e) => {
    throw new ErroApi(500, 'armazenamento_indisponivel', e);
  });
  const acesso = existente ?? novoAcesso(r.orc, r.mp.id, gerarCodigo());
  const codigo = acesso.codigo;

  let html: string;
  try {
    html = gerarHtmlPdf(r.orc.dados as any, { codigo: formatarCodigo(codigo), expiraEm: acesso.expiraEm, edicao: 0 });
  } catch (e) {
    throw new ErroApi(500, 'geracao_falhou', e);
  }

  // 1) Salva o acesso ANTES de travar. Falhou → 500, sem travar (o cliente tenta de novo).
  try {
    await comRetentativas(() => gravarAcesso(acesso));
  } catch (e) {
    throw new ErroApi(500, 'acesso_nao_salvo', e);
  }

  // 2) Só agora trava a entrega (só a primeira chamada deste pagamento recebe true).
  const primeira = await travarEntrega(r.mp.id);

  if (!primeira) {
    // O acesso já existia antes desta chamada → entrega anterior completa: não entrega de novo.
    if (existente) return erro(409, 'ja_entregue');

    // Pagamento travado SEM acesso salvo: entrega anterior perdeu o registro (bug antigo,
    // gravarAcesso depois de travarEntrega). O acesso acabou de ser salvo; confirma e entrega de novo.
    const salvo = await acessoPorCodigo(codigo);
    if (!salvo) throw new ErroApi(500, 'acesso_nao_salvo');
    logErro('liberar', 'entrega refeita: pagamento já travado sem acesso salvo', r.mp.id);
  }

  return ok({ html, codigo: formatarCodigo(codigo), expiraEm: acesso.expiraEm, restantes: EDICOES_MAX });
});
