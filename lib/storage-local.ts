'use client';
/* Persistência 100% no navegador: dados do wizard, Pix em andamento e o PDF entregue. */
import type { AppState } from './types';

const CHAVE = 'orca_v2';
/** Chaves de versões anteriores: apagadas na primeira leitura. */
const CHAVES_ANTIGAS = ['orca_v1', 'orca_eletrica_state', 'orca_meus'];
const CHAVE_ANTIGA_SESSAO = 'orca_pedido';

export const PRAZO_MS = 15 * 24 * 60 * 60 * 1000;
export const EDICOES_MAX = 3;

export interface PagamentoLocal {
  orcamentoId: string;
  chave: string;
  pagamentoId: string;
  qrCode: string;
  qrBase64: string;
  expira: string;
  email: string;
}

export interface EntregaLocal {
  html: string;
  /** 0 = PDF original; 1, 2, 3 = edições gratuitas usadas. */
  edicoes: number;
  entregueEm: number;
  /** Dados (JSON) usados no último PDF: reabrir sem mudanças não gasta edição. */
  assinatura?: string;
}

export interface EstadoLocal {
  versao: 2;
  criadoEm: number;
  expiraEm: number;
  dados: AppState;
  pagamento?: PagamentoLocal;
  entrega?: EntregaLocal;
}

const noNavegador = () => typeof window !== 'undefined';

export function novoEstado(dados: AppState, agora = Date.now()): EstadoLocal {
  return { versao: 2, criadoEm: agora, expiraEm: agora + PRAZO_MS, dados };
}

export function estadoExpirado(e: EstadoLocal, agora = Date.now()): boolean {
  return agora > e.expiraEm;
}

export function edicoesRestantes(e: EstadoLocal): number {
  return e.entrega ? Math.max(0, EDICOES_MAX - e.entrega.edicoes) : 0;
}

/** Já pago, ainda com edições gratuitas e dentro dos 15 dias. */
export function podeEditar(e: EstadoLocal | null): boolean {
  return !!e?.entrega && edicoesRestantes(e) > 0 && !estadoExpirado(e);
}

function valido(e: any): e is EstadoLocal {
  return !!e && e.versao === 2 && Number.isFinite(e.criadoEm) && Number.isFinite(e.expiraEm)
    && !!e.dados && typeof e.dados === 'object' && Array.isArray(e.dados.rooms) && Array.isArray(e.dados.equips);
}

/** Apaga as chaves das versões anteriores; devolve os dados do wizard antigo, se houver. */
function migrar(): AppState | null {
  let antigo: AppState | null = null;
  try {
    const bruto = JSON.parse(localStorage.getItem('orca_eletrica_state') ?? 'null');
    if (bruto && Array.isArray(bruto.rooms) && Array.isArray(bruto.equips)) {
      const { edicao: _descartado, ...dados } = bruto;
      antigo = dados as AppState;
    }
  } catch { /* JSON antigo corrompido: descarta */ }
  try {
    CHAVES_ANTIGAS.forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem(CHAVE_ANTIGA_SESSAO);
  } catch { /* armazenamento bloqueado */ }
  return antigo;
}

/** Estado salvo, ou null se não existir, estiver corrompido ou vencido (vencido é apagado). */
export function carregarEstado(): EstadoLocal | null {
  if (!noNavegador()) return null;
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) {
      const antigo = migrar();
      if (!antigo) return null;
      const e = novoEstado(antigo);
      salvarEstado(e);
      return e;
    }
    const e = JSON.parse(bruto);
    if (!valido(e) || estadoExpirado(e)) {
      localStorage.removeItem(CHAVE);
      return null;
    }
    return e;
  } catch {
    return null;
  }
}

export function salvarEstado(e: EstadoLocal): void {
  if (!noNavegador()) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch { /* cota cheia ou armazenamento bloqueado: segue sem persistir */ }
}

export function limparEstado(): void {
  if (!noNavegador()) return;
  try {
    localStorage.removeItem(CHAVE);
  } catch { /* armazenamento bloqueado */ }
}

/** Aplica uma alteração ao estado salvo (cria um novo se não existir). */
export function alterarEstado(fn: (e: EstadoLocal) => EstadoLocal, dados: AppState): EstadoLocal {
  const e = fn(carregarEstado() ?? novoEstado(dados));
  salvarEstado(e);
  return e;
}

export const formatarData = (ms: number): string => new Date(ms).toLocaleDateString('pt-BR');
