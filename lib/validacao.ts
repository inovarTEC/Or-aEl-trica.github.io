/* ===== Validação compartilhada: wizard (navegador) e rotas de API (servidor) ===== */
import type { DadosOrcamento, Room } from './types';
import { minTomadas, perimetro, tomadasFisicas } from './nbr5410-regras';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** Para os onChange dos campos numéricos: valor negativo vira vazio (o campo volta a ficar pendente). */
export function semNegativo(v: string | undefined | null): string {
  const s = String(v ?? '');
  return s.trim().startsWith('-') ? '' : s;
}

/* ---------------- Regras do wizard (o que impede avançar) ---------------- */

const nomeDe = (r: Room) => r?.nome || r?.base || 'Cômodo';

/** Erros que bloqueiam sair da etapa `step` (0 Imóvel, 1 Cômodos, 2 Pontos, 3 Equipamentos). */
export function errosEtapa(s: DadosOrcamento, step: number): string[] {
  const e: string[] = [];
  const rooms = s?.rooms ?? [];
  if (step === 0) {
    if (!s?.imovel) e.push('Escolha o tipo de imóvel');
    if (!s?.obra) e.push('Escolha o tipo de obra');
  }
  if (step === 1) {
    if (rooms.length === 0) e.push('Adicione pelo menos um cômodo');
    for (const r of rooms) {
      if (!(num(r?.c) > 0) || !(num(r?.l) > 0)) e.push(`${nomeDe(r)}: informe comprimento e largura maiores que zero`);
      for (const k of ['c', 'l', 'dq', 'dd', 'dr', 'dpad', 'pe'] as const) {
        if (num(r?.[k]) < 0) { e.push(`${nomeDe(r)}: medidas não podem ser negativas`); break; }
      }
    }
  }
  if (step === 2) {
    const total = rooms.reduce((a, r) => a + (r?.pontos?.length ?? 0) + (r?.luzes?.length ?? 0), 0);
    if (total === 0) e.push('Adicione pelo menos uma tomada ou ponto de luz');
  }
  if (step === 3) {
    (s?.equips ?? []).forEach((q, i) => {
      const n = q?.tipo || `Equipamento ${i + 1}`;
      if (!q?.tipo) e.push(`Equipamento ${i + 1}: escolha o tipo`);
      if (!(num(q?.pot) > 0)) e.push(`${n}: informe a potência (W) maior que zero`);
      if (num(q?.dist) < 0 || num(q?.dint) < 0) e.push(`${n}: distâncias não podem ser negativas`);
    });
  }
  return e;
}

/** Índice da primeira etapa com erro (4 = todas as etapas de dados estão OK). */
export function primeiraEtapaInvalida(s: DadosOrcamento): number {
  for (let i = 0; i < 4; i++) if (errosEtapa(s, i).length > 0) return i;
  return 4;
}

/** Todos os erros obrigatórios (usado antes de cobrar ou gerar o PDF). */
export function faltasObrigatorias(s: DadosOrcamento): string[] {
  return [0, 1, 2, 3].flatMap((i) => errosEtapa(s, i));
}

/* ---------------- NBR 5410: quantidade mínima de tomadas ---------------- */

/** Pontos de tomada (com ao menos um módulo T*) vs. mínimo da NBR 5410. null se faltam medidas. */
export function tomadasNbr(r: Room): { minimo: number; atual: number } | null {
  const c = num(r?.c), l = num(r?.l);
  if (c <= 0 || l <= 0) return null;
  const minimo = minTomadas(c * l, perimetro(c, l), `${r?.base ?? ''} ${r?.nome ?? ''}`);
  // Tomadas físicas (dupla = 2, tripla = 3), mesma regra de countMods — inclui as montadas no interruptor.
  let atual = 0;
  for (const p of r?.pontos ?? []) for (const m of p?.mods ?? []) if (String(m?.t ?? '').startsWith('T')) atual += tomadasFisicas(m.t);
  for (const c of r?.comandos ?? []) for (const sw of c?.sws ?? []) if (String(sw?.tom ?? '').startsWith('T')) atual += tomadasFisicas(sw.tom);
  return { minimo, atual };
}

/* ---------------- Validação estrutural (servidor) ---------------- */

