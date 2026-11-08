/* ===== Entrada de energia — DIS-NOR-030 REV 05 (Neoenergia) como padrão de referência ===== */
import type { SistemaTensao } from './eletrica';

export type Ligacao = 'M' | 'B' | 'T';

/** Grupos de aparelho para a demanda (DIS-NOR-030 6.27). */
export type GrupoDemanda = 'b' | 'c' | 'd' | 'e' | 'f' | 'ghi';

export interface AparelhoDemanda { grupo: GrupoDemanda; kw: number; kva?: number }

/** DIS-NOR-030 6.26 Tabela 5: [área máx (m²), pontos de 100 W, pontos de cozinha de 600 W]. */
const TABELA_5: [number, number, number][] = [
  [8, 1, 1], [15, 3, 1], [20, 4, 2], [30, 5, 2], [50, 6, 3], [70, 7, 3], [90, 8, 3],
  [110, 9, 3], [140, 10, 3], [170, 11, 3], [200, 12, 3], [220, 13, 3], [250, 14, 3],
];

/** Carga de tomadas (W) — DIS-NOR-030 6.26 Tabela 5. */
export function cargaTomadasW(areaConstruidaM2: number, pontosDeclarados: number): number {
  if (areaConstruidaM2 > 250) return pontosDeclarados * 100 + 3 * 600;
  const linha = TABELA_5.find(([max], i) => (i === 0 ? areaConstruidaM2 < max : areaConstruidaM2 <= max)) ?? TABELA_5[TABELA_5.length - 1];
  return Math.max(pontosDeclarados, linha[1]) * 100 + linha[2] * 600;
}

/** Carga de iluminação (W) — DIS-NOR-030 6.26: maior entre pontos de luz e nº de cômodos, × 100 W. */
export function cargaIluminacaoW(pontosLuz: number, nComodos: number): number {
  return Math.max(pontosLuz, nComodos) * 100;
}

/** DIS-NOR-030 6.26: potência média quando o usuário não informa a de placa (W). */
export const POTENCIA_MEDIA_W: Record<string, number> = {
  'Torneira elétrica': 3000, 'Chuveiro elétrico': 4000, 'Máquina de lavar': 1500, 'Secadora': 2500,
  'Forno elétrico': 1500, 'Carregador de veículo elétrico': 3300,
};

/** DIS-NOR-030 6.27 Tabela 6 (iluminação e tomadas), faixas em kW. */
export function fatorTabela6(kw: number): number {
  const f: [number, number][] = [[1, 0.86], [2, 0.75], [3, 0.66], [4, 0.59], [5, 0.52], [6, 0.45], [7, 0.4], [8, 0.35], [9, 0.31], [10, 0.27]];
  return f.find(([max]) => kw <= max)?.[1] ?? 0.24;
}
/** DIS-NOR-030 6.27 Tabela 7 (chuveiros, torneiras, aquecedores de passagem, ferros). */
export function fatorTabela7(n: number): number {
  const f = [1, 1, 1, 0.84, 0.76, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.49, 0.48, 0.46, 0.45, 0.44, 0.43, 0.42, 0.41, 0.4, 0.4];
  if (n <= 20) return f[Math.max(0, n)];
  return n <= 23 ? 0.39 : 0.38;
}
/** DIS-NOR-030 6.27 Tabela 8 (boiler). */
export function fatorTabela8(n: number): number { return n <= 1 ? 1 : n === 2 ? 0.72 : 0.62; }
/** DIS-NOR-030 6.27 Tabela 9 (secadora, lavar, lava-louças, micro-ondas, forno). */
export function fatorTabela9(n: number): number { return n <= 1 ? 1 : n <= 4 ? 0.7 : n <= 6 ? 0.6 : 0.5; }
/** DIS-NOR-030 6.27 Tabela 10 (fogão elétrico). */
export function fatorTabela10(n: number): number {
  const f = [1, 1, 0.6, 0.48, 0.4, 0.37, 0.35, 0.33, 0.32, 0.31, 0.3, 0.3];
  if (n <= 11) return f[Math.max(0, n)];
  return n <= 15 ? 0.28 : 0.26;
}
/** DIS-NOR-030 6.27 Tabela 12 (ar-condicionado residencial). Acima de 30 aparelhos: fora do escopo (usa 0,80). */
export function fatorTabela12(n: number): number { return n <= 10 ? 1 : n <= 20 ? 0.86 : 0.8; }

export interface ResultadoDemanda {
  cargaInstaladaKw: number;
  demandaKva: number;
  parcelas: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'ghi', number>;
}

