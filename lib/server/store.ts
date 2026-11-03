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
