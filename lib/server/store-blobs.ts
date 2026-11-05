/* Armazenamento (Netlify Blobs). Roda apenas no servidor. */
import { getStore } from '@netlify/blobs';

const loja = () => getStore({ name: 'orca-eletrica', consistency: 'strong' });

export interface Orcamento {
  id: string;
  chaveHash: string;
  email: string;
  dados: unknown;
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

/* ---------- Acesso para editar um orçamento já pago ---------- */

export interface Acesso {
  pagamentoId: string;
  orcamentoId: string;
  codigo: string;
  entregueEm: string;
  expiraEm: string;
  removerApos: string;
}

export async function gravarAcesso(a: Acesso): Promise<void> {
  await loja().setJSON(`acesso/${a.pagamentoId}`, a);
  await loja().setJSON(`cod/${a.codigo}`, { pagamentoId: a.pagamentoId });
}

export async function acessoPorCodigo(codigo: string): Promise<Acesso | null> {
  const ref = (await loja().get(`cod/${codigo}`, { type: 'json' })) as { pagamentoId?: string } | null;
  if (!ref?.pagamentoId) return null;
  return (await loja().get(`acesso/${ref.pagamentoId}`, { type: 'json' })) as Acesso | null;
}

/** Quantas edições deste pagamento já foram usadas. */
export async function edicoesUsadas(pagamentoId: string): Promise<number> {
  const r = await loja().list({ prefix: `edicao/${pagamentoId}/` });
  return r.blobs.length;
}

/**
 * Usa uma edição de forma segura: cada número (1, 2, 3...) só pode ser tomado uma vez,
 * então dois pedidos ao mesmo tempo nunca gastam a mesma edição nem passam do limite.
 * Devolve o número da edição usada, ou null se acabaram.
 */
export async function usarEdicao(pagamentoId: string, maximo: number): Promise<number | null> {
  for (let n = 1; n <= maximo; n++) {
    const r = await loja().set(`edicao/${pagamentoId}/${n}`, new Date().toISOString(), { onlyIfNew: true });
    if (r.modified === true) return n;
  }
  return null;
}

/** Apaga dados pessoais e o acesso. Mantém o registro de entrega (impede entregar de novo). */
export async function apagarAcesso(a: Acesso): Promise<void> {
  const l = loja();
  const usadas = await l.list({ prefix: `edicao/${a.pagamentoId}/` });
  await Promise.all(usadas.blobs.map((b) => l.delete(b.key)));
  await l.delete(`cod/${a.codigo}`);
  await l.delete(`acesso/${a.pagamentoId}`);
  await l.delete(`orc/${a.orcamentoId}`);
}