/** DIS-NOR-030 6.27: D = a + b + c + d + e + f + g + h + i (kVA). g, h, i = fator 1,00 (premissa 10.8). */
export function calcularDemanda(cargaIlumTomadasKw: number, aparelhos: AparelhoDemanda[]): ResultadoDemanda {
  const soma = (g: GrupoDemanda) => aparelhos.filter((x) => x.grupo === g).reduce((s, x) => s + x.kw, 0);
  const qtd = (g: GrupoDemanda) => aparelhos.filter((x) => x.grupo === g).length;
  const a = cargaIlumTomadasKw * fatorTabela6(cargaIlumTomadasKw);
  const b = soma('b') * fatorTabela7(qtd('b'));
  const c = soma('c') * fatorTabela8(qtd('c'));
  const d = (soma('d') / 0.92) * fatorTabela9(qtd('d'));
  const e = soma('e') * fatorTabela10(qtd('e'));
  const f = aparelhos.filter((x) => x.grupo === 'f').reduce((s, x) => s + (x.kva ?? x.kw), 0) * fatorTabela12(qtd('f'));
  const ghi = soma('ghi');
  const cargaInstaladaKw = cargaIlumTomadasKw + aparelhos.reduce((s, x) => s + x.kw, 0);
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    cargaInstaladaKw: r2(cargaInstaladaKw),
    demandaKva: r2(a + b + c + d + e + f + ghi),
    parcelas: { a: r2(a), b: r2(b), c: r2(c), d: r2(d), e: r2(e), f: r2(f), ghi: r2(ghi) },
  };
}

export interface Categoria { codigo: string; ligacao: Ligacao; max: number; disjuntor: number; por: 'kW' | 'kVA' }

/** DIS-NOR-030 6.28 e Anexo I — categorias de atendimento. */
export const CATEGORIAS: Record<SistemaTensao, Categoria[]> = {
  '220/127': [
    { codigo: 'M0', ligacao: 'M', max: 5, disjuntor: 40, por: 'kW' },
    { codigo: 'M1', ligacao: 'M', max: 10, disjuntor: 63, por: 'kW' },
    { codigo: 'B0', ligacao: 'B', max: 11, disjuntor: 50, por: 'kW' },
    { codigo: 'B1', ligacao: 'B', max: 18, disjuntor: 70, por: 'kW' },
    { codigo: 'T0', ligacao: 'T', max: 19, disjuntor: 50, por: 'kVA' },
    { codigo: 'T1', ligacao: 'T', max: 24, disjuntor: 63, por: 'kVA' },
    { codigo: 'T2', ligacao: 'T', max: 38, disjuntor: 100, por: 'kVA' },
    { codigo: 'T3', ligacao: 'T', max: 47, disjuntor: 125, por: 'kVA' },
    { codigo: 'T4', ligacao: 'T', max: 57, disjuntor: 150, por: 'kVA' },
    { codigo: 'T5', ligacao: 'T', max: 75, disjuntor: 200, por: 'kVA' },
  ],
  '380/220': [
    { codigo: 'M2', ligacao: 'M', max: 10, disjuntor: 40, por: 'kW' },
    { codigo: 'M3', ligacao: 'M', max: 15, disjuntor: 63, por: 'kW' },
    { codigo: 'T6', ligacao: 'T', max: 21, disjuntor: 32, por: 'kVA' },
    { codigo: 'T7', ligacao: 'T', max: 26, disjuntor: 40, por: 'kVA' },
    { codigo: 'T8', ligacao: 'T', max: 33, disjuntor: 50, por: 'kVA' },
    { codigo: 'T9', ligacao: 'T', max: 40, disjuntor: 63, por: 'kVA' },
    { codigo: 'T10', ligacao: 'T', max: 52, disjuntor: 80, por: 'kVA' },
    { codigo: 'T11', ligacao: 'T', max: 66, disjuntor: 100, por: 'kVA' },
    { codigo: 'T12', ligacao: 'T', max: 75, disjuntor: 125, por: 'kVA' },
  ],
};

const ORDEM: Ligacao[] = ['M', 'B', 'T'];

/**
 * DIS-NOR-030 6.28: M e B decidem pela carga instalada (kW); T pela demanda (kVA).
 * Sem ligação escolhida (ou ligação menor que a carga) → menor categoria compatível, com aviso.
 */
export function categoriaAtendimento(sistema: SistemaTensao, ligacao: Ligacao | null, cargaKw: number, demandaKva: number):
  { categoria: Categoria | null; aviso?: string } {
  const valor = (c: Categoria) => (c.por === 'kW' ? cargaKw : demandaKva);
  const lista = CATEGORIAS[sistema];
  const doTipo = (l: Ligacao) => lista.find((c) => c.ligacao === l && valor(c) <= c.max);
  if (ligacao) {
    const c = doTipo(ligacao);
    if (c) return { categoria: c };
  }
  const inicio = ligacao ? ORDEM.indexOf(ligacao) : 0;
  for (const l of ORDEM.slice(inicio)) {
    const c = doTipo(l);
    if (c) {
      return {
        categoria: c,
        aviso: ligacao
          ? `A carga pede ligação maior que a escolhida: sugerida categoria ${c.codigo}.`
          : `Ligação não informada: sugerida a menor categoria compatível (${c.codigo}).`,
      };
    }
  }
  return { categoria: null, aviso: 'Carga acima de 75 kW/kVA: fora do escopo, procure a concessionária.' };
}
