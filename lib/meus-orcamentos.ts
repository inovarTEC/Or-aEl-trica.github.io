/* Lista de orçamentos pagos neste aparelho («Meus orçamentos»). Fica no navegador; o orçamento em si fica no servidor. */
import { EdicaoAtiva } from './types';

const CHAVE = 'orca_meus';
const MAXIMO = 20;

export interface OrcamentoSalvo {
  codigo: string;
  email: string;
  expiraEm: string;
}

export function lerSalvos(): OrcamentoSalvo[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    if (!Array.isArray(bruto)) return [];
    return bruto.filter((x) => x && typeof x.codigo === 'string' && typeof x.email === 'string' && typeof x.expiraEm === 'string');
  } catch {
    return [];
  }
}

function gravar(lista: OrcamentoSalvo[]): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, MAXIMO))); } catch { /* sem armazenamento: segue sem lista */ }
}

export function guardarSalvo(s: OrcamentoSalvo): void {
  gravar([s, ...lerSalvos().filter((x) => x.codigo !== s.codigo)]);
}

export function removerSalvo(codigo: string): void {
  gravar(lerSalvos().filter((x) => x.codigo !== codigo));
}

export const formatarData = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

/** Há edição gratuita disponível agora? (restam edições e o prazo não acabou) */
export function edicaoVigente(e: EdicaoAtiva | null | undefined): e is EdicaoAtiva {
  return !!e && e.restantes > 0 && Date.parse(e.expiraEm) > Date.now();
}
