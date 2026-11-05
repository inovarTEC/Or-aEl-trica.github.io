/*
 * Netlify Blobs — só o mínimo para o Pix (roda apenas no servidor):
 *   orc/{orcamentoId}   dono do pedido (hash da chave secreta + e-mail). NENHUM dado do orçamento.
 *   pag/{pagamentoId}   vínculo Pix → pedido.
 *   entrega/{pagId}     trava: o PDF original é entregue uma única vez por pagamento.
 * Os dados do orçamento, o PDF e a contagem de edições ficam no navegador (lib/storage-local.ts).
 */
import { getStore } from '@netlify/blobs';

const loja = () => getStore({ name: 'orca-eletrica', consistency: 'strong' });

export interface Orcamento {
  orcamentoId: string;
  email: string;
  chaveHash: string;
  criadoEm: string;
}

export interface Pagamento {
  id: string;
  orcamentoId: string;
  criadoEm: string;
}

export async function lerJSON<T>(chave: string): Promise<T | null> {
  return (await loja().get(chave, { type: 'json' })) as T | null;
}

export async function gravarJSON(chave: string, valor: unknown): Promise<void> {
  await loja().setJSON(chave, valor);
}

/** Trava de entrega: só a primeira chamada por pagamento retorna true. */
export async function travarEntrega(pagamentoId: string): Promise<boolean> {
  const r = await loja().set(`entrega/${pagamentoId}`, new Date().toISOString(), { onlyIfNew: true });
  return r.modified === true;
}

/** O PDF original deste pagamento já foi entregue? (libera a regeração nas edições gratuitas) */
export async function entregaFeita(pagamentoId: string): Promise<boolean> {
  return (await loja().get(`entrega/${pagamentoId}`)) !== null;
}
