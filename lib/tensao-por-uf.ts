/* ===== UF → distribuidora → tensão, e pré-dimensionamento da entrada pela DIS-NOR-030 Rev.05 ===== */
import {
  cargaTomadasW, cargaIluminacaoW, fatorTabela6, fatorTabela7, fatorTabela8, fatorTabela9, fatorTabela10, fatorTabela12,
  categoriaAtendimento, type Ligacao,
} from './motor/demanda';

export type VoltageSystem = '220/127' | '380/220';
export type SistemaLigacao = 'monofasico' | 'bifasico' | 'trifasico';

export interface UfInfo {
  uf: string;
  nome: string;
  tensao: VoltageSystem;
  distribuidora: string;
  tabelaCategoria: 'tab1_coelba' | 'tab2_pe' | 'tab3_elektro' | 'generica_220' | 'generica_380';
  /** true quando a tabela de categorias é só referência (fora da área da Neoenergia). */
  verificar: boolean;
}

const uf = (sigla: string, nome: string, tensao: VoltageSystem, distribuidora: string, tabelaCategoria: UfInfo['tabelaCategoria'], verificar = true): UfInfo =>
  ({ uf: sigla, nome, tensao, distribuidora, tabelaCategoria, verificar });

/** Todas as 27 UFs. Tensão predominante da baixa tensão residencial; confirme sempre na distribuidora local. */
export const UFS: UfInfo[] = [
  uf('AC', 'Acre', '220/127', 'Energisa Acre', 'generica_220'),
  uf('AL', 'Alagoas', '380/220', 'Equatorial Alagoas', 'generica_380'),
  uf('AP', 'Amapá', '220/127', 'Equatorial Amapá (CEA)', 'generica_220'),
  uf('AM', 'Amazonas', '380/220', 'Amazonas Energia', 'generica_380'),
  uf('BA', 'Bahia', '220/127', 'Neoenergia Coelba', 'tab1_coelba', false),
  uf('CE', 'Ceará', '380/220', 'Enel Ceará', 'generica_380'),
  uf('DF', 'Distrito Federal', '380/220', 'Neoenergia Brasília', 'tab2_pe', false),
  uf('ES', 'Espírito Santo', '220/127', 'EDP Espírito Santo', 'generica_220'),
  uf('GO', 'Goiás', '380/220', 'Equatorial Goiás', 'generica_380'),
  uf('MA', 'Maranhão', '380/220', 'Equatorial Maranhão', 'generica_380'),
  uf('MT', 'Mato Grosso', '380/220', 'Energisa Mato Grosso', 'generica_380'),
  uf('MS', 'Mato Grosso do Sul', '220/127', 'Energisa Mato Grosso do Sul', 'tab3_elektro'),
  uf('MG', 'Minas Gerais', '220/127', 'Cemig', 'generica_220'),
  uf('PA', 'Pará', '380/220', 'Equatorial Pará', 'generica_380'),
  uf('PB', 'Paraíba', '380/220', 'Energisa Paraíba', 'generica_380'),
  uf('PR', 'Paraná', '220/127', 'Copel', 'generica_220'),
  uf('PE', 'Pernambuco', '380/220', 'Neoenergia Pernambuco', 'tab2_pe', false),
  uf('PI', 'Piauí', '380/220', 'Equatorial Piauí', 'generica_380'),
  uf('RJ', 'Rio de Janeiro', '220/127', 'Light / Enel Rio', 'generica_220'),
  uf('RN', 'Rio Grande do Norte', '380/220', 'Neoenergia Cosern', 'tab2_pe', false),
  uf('RS', 'Rio Grande do Sul', '220/127', 'CEEE Equatorial / RGE', 'generica_220'),
  uf('RO', 'Rondônia', '380/220', 'Energisa Rondônia', 'generica_380'),
  uf('RR', 'Roraima', '220/127', 'Roraima Energia', 'generica_220'),
  uf('SC', 'Santa Catarina', '220/127', 'Celesc', 'generica_220'),
  uf('SP', 'São Paulo', '220/127', 'Enel SP / CPFL / Elektro / EDP', 'tab3_elektro'),
  uf('SE', 'Sergipe', '380/220', 'Energisa Sergipe', 'generica_380'),
  uf('TO', 'Tocantins', '380/220', 'Energisa Tocantins', 'generica_380'),
];

export function infoUf(sigla: string | undefined | null): UfInfo | undefined {
  return UFS.find((u) => u.uf === String(sigla ?? '').toUpperCase());
}

/** Sistema sugerido ao escolher a UF: monofásico até o limite da ligação M; acima, trifásico (ou bifásico em 220/127). */
export function sistemaSugeridoUf(tensao: VoltageSystem, cargaKw: number): SistemaLigacao {
  if (tensao === '380/220') return cargaKw > 15 ? 'trifasico' : 'monofasico';
  if (cargaKw > 18) return 'trifasico';
  return cargaKw > 10 ? 'bifasico' : 'monofasico';
}