const IMOVEL = ['', 'Casa', 'Apartamento', 'Comércio pequeno'];
const OBRA = ['', 'Construção nova', 'Reforma', 'Ampliação'];
const COBERTURA = ['', 'Laje', 'Forro de gesso', 'Telhado aparente', 'Não sei'];
const REDE = ['', 'Monofásico', 'Bifásico', 'Trifásico', 'Não sei'];
const MODULO = ['T10', 'T10D', 'T10T', 'T20', 'T20D', 'T20T', 'USB'];
const EQUIP_CX = ['4x2', '4x4'];
const EQUIP_PONTO = ['T20', 'T20D', 'borne', 'tampa', 'emenda'];
const EQUIP = ['', 'Chuveiro elétrico', 'Torneira elétrica', 'Ar-condicionado', 'Forno elétrico', 'Cooktop elétrico',
  'Máquina de lavar', 'Secadora', 'Aquecedor', 'Bomba', 'Carregador de veículo elétrico', 'Outro'];
const TENSAO = ['', '127V', '220V'];

const LIM = { comodos: 60, itens: 200, equips: 60, texto: 120, obs: 500, metros: 1000, watts: 100_000 };

const opcional = (v: unknown, lista: string[]) => v === undefined || (typeof v === 'string' && lista.includes(v));
const texto = (v: unknown, max: number) => v === undefined || (typeof v === 'string' && v.length <= max);
const lista = (v: unknown, max: number) => v === undefined || (Array.isArray(v) && v.length <= max);
/** Vazio é aceito (fica como pendência); preenchido precisa ser número finito entre 0 e max. */
function medida(v: unknown, max: number): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (typeof v !== 'string' && typeof v !== 'number') return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max;
}

/**
 * Confere tipos, limites e valores negativos. Devolve null se estiver OK, ou a descrição do problema.
 * Não exige completude (a prévia gratuita mostra as pendências); para isso use faltasObrigatorias().
 */
export function problemaEstrutura(d: any): string | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'dados ausentes';
  if (!Array.isArray(d.rooms) || d.rooms.length > LIM.comodos) return 'rooms inválido';
  if (!lista(d.equips, LIM.equips)) return 'equips inválido';
  if (!opcional(d.imovel, IMOVEL) || !opcional(d.obra, OBRA) || !opcional(d.cobertura, COBERTURA) || !opcional(d.rede, REDE)) {
    return 'campo do imóvel inválido';
  }
  for (const r of d.rooms) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || r.id.length > 64) return 'cômodo inválido';
    if (!texto(r.nome, LIM.texto) || !texto(r.base, LIM.texto) || !texto(r.via, 64) || !texto(r.obs, LIM.obs)) return 'texto do cômodo inválido';
    for (const k of ['c', 'l', 'dq', 'dd', 'dr', 'dpad', 'pe']) if (!medida(r[k], LIM.metros)) return `medida "${k}" inválida`;
    for (const k of ['pontos', 'luzes', 'comandos', 'caixas']) if (!lista(r[k], LIM.itens)) return `${k} inválido`;
    for (const p of r.pontos ?? []) {
      if (!p || !lista(p.mods, 10) || !medida(p.d, LIM.metros)) return 'tomada inválida';
      for (const m of p.mods ?? []) if (!m || !MODULO.includes(m.t)) return 'módulo inválido';
    }
    for (const l of r.luzes ?? []) if (!l || !medida(l.d, LIM.metros)) return 'luz inválida';
    for (const c of r.comandos ?? []) {
      if (!c || !lista(c.luzes, LIM.itens) || !lista(c.sws, 20)) return 'interruptor inválido';
      for (const sw of c.sws ?? []) if (!sw || !medida(sw.d, LIM.metros) || !(sw.tom === '' || sw.tom === undefined || MODULO.includes(sw.tom))) return 'interruptor inválido';
    }
  }
  for (const q of d.equips ?? []) {
    if (!q || typeof q !== 'object' || !opcional(q.tipo, EQUIP) || !opcional(q.tens, TENSAO) || !texto(q.room, 64)
      || !opcional(q.cx, EQUIP_CX) || !opcional(q.ponto, EQUIP_PONTO)) return 'equipamento inválido';
    if (!medida(q.pot, LIM.watts) || !medida(q.dist, LIM.metros) || !medida(q.dint, LIM.metros)) return 'medida do equipamento inválida';
  }
  return null;
}

/** Mantém só os campos do cálculo (descarta qualquer chave extra enviada ao servidor). */
export function somenteDados(d: any): DadosOrcamento {
  return {
    imovel: d.imovel ?? '', obra: d.obra ?? '', cobertura: d.cobertura ?? '', rede: d.rede ?? '',
    rooms: d.rooms ?? [], equips: d.equips ?? [],
  };
}
