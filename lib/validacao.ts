/* ===== Validação compartilhada: wizard (navegador) e rotas de API (servidor) ===== */
import { UFS } from './tensao-por-uf';
import type { DadosOrcamento, Room } from './types';
import { minTomadas, perimetro, pontosTomada } from './nbr5410-regras';

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

/** Índice da primeira etapa com erro (6 = todas OK; Entrada e Aterramento, passos 4 e 5, só geram avisos). */
export function primeiraEtapaInvalida(s: DadosOrcamento): number {
  for (let i = 0; i < 6; i++) if (errosEtapa(s, i).length > 0) return i;
  return 6;
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
  // Pontos de tomada (simples/dupla/tripla = 1), mesma regra de countMods — inclui as montadas no interruptor.
  let atual = 0;
  for (const p of r?.pontos ?? []) for (const m of p?.mods ?? []) if (String(m?.t ?? '').startsWith('T')) atual += pontosTomada(m.t);
  for (const c of r?.comandos ?? []) for (const sw of c?.sws ?? []) if (String(sw?.tom ?? '').startsWith('T')) atual += pontosTomada(sw.tom);
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
const TENSAO = ['', '127V', '220V', '380V'];
const ENT_TIPO = ['aerea', 'subterranea', 'parede'];
const ENT_POSTE = ['6m', '7m', 'nao-tem'];
const ENT_SISTEMA = ['monofasico', 'bifasico', 'trifasico'];
const ENT_BITOLA = ['6', '10', '16'];
const ENT_DIAM = ['3/4', '1', '1-1/4'];
const ENT_ELETRODUTO = ['rigido', 'flexivel'];
const ENT_UNIDADE = ['metro', 'peca3m'];
const MATERIAL_APARENTE = ['canaleta', 'eletroduto_metro', 'eletroduto_peca3m'];
const ENT_TENSAO = ['', '127', '220', '380'];
const bool = (v: unknown) => v === undefined || typeof v === 'boolean';

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
    if (!opcional(r.materialAparente, MATERIAL_APARENTE)) return 'material aparente inválido';
    for (const k of ['c', 'l', 'dq', 'dd', 'dr', 'dpad', 'pe']) if (!medida(r[k], LIM.metros)) return `medida "${k}" inválida`;
    for (const k of ['pontos', 'luzes', 'comandos', 'caixas']) if (!lista(r[k], LIM.itens)) return `${k} inválido`;
    for (const p of r.pontos ?? []) {
      if (!p || !lista(p.mods, 10) || !medida(p.d, LIM.metros) || !bool(p.auto)) return 'tomada inválida';
      for (const m of p.mods ?? []) if (!m || !MODULO.includes(m.t)) return 'módulo inválido';
    }
    for (const l of r.luzes ?? []) if (!l || !medida(l.d, LIM.metros)) return 'luz inválida';
    for (const c of r.comandos ?? []) {
      if (!c || !lista(c.luzes, LIM.itens) || !lista(c.sws, 20) || !bool(c.comTomada)) return 'interruptor inválido';
      for (const sw of c.sws ?? []) if (!sw || !medida(sw.d, LIM.metros) || !(sw.tom === '' || sw.tom === undefined || MODULO.includes(sw.tom))) return 'interruptor inválido';
    }
  }
  for (const q of d.equips ?? []) {
    if (!q || typeof q !== 'object' || !opcional(q.tipo, EQUIP) || !opcional(q.tens, TENSAO) || !texto(q.room, 64)
      || !opcional(q.cx, EQUIP_CX) || !opcional(q.ponto, EQUIP_PONTO)) return 'equipamento inválido';
    if (!medida(q.pot, LIM.watts) || !medida(q.dist, LIM.metros) || !medida(q.dint, LIM.metros)) return 'medida do equipamento inválida';
  }
  const en = d.entrada;
  if (en !== undefined) {
    if (!en || typeof en !== 'object' || Array.isArray(en)) return 'entrada inválida';
    if (!opcional(en.tipoEntrada, ENT_TIPO) || !opcional(en.poste, ENT_POSTE) || !opcional(en.sistema, ENT_SISTEMA)
      || !opcional(en.bitola, ENT_BITOLA) || !opcional(en.diametroEletroduto, ENT_DIAM) || !opcional(en.tipoEletroduto, ENT_ELETRODUTO)
      || !opcional(en.unidadeEletroduto, ENT_UNIDADE)
      || !opcional(en.tensao, ENT_TENSAO) || !bool(en.sistemaManual) || !bool(en.bitolaManual) || !bool(en.diametroManual)
      || !texto(en.obs, LIM.obs) || !bool(en.incluirNoPdf)
      || !opcional(en.sistemaTensao, ['220/127', '380/220', 'nao-sei']) || !opcional(en.ligacao, ['M', 'B', 'T', 'nao-sei'])
      || !opcional(en.uf, ['', ...UFS.map((u) => u.uf)])) return 'entrada inválida';
    if (!medida(en.percurso, LIM.metros) || !medida(en.potenciaDemandada, 1000)) return 'medida da entrada inválida';
  }
  const ci = d.circuitos;
  if (ci !== undefined) {
    if (!ci || typeof ci !== 'object' || Array.isArray(ci)) return 'circuitos inválido';
    if (!opcional(ci.modo, ['norma', 'economico', 'maximo', 'manual']) || !lista(ci.unico, LIM.comodos) || !lista(ci.grupos, LIM.comodos)) return 'circuitos inválido';
    for (const id of ci.unico ?? []) if (typeof id !== 'string' || id.length > 64) return 'circuitos inválido';
    for (const g of ci.grupos ?? []) {
      if (!g || typeof g !== 'object' || typeof g.id !== 'string' || g.id.length > 80 || !Array.isArray(g.rooms) || g.rooms.length > LIM.comodos
        || !Array.isArray(g.dists) || g.dists.length > LIM.comodos || !bool(g.unico)) return 'grupo de circuito inválido';
      for (const id of g.rooms) if (typeof id !== 'string' || id.length > 64) return 'grupo de circuito inválido';
      for (const x of g.dists) if (!medida(x, LIM.metros)) return 'distância do grupo inválida';
    }
  }
  const at = d.aterramento;
  if (at !== undefined) {
    if (!at || typeof at !== 'object' || Array.isArray(at)) return 'aterramento inválido';
    const inteiro = (v: unknown, max: number) => v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max);
    if (!inteiro(at.nHastes, 50) || !inteiro(at.nCaixasInspecao, 50) || !inteiro(at.nConectores, 50) || !opcional(at.comprimentoHaste, ['2.4'])
      || !opcional(at.bitolaCabo, ['6', '10']) || !texto(at.obs, LIM.obs) || !bool(at.incluirNoPdf)) return 'aterramento inválido';
    if (!medida(at.distancia, LIM.metros)) return 'medida do aterramento inválida';
  }
  return null;
}

/** Mantém só os campos do cálculo (descarta qualquer chave extra enviada ao servidor). */
export function somenteDados(d: any): DadosOrcamento {
  return {
    imovel: d.imovel ?? '', obra: d.obra ?? '', cobertura: d.cobertura ?? '', rede: d.rede ?? '',
    rooms: d.rooms ?? [], equips: d.equips ?? [],
    ...(d.entrada ? { entrada: d.entrada } : {}),
    ...(d.aterramento ? { aterramento: d.aterramento } : {}),
    ...(d.circuitos ? { circuitos: d.circuitos } : {}),
  };
}