/* ---------- Tabelas DIS-NOR-030 Rev.05 ---------- */

/** Tabela 5: carga de tomadas por área construída (W), quando não há levantamento por cômodo. */
export const TABELA_5_W: [number, number][] = [
  [8, 700], [15, 900], [20, 1600], [30, 1700], [50, 2400], [70, 2500], [90, 2600],
  [110, 2700], [140, 2800], [170, 2900], [200, 3000], [220, 3100], [250, 3200],
];
export const tabela5 = (areaM2: number) => cargaTomadasW(areaM2, 0);
export { fatorTabela6 as tabela6, fatorTabela7 as tabela7, fatorTabela8 as tabela8, fatorTabela9 as tabela9, fatorTabela10 as tabela10, fatorTabela12 as tabela12 };

/** Tabela 11: ar-condicionado (VA em 220 V) por capacidade em BTU/h. */
export const TABELA_11_VA: [number, number][] = [
  [7500, 1100], [9000, 1550], [10000, 1650], [12000, 1900], [15000, 2100], [18000, 2860], [21000, 3080], [30000, 4000],
];
export function tabela11(btu: number): number {
  return (TABELA_11_VA.find(([b]) => btu <= b) ?? TABELA_11_VA[TABELA_11_VA.length - 1])[1];
}

/** Tabela 14: motores — o maior a 100 %, os demais a 50 % (kVA). */
export function tabela14(motoresKva: number[]): number {
  if (!motoresKva.length) return 0;
  const ord = [...motoresKva].sort((a, b) => b - a);
  return ord[0] + ord.slice(1).reduce((s, x) => s + x * 0.5, 0);
}

/** Tabela 16: bombas e hidromassagem. */
export function tabela16(n: number): number { return n <= 1 ? 1 : n === 2 ? 0.56 : n === 3 ? 0.47 : 0.39; }

/* ---------- Demanda ---------- */

export interface CargasDIS {
  /** Iluminação + tomadas (kW). Se ausente, usa Tabela 5 (área) + 100 W por cômodo. */
  iluminacaoTomadasKw?: number;
  areaM2?: number;
  nComodos?: number;
  /** b: chuveiros, torneiras, aquecedores de passagem, ferros (kW cada). */
  resistivos?: number[];
  /** c: boilers (kW cada). */
  boilers?: number[];
  /** d: secadora, lavadora, lava-louças, micro-ondas (kW cada; fp 0,92). */
  maquinas?: number[];
  /** e: fogão / forno elétrico (kW cada). */
  fogoes?: number[];
  /** f: ar-condicionado (kVA cada; use tabela11 para converter BTU). */
  arKva?: number[];
  /** g: motores (kVA cada). */
  motoresKva?: number[];
  /** i: bombas e hidromassagem (kW cada). */
  bombas?: number[];
  /** j: recarga de veículo elétrico (kVA cada, individual). */
  veiculoKva?: number[];
  /** Outras cargas sem tabela própria (fator 1,00). */
  outrosKw?: number[];
}

export interface DemandaDIS {
  cargaInstaladaKw: number;
  demandaKva: number;
  parcelas: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'i' | 'j' | 'outros', number>;
}

const soma = (v?: number[]) => (v ?? []).reduce((s, x) => s + (x > 0 ? x : 0), 0);
const qtd = (v?: number[]) => (v ?? []).filter((x) => x > 0).length;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** D = a + b + c + d + e + f + g + i + j (kVA) — DIS-NOR-030 6.27. */
export function calcularDemandaDIS(c: CargasDIS): DemandaDIS {
  const it = c.iluminacaoTomadasKw
    ?? (tabela5(c.areaM2 ?? 0) + cargaIluminacaoW(0, c.nComodos ?? 0)) / 1000;
  const p = {
    a: it * fatorTabela6(it),
    b: soma(c.resistivos) * fatorTabela7(qtd(c.resistivos)),
    c: soma(c.boilers) * fatorTabela8(qtd(c.boilers)),
    d: (soma(c.maquinas) / 0.92) * fatorTabela9(qtd(c.maquinas)),
    e: soma(c.fogoes) * fatorTabela10(qtd(c.fogoes)),
    f: soma(c.arKva) * fatorTabela12(qtd(c.arKva)),
    g: tabela14((c.motoresKva ?? []).filter((x) => x > 0)),
    i: soma(c.bombas) * tabela16(qtd(c.bombas)),
    j: soma(c.veiculoKva),
    outros: soma(c.outrosKw),
  };
  const carga = it + soma(c.resistivos) + soma(c.boilers) + soma(c.maquinas) + soma(c.fogoes) + soma(c.arKva)
    + soma(c.motoresKva) + soma(c.bombas) + soma(c.veiculoKva) + soma(c.outrosKw);
  const parcelas = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r3(v)])) as DemandaDIS['parcelas'];
  return { cargaInstaladaKw: r3(carga), demandaKva: r3(Object.values(p).reduce((s, x) => s + x, 0)), parcelas };
}

/* ---------- Categoria de atendimento ---------- */

/** Tabela 2 (380/220 V): ramal de conexão e cabo de cobre do ramal de entrada. */
const CABOS_TAB2: Record<string, { ramal: string; entrada: string; secaoCu: number }> = {
  M2: { ramal: '6+6 mm² Cu concêntrico', entrada: '6 mm² Cu', secaoCu: 6 },
  M3: { ramal: '10+10 mm² Cu concêntrico', entrada: '10 mm² Cu', secaoCu: 10 },
  T6: { ramal: '3x10+10 mm² Al multiplexado', entrada: '3x6/6/6 mm² Cu', secaoCu: 6 },
  T7: { ramal: '3x10+10 mm² Al multiplexado', entrada: '3x6/6/6 mm² Cu', secaoCu: 6 },
  T8: { ramal: '3x16+16 mm² Al multiplexado', entrada: '3x10/10/10 mm² Cu', secaoCu: 10 },
  T9: { ramal: '3x16+16 mm² Al multiplexado', entrada: '3x16/16/16 mm² Cu', secaoCu: 16 },
  T10: { ramal: '3x25+25 mm² Al multiplexado', entrada: '3x25/25/16 mm² Cu', secaoCu: 25 },
  T11: { ramal: '3x35+35 mm² Al multiplexado', entrada: '3x35/35/16 mm² Cu', secaoCu: 35 },
  T12: { ramal: '3x50+50 mm² Al multiplexado', entrada: '3x50/50/25 mm² Cu', secaoCu: 50 },
};

/** Tabela 1 (220/127 V) sem cabo na especificação: seção de cobre estimada pelo disjuntor (referência). */
function secaoPorDisjuntor(a: number): number {
  return a <= 40 ? 10 : a <= 50 ? 10 : a <= 63 ? 16 : a <= 70 ? 25 : a <= 100 ? 35 : a <= 125 ? 50 : a <= 150 ? 70 : 95;
}

/** Eletroduto do ramal de entrada pela seção de cobre (referência). */
function eletrodutoPorSecao(s: number): string {
  return s <= 10 ? '32 mm (1")' : s <= 25 ? '40 mm (1¼")' : s <= 50 ? '50 mm (1½")' : '60 mm (2")';
}

export interface CategoriaDisNor {
  categoria: string;
  disjuntor: number;
  sistema: SistemaLigacao;
  caboRamal: string;
  caboEntrada: string;
  eletroduto: string;
  /** Seção de cobre do ramal de entrada (mm²). */
  secaoCu: number;
  aviso?: string;
}

/**
 * Bitola do alimentador (6/10/16 mm²): a seção da categoria (DIS-NOR-030) e, por queda de tensão,
 * no mínimo 10 mm² acima de 30 m e 16 mm² acima de 50 m de percurso.
 */
export function bitolaEntrada(secaoCu: number, percursoM: number): '6' | '10' | '16' {
  const porPercurso = percursoM > 50 ? 16 : percursoM > 30 ? 10 : 6;
  const s = Math.max(secaoCu || 6, porPercurso);
  return s <= 6 ? '6' : s <= 10 ? '10' : '16';
}

const LIG_SISTEMA: Record<Ligacao, SistemaLigacao> = { M: 'monofasico', B: 'bifasico', T: 'trifasico' };
const SISTEMA_LIG: Record<SistemaLigacao, Ligacao> = { monofasico: 'M', bifasico: 'B', trifasico: 'T' };

/**
 * Categoria pela DIS-NOR-030 6.28 (M/B pela carga instalada em kW; T pela demanda em kVA).
 * Sem ligação informada → menor categoria compatível. Acima de 75 kW/kVA → null.
 */
export function categoriaDisNor(cargaKw: number, demandaKva: number, tensao: VoltageSystem, sistema?: SistemaLigacao | null): CategoriaDisNor | null {
  const lig = sistema ? SISTEMA_LIG[sistema] : null;
  const { categoria: c, aviso } = categoriaAtendimento(tensao, lig, cargaKw, demandaKva);
  if (!c) return null;
  const t2 = tensao === '380/220' ? CABOS_TAB2[c.codigo] : undefined;
  const secao = t2?.secaoCu ?? secaoPorDisjuntor(c.disjuntor);
  const fases = c.ligacao === 'T' ? 3 : c.ligacao === 'B' ? 2 : 1;
  const caboEstimado = `${fases > 1 ? `${fases}x` : ''}${secao} mm² Cu + neutro (estimado)`;
  return {
    categoria: c.codigo,
    disjuntor: c.disjuntor,
    sistema: LIG_SISTEMA[c.ligacao],
    caboRamal: t2?.ramal ?? 'conforme distribuidora',
    caboEntrada: t2?.entrada ?? caboEstimado,
    eletroduto: eletrodutoPorSecao(secao),
    secaoCu: secao,
    aviso,
  };
}
