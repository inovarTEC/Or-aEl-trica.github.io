/* ===== Lista de materiais — circuitos dimensionados pelo motor lib/motor (NBR 5410:2004) ===== */
import { AppState, Comando, Room } from '../types';
import { countMods } from './calculator';
import { circuitosBrutos, resolverUnidades } from './circuitos';
import { tomadasFisicas, gruposTeclas } from '../nbr5410-regras';
export { gruposTeclas };
import { materiaisEntrada } from '../entrada-calc';
import { materiaisAterramento } from '../aterramento-calc';
import { eletrodutoDN, MaterialItem } from './nbr5410';
import {
  VERSAO_MOTOR, SistemaTensao, normalizarSistema, tensoesSistema,
  dimensionarCircuito, reservaQuadro,
} from '../motor/eletrica';
import { cargaTomadasW, cargaIluminacaoW } from '../motor/demanda';
import { calcularDemandaDIS, categoriaDisNor, infoUf, type CargasDIS, type SistemaLigacao } from '../tensao-por-uf';
import { num, routeLen, areaMolhada } from '../util';
import { fpEquip } from '../ponto-equip';

/* ---------- Helpers ---------- */

/**
 * Sistema de tensões: o escolhido na entrada (sistemaTensao); senão o da UF; projetos antigos sem
 * nenhum dos dois caem em 220/127 V (premissa avisada no PDF).
 */
export function sistemaDoEstado(state: Pick<AppState, 'entrada'>): SistemaTensao {
  const e = state.entrada;
  if (e?.sistemaTensao === '220/127' || e?.sistemaTensao === '380/220') return e.sistemaTensao;
  const u = infoUf(e?.uf);
  if (u) return u.tensao;
  return normalizarSistema(String(e?.tensao ?? '').includes('380') ? '380/220' : '220/127');
}

/** NBR 5410 4.1 (seção 4.1 da especificação): tensão e ligação de cada equipamento conforme o sistema. */
export function tensaoEquipamento(tens: string, sistema: SistemaTensao, rede: string): { v: number; ligacao: 'F-N' | 'F-F' } {
  const t = tensoesSistema(sistema);
  if (tens === '380V') return sistema === '380/220' ? { v: 380, ligacao: 'F-F' } : { v: 220, ligacao: 'F-F' };
  if (tens === '127V') return { v: t.fn, ligacao: 'F-N' };
  if (tens === '220V') return sistema === '380/220' ? { v: 220, ligacao: 'F-N' } : { v: 220, ligacao: 'F-F' };
  if (sistema === '380/220') return { v: 220, ligacao: 'F-N' };
  return rede === 'Monofásico' ? { v: 127, ligacao: 'F-N' } : { v: 220, ligacao: 'F-F' };
}

/** Distribui os equipamentos nas parcelas da demanda (DIS-NOR-030 6.27). */
function cargasDosEquipamentos(equips: AppState['equips'], iluminacaoTomadasKw: number): CargasDIS {
  const c: Required<Pick<CargasDIS, 'resistivos' | 'boilers' | 'maquinas' | 'fogoes' | 'arKva' | 'motoresKva' | 'bombas' | 'veiculoKva' | 'outrosKw'>> =
    { resistivos: [], boilers: [], maquinas: [], fogoes: [], arKva: [], motoresKva: [], bombas: [], veiculoKva: [], outrosKw: [] };
  for (const e of equips) {
    const kw = num(e.pot) / 1000;
    const t = String(e.tipo).toLowerCase();
    if (/boiler/.test(t)) c.boilers.push(kw);
    else if (/chuveiro|torneira|aquecedor|ferro/.test(t)) c.resistivos.push(kw);
    else if (/lavar|secadora|lava-lou|micro/.test(t)) c.maquinas.push(kw);
    else if (/forno|fogão|fogao|cooktop/.test(t)) c.fogoes.push(kw);
    else if (/ar-cond|ar cond/.test(t)) c.arKva.push(kw);
    else if (/bomba|hidromassagem/.test(t)) c.bombas.push(kw);
    else if (/motor/.test(t)) c.motoresKva.push(kw / 0.92);
    else if (/veículo|veiculo/.test(t)) c.veiculoKva.push(kw);
    else c.outrosKw.push(kw);
  }
  return { iluminacaoTomadasKw, ...c };
}

/* ---------- Tipos de resultado ---------- */

export interface CircuitoCalc {
  nome: string;
  tipo: 'iluminacao' | 'tug' | 'tue' | 'misto';
  potenciaW: number;
  tensaoV: number;
  ligacao: 'F-N' | 'F-F' | '3F';
  correnteA: number;
  bitolaMM2: number;
  izA: number;
  disjuntorA: number;
  quedaPct: number;
  comprimentoM: number;
  eletrodutoDN: number;
  nCondutores: number;
  dr: boolean;
  comodo?: string;
  /** Tipo de instalação escolhido no cômodo (define eletroduto corrugado x canaleta). */
  instalacao?: string;
  /** Material da instalação aparente do cômodo (canaleta / eletroduto em metros / barras de 3 m). */
  materialAparente?: string;
}

export interface QuadroGeral {
  disjuntorGeralA: number;
  nCircuitos: number;
  reserva: number;
  posicoes: number;
  cargaTotalW: number;
  correnteTotalA: number;
  sistema: SistemaTensao;
  categoria: string;
  demandaKva: number;
  cargaInstaladaKw: number;
  avisoCategoria?: string;
  versaoMotor: string;
  /** Localidade e padrão de entrada (pré-dimensionamento DIS-NOR-030; verificar com a distribuidora). */
  uf?: string;
  distribuidora?: string;
  verificarDistribuidora: boolean;
  ligacaoSistema?: SistemaLigacao;
  caboRamal?: string;
  caboEntrada?: string;
  eletrodutoEntrada?: string;
}

export interface ResultadoCalculo {
  circuitos: CircuitoCalc[];
  quadro: QuadroGeral;
  materiais: MaterialItem[];
}

/* ---------- Motor principal ---------- */

export function calcularMateriais(state: AppState): ResultadoCalculo {
  const circuitos: CircuitoCalc[] = [];
  const rede = state.rede || 'Monofásico';
  const sistema = sistemaDoEstado(state);
  const { fn } = tensoesSistema(sistema);
  const rooms = state.rooms ?? [];
  const equips = (state.equips ?? []).filter((e) => e.tipo && e.pot);

  // Divisão dos circuitos (config do usuário): cada unidade é um cômodo ou um grupo de cômodos vizinhos.
  const { unidades } = resolverUnidades(rooms, state.circuitos);
  const unidadeDoComodo = new Map<string, number>();
  unidades.forEach((u, k) => u.rooms.forEach((r) => unidadeDoComodo.set(r.id, k)));
  const nCircPorUnidade: number[] = unidades.map(() => 0);
  const brutos = circuitosBrutos(unidades);
  for (const b of brutos) {
    const u = unidades[b.unidade];
    // NBR 5410 6.2.5.5 / Tabela 42: circuitos no mesmo trecho (decisão 10.3: ilum + TUG por cômodo + TUEs dele)
    const nAgrupados = brutos.filter((x) => x.unidade === b.unidade).length
      + equips.filter((e) => u.rooms.some((r) => r.id === e.room)).length;
    const dr = u.rooms.some((r) => areaMolhada(`${r.base} ${r.nome}`)); // NBR 5410 5.1.3.2.2
    const primeiro = u.rooms[0];
    const d = dimensionarCircuito({
      potencia: b.potenciaW, tensao: fn, tipo: b.tipo === 'iluminacao' ? 'iluminacao' : 'tug', comprimentoM: b.comprimentoM, nAgrupados,
    });
    circuitos.push({
      nome: b.nome, tipo: b.tipo, potenciaW: b.potenciaW, tensaoV: fn, ligacao: 'F-N',
      correnteA: Math.round(d.ib * 100) / 100, bitolaMM2: d.secao, izA: d.iz, disjuntorA: d.disjuntor, quedaPct: d.queda,
      comprimentoM: b.comprimentoM, eletrodutoDN: eletrodutoDN(d.secao, 3), nCondutores: 3, dr,
      comodo: b.comodo, instalacao: primeiro.inst || '', materialAparente: primeiro.materialAparente,
    });
    nCircPorUnidade[b.unidade] += 1;
  }

  /* NBR 5410 9.5.3.1: equipamento acima de 10 A em circuito próprio (TUE) */
  for (const eq of equips) {
    const room = rooms.find((r) => r.id === eq.room);
    const potW = num(eq.pot);
    const tri = !!eq.trifasico && sistema === '380/220';
    const t = tensaoEquipamento(eq.tens, sistema, rede);
    let dist = num(eq.dist);
    if (dist <= 0 && room) dist = routeLen(room) + num(eq.dint);
    if (dist <= 0) dist = 10;
    const uIdx = room ? unidadeDoComodo.get(room.id) : undefined;
    const nAgrupados = uIdx !== undefined ? nCircPorUnidade[uIdx] + 1 : 1;
    const d = dimensionarCircuito({ potencia: potW, tensao: tri ? 380 : t.v, fp: fpEquip(eq.tipo), tipo: 'tue', comprimentoM: dist, nAgrupados, trifasico: tri });
    // F-N: fase + neutro + PE; F-F: 2 fases + PE; 3F: 3 fases + PE
    const nCond = tri ? 4 : 3;
    circuitos.push({
      nome: `${eq.tipo}${room ? ` — ${room.nome || room.base}` : ''}`, tipo: 'tue', potenciaW: potW,
      tensaoV: tri ? 380 : t.v, ligacao: tri ? '3F' : t.ligacao,
      correnteA: Math.round(d.ib * 100) / 100, bitolaMM2: d.secao, izA: d.iz, disjuntorA: d.disjuntor, quedaPct: d.queda,
      comprimentoM: dist, eletrodutoDN: eletrodutoDN(d.secao, nCond), nCondutores: nCond,
      dr: /chuveiro|torneira|aquecedor|máquina|maquina/i.test(eq.tipo) || (room ? areaMolhada(`${room.base} ${room.nome}`) : false),
      comodo: room ? (room.nome || room.base) : undefined, instalacao: room?.inst || '', materialAparente: room?.materialAparente,
    });
    if (uIdx !== undefined) nCircPorUnidade[uIdx] += 1;
  }

  /* ----- Quadro geral: demanda e categoria pela DIS-NOR-030 6.26–6.27 ----- */
  const cargaTotal = circuitos.reduce((s, c) => s + c.potenciaW, 0);
  const correnteTotal = circuitos.reduce((s, c) => s + c.correnteA, 0);
  const areaTotal = rooms.reduce((s, r) => s + num(r.c) * num(r.l), 0);
  const pontosTom = rooms.reduce((s, r) => s + countMods(r, 'T'), 0);
  const pontosLuz = rooms.reduce((s, r) => s + (r.luzes?.length ?? 0), 0);
  const cargaIT = (cargaTomadasW(areaTotal, pontosTom) + cargaIluminacaoW(pontosLuz, rooms.length)) / 1000;
  const dem = calcularDemandaDIS(cargasDosEquipamentos(equips, cargaIT));
  const ent = state.entrada;
  const sistLig: SistemaLigacao | null =
    ent?.ligacao === 'M' ? 'monofasico' : ent?.ligacao === 'B' ? 'bifasico' : ent?.ligacao === 'T' ? 'trifasico'
      : ent?.tipoEntrada && ent?.sistema ? ent.sistema
        : rede === 'Trifásico' ? 'trifasico' : rede === 'Bifásico' ? 'bifasico' : rede === 'Monofásico' ? 'monofasico' : null;
  const cat = categoriaDisNor(dem.cargaInstaladaKw, dem.demandaKva, sistema, sistLig);
  const uf = infoUf(ent?.uf);
  const reserva = reservaQuadro(circuitos.length); // NBR 5410 6.5.4.7 Tabela 59

  const quadro: QuadroGeral = {
    disjuntorGeralA: cat?.disjuntor ?? 0,
    nCircuitos: circuitos.length,
    reserva,
    posicoes: circuitos.length + reserva,
    cargaTotalW: Math.round(cargaTotal),
    correnteTotalA: Math.round(correnteTotal * 100) / 100,
    sistema,
    categoria: cat?.categoria ?? 'fora do escopo',
    demandaKva: Math.round(dem.demandaKva * 100) / 100,
    cargaInstaladaKw: Math.round(dem.cargaInstaladaKw * 100) / 100,
    avisoCategoria: cat ? cat.aviso : 'Carga acima de 75 kW/kVA: fora do escopo, procure a concessionária.',
    versaoMotor: VERSAO_MOTOR,
    uf: uf?.uf,
    distribuidora: uf?.distribuidora,
    verificarDistribuidora: !uf || uf.verificar,
    ligacaoSistema: cat?.sistema,
    caboRamal: cat?.caboRamal,
    caboEntrada: cat?.caboEntrada,
    eletrodutoEntrada: cat?.eletroduto,
  };

  /* ----- Lista de materiais consolidada ----- */
  const materiais: MaterialItem[] = [];

  // Cabos separados por bitola + cor (NBR 5410): fases, neutro e terra (PE)
  const CORES_FASE = ['Preto', 'Vermelho', 'Marrom'] as const;
  const ORDEM_COR = ['Preto', 'Vermelho', 'Marrom', 'Azul claro', 'Verde-amarelo'];
  const FUNCAO_COR: Record<string, string> = {
    Preto: 'fase', Vermelho: 'fase', Marrom: 'fase', 'Azul claro': 'neutro', 'Verde-amarelo': 'terra',
  };
  const fiosPorBitolaCor: Record<string, { bitola: number; cor: string; metros: number }> = {};
  const bitolasSemTerra = new Set<number>();
  const somarFio = (bitola: number, cor: string, metros: number) => {
    const chave = `${bitola}mm²_${cor}`;
    const atual = fiosPorBitolaCor[chave] ?? { bitola, cor, metros: 0 };
    atual.metros += metros;
    fiosPorBitolaCor[chave] = atual;
  };
  for (const c of circuitos) {
    // 2 = F+N (sem PE separado); 3 = F+N+PE; 4 = 2F+N+PE; 5 = 3F+N+PE
    const n = Math.max(2, Math.min(5, c.nCondutores));
    const temTerra = n >= 3;
    if (!temTerra) bitolasSemTerra.add(c.bitolaMM2);
    // 220 V em rede bifásica/trifásica é ligado entre duas fases: F + F + PE, sem neutro.
    const entreFases = c.tensaoV >= 200 && (rede === 'Bifásico' || rede === 'Trifásico');
    if (entreFases) {
      somarFio(c.bitolaMM2, 'Preto', c.comprimentoM);
      somarFio(c.bitolaMM2, 'Vermelho', c.comprimentoM);
    } else {
      const fases = temTerra ? n - 2 : 1;
      for (let f = 0; f < fases; f++) somarFio(c.bitolaMM2, CORES_FASE[f], c.comprimentoM);
      somarFio(c.bitolaMM2, 'Azul claro', c.comprimentoM);
    }
    if (temTerra) somarFio(c.bitolaMM2, 'Verde-amarelo', c.comprimentoM);
  }
  const fmtBitola = (b: number) => String(b).replace('.', ',');
  const linhasFio = Object.values(fiosPorBitolaCor).sort(
    (a, b) => a.bitola - b.bitola || ORDEM_COR.indexOf(a.cor) - ORDEM_COR.indexOf(b.cor),
  );
  for (const { bitola, cor, metros } of linhasFio) {
    const obsSemTerra = cor === 'Azul claro' && bitolasSemTerra.has(bitola)
      ? ' — há circuito(s) sem condutor de terra separado'
      : '';
    materiais.push({
      item: `Cabo flexível ${fmtBitola(bitola)} mm² — ${cor} (${FUNCAO_COR[cor]})`,
      qtd: Math.ceil(metros * 1.15), // 15% de folga
      unidade: 'm',
      detalhe: `Cobre, isolação PVC 750V${obsSemTerra}`,
    });
  }

  // Eletroduto conforme o tipo de instalação escolhido em cada cômodo:
  // - Embutida na parede / Pela laje ou forro / não informado → eletroduto flexível corrugado (sem luvas de rosca)
  // - Aparente (sobrepor) → conforme o material escolhido: canaleta (barras de 2 m, padrão),
  //   eletroduto rígido em metros ou eletroduto rígido em barras de 3 m (com luvas e curvas)
  const grupoInst = (inst?: string): 'embutida' | 'laje' | 'aparente' | 'nao-informado' =>
    inst === 'Aparente' ? 'aparente' : inst === 'Pela laje' ? 'laje' : inst === 'Embutida na parede' ? 'embutida' : 'nao-informado';
  type AcumAparente = { metros: number; circuitos: number };
  const somarAparente = (mapa: Record<number, AcumAparente>, c: CircuitoCalc) => {
    const a = mapa[c.eletrodutoDN] ?? { metros: 0, circuitos: 0 };
    a.metros += c.comprimentoM; a.circuitos += 1;
    mapa[c.eletrodutoDN] = a;
  };
  const corrugPorDN: Record<number, { metros: number; origens: Set<string> }> = {};
  const canaletaPorDN: Record<number, AcumAparente> = {};
  const rigidoMetroPorDN: Record<number, AcumAparente> = {};
  const rigidoBarraPorDN: Record<number, AcumAparente> = {};
  for (const c of circuitos) {
    const g = grupoInst(c.instalacao);
    if (g === 'aparente') {
      if (c.materialAparente === 'eletroduto_metro') somarAparente(rigidoMetroPorDN, c);
      else if (c.materialAparente === 'eletroduto_peca3m') somarAparente(rigidoBarraPorDN, c);
      else somarAparente(canaletaPorDN, c);
    } else {
      const a = corrugPorDN[c.eletrodutoDN] ?? { metros: 0, origens: new Set<string>() };
      a.metros += c.comprimentoM; a.origens.add(g);
      corrugPorDN[c.eletrodutoDN] = a;
    }
  }
  const dnsOrdenados = (m: Record<number, unknown>) => Object.keys(m).map(Number).sort((a, b) => a - b);
  const ROTULO_ORIGEM: Record<string, string> = { embutida: 'embutido na parede', laje: 'pela laje/forro', 'nao-informado': 'instalação não informada (considerado embutido)' };
  for (const dn of dnsOrdenados(corrugPorDN)) {
    const { metros, origens } = corrugPorDN[dn];
    const onde = [...origens].map(o => ROTULO_ORIGEM[o]).join(' · ');
    materiais.push({ item: `Eletroduto flexível corrugado ${dn}mm`, qtd: Math.ceil(metros * 1.1), unidade: 'm', detalhe: `10% de folga — ${onde}` });
  }
  let metrosCanaleta = 0;
  for (const dn of dnsOrdenados(canaletaPorDN)) {
    const { metros, circuitos: nCirc } = canaletaPorDN[dn];
    const metrosFolga = metros * 1.1; // 10% de folga
    metrosCanaleta += metros;
    const barras = Math.ceil(metrosFolga / 2);
    const curvas = nCirc * 2; // saída do quadro + chegada no cômodo (estimativa)
    materiais.push({ item: `Canaleta PVC com tampa (equiv. eletroduto ${dn}mm)`, qtd: barras, unidade: barras === 1 ? 'barra' : 'barras', detalhe: `Barras de 2 m — ${Math.ceil(metrosFolga)} m com 10% de folga · instalação aparente` });
    materiais.push({ item: `Emenda para canaleta (equiv. ${dn}mm)`, qtd: Math.max(0, barras - 1), unidade: 'un', detalhe: 'Uma entre cada par de barras' });
    materiais.push({ item: `Curva 90° para canaleta (equiv. ${dn}mm)`, qtd: curvas, unidade: 'un', detalhe: 'Estimativa: 2 por circuito' });
  }
  // Eletroduto rígido aparente: abraçadeira a cada ~1 m (cada uma com bucha e parafuso)
  let abracadeiras = 0;
  for (const dn of dnsOrdenados(rigidoMetroPorDN)) {
    const { metros, circuitos: nCirc } = rigidoMetroPorDN[dn];
    const metrosFolga = Math.ceil(metros * 1.1);
    abracadeiras += metrosFolga;
    materiais.push({ item: `Eletroduto rígido PVC aparente ${dn}mm`, qtd: metrosFolga, unidade: 'm', detalhe: '10% de folga · instalação aparente (sobrepor)' });
    materiais.push({ item: `Curva 90° ${dn}mm`, qtd: nCirc * 2, unidade: 'un', detalhe: 'Eletroduto aparente — estimativa: 2 por circuito' });
    materiais.push({ item: `Abraçadeira tipo D para eletroduto ${dn}mm`, qtd: metrosFolga, unidade: 'un', detalhe: 'Uma a cada 1 m' });
  }
  for (const dn of dnsOrdenados(rigidoBarraPorDN)) {
    const { metros, circuitos: nCirc } = rigidoBarraPorDN[dn];
    const metrosFolga = metros * 1.1;
    const barras = Math.ceil(metrosFolga / 3);
    const nAbr = Math.ceil(metrosFolga);
    abracadeiras += nAbr;
    materiais.push({ item: `Eletroduto rígido PVC aparente ${dn}mm (barra 3 m)`, qtd: barras, unidade: barras === 1 ? 'barra' : 'barras', detalhe: `Barras de 3 m — ${Math.ceil(metrosFolga)} m com 10% de folga · instalação aparente (sobrepor)` });
    materiais.push({ item: `Luva de emenda ${dn}mm`, qtd: Math.max(0, barras - 1), unidade: 'un', detalhe: 'Eletroduto aparente — uma entre cada par de barras' });
    materiais.push({ item: `Curva 90° ${dn}mm`, qtd: nCirc * 2, unidade: 'un', detalhe: 'Eletroduto aparente — estimativa: 2 por circuito' });
    materiais.push({ item: `Abraçadeira tipo D para eletroduto ${dn}mm`, qtd: nAbr, unidade: 'un', detalhe: 'Uma a cada 1 m' });
  }

  // Disjuntores
  const djPorAmper: Record<number, number> = {};
  for (const c of circuitos) {
    djPorAmper[c.disjuntorA] = (djPorAmper[c.disjuntorA] ?? 0) + 1;
  }
  for (const [amper, qtd] of Object.entries(djPorAmper)) {
    materiais.push({
      item: `Disjuntor ${amper}A`,
      qtd: Number(qtd),
      unidade: 'un',
      detalhe: 'Curva C, monopolar',
    });
  }

  // Disjuntor geral: uma única linha, pela categoria de atendimento (DIS-NOR-030).
  const polosGeral = quadro.ligacaoSistema === 'trifasico' ? 'tripolar' : quadro.ligacaoSistema === 'bifasico' ? 'bipolar' : 'monopolar';
  const temEntrada = !!state.entrada?.tipoEntrada && state.entrada?.incluirNoPdf !== false;
  if (quadro.disjuntorGeralA > 0) {
    materiais.push({
      item: `Disjuntor geral ${quadro.disjuntorGeralA}A`,
      qtd: 1,
      unidade: 'un',
      detalhe: `Curva C, ${polosGeral} — categoria ${quadro.categoria} (pré-dimensionamento, verificar com a distribuidora)`,
    });
  }

  // Quadro de distribuição
  const nDJ = circuitos.length + 1; // +1 para o geral
  const tamQuadro = nDJ <= 8 ? 8 : nDJ <= 12 ? 12 : nDJ <= 18 ? 18 : nDJ <= 24 ? 24 : 36;
  materiais.push({
    item: `Quadro de distribuição ${tamQuadro} disjuntores`,
    qtd: 1,
    unidade: 'un',
    detalhe: `Embutir ou sobrepor, com barramento e tampa`,
  });

  // Caixas, placas e acessórios — embutido/laje: caixa de embutir + placa;
  // aparente (sobrepor): condulete + tampa, com tomadas e interruptores de sobrepor.
  let cx4x2 = 0, cx4x4 = 0, cxRedonda = 0;
  let sob4x2 = 0, sob4x4 = 0, sobLuz = 0, sobCega = 0, tampa4x2 = 0, tampa4x4 = 0;
  let tomSob10 = 0, tomSob20 = 0, tomSobUsb = 0;
  // Interruptores: placas por nº de teclas (= luzes do comando, em grupos de até 3).
  const placasTeclas: Record<string, number> = {};
  const intSobTeclas: Record<number, number> = {};
  const tomJunto: Record<string, number> = {};
  let swCx4x2 = 0, swCx4x4 = 0, cxExtraTeclas = 0;
  const somar = (m: Record<string | number, number>, k: string | number, n = 1) => { m[k] = (m[k] ?? 0) + n; };
  /** Tomada que vai na placa do interruptor: a escolhida no Sw ou, pelo checkbox, uma simples 10A. */
  const tomadaDoSw = (cmd: Comando, si: number): string => (cmd.sws?.[si]?.tom || (si === 0 && cmd.comTomada ? 'T10' : ''));
  const somarTomadasSobrepor = (t: string | undefined) => {
    const n = tomadasFisicas(t);
    if (!n) return;
    if (t === 'USB') tomSobUsb += n;
    else if (String(t).startsWith('T20')) tomSob20 += n;
    else tomSob10 += n;
  };
  for (const r of state.rooms ?? []) {
    if (r.inst === 'Aparente') {
      for (const p of r.pontos ?? []) {
        if (p.cx === '4x4') { sob4x4++; tampa4x4++; } else { sob4x2++; tampa4x2++; }
        for (const m of p.mods ?? []) somarTomadasSobrepor(m.t);
      }
      sobLuz += (r.luzes ?? []).length;
      for (const cmd of r.comandos ?? []) {
        const grupos = gruposTeclas((cmd.luzes ?? []).length);
        (cmd.sws ?? []).forEach((sw, si) => {
          if (sw.cx === '4x4') { sob4x4++; tampa4x4++; } else { sob4x2++; tampa4x2++; }
          grupos.forEach((teclas, gi) => {
            somar(intSobTeclas, teclas);
            if (gi > 0) { sob4x2++; tampa4x2++; } // placa extra = condulete extra
          });
          somarTomadasSobrepor(tomadaDoSw(cmd, si) || undefined);
        });
      }
      for (const cx of r.caixas ?? []) {
        if (cx.tipo === '4x4') sob4x4++;
        else if (cx.tipo === 'Redonda') sobLuz++;
        else sob4x2++;
        sobCega++;
      }
      continue;
    }
    for (const p of r.pontos ?? []) {
      if (p.cx === '4x4') cx4x4++; else cx4x2++;
    }
    for (const l of r.luzes ?? []) {
      if (l.cx === '4x4') cx4x4++;
      else if (l.cx === 'Redonda') cxRedonda++;
      else cx4x2++;
    }
    for (const cmd of r.comandos ?? []) {
      const grupos = gruposTeclas((cmd.luzes ?? []).length);
      (cmd.sws ?? []).forEach((sw, si) => {
        if (sw.cx === '4x4') { cx4x4++; swCx4x4++; } else { cx4x2++; swCx4x2++; }
        const tom = tomadaDoSw(cmd, si);
        grupos.forEach((teclas, gi) => {
          const tam = gi === 0 ? (sw.cx === '4x4' ? '4x4' : '4x2') : '4x2';
          const comTom = gi === 0 && !!tom;
          somar(placasTeclas, `${tam}|${teclas}|${comTom ? 1 : 0}`);
          if (gi > 0) cxExtraTeclas++; // mais de 3 luzes: segunda placa em outra caixa 4x2
        });
        if (tom) somar(tomJunto, tom, tomadasFisicas(tom));
      });
    }
    for (const cx of r.caixas ?? []) {
      if (cx.tipo === '4x4') cx4x4++;
      else if (cx.tipo === 'Redonda') cxRedonda++;
      else cx4x2++;
    }
  }
  cx4x2 += cxExtraTeclas;
  if (cx4x2 > 0) materiais.push({ item: 'Caixa de embutir 4x2', qtd: cx4x2, unidade: 'un' });
  if (cx4x4 > 0) materiais.push({ item: 'Caixa de embutir 4x4', qtd: cx4x4, unidade: 'un' });
  if (cxRedonda > 0) materiais.push({ item: 'Caixa redonda (fundo)', qtd: cxRedonda, unidade: 'un', detalhe: 'Embutir na laje/forro' });

  // Placas (embutido): tomadas, luzes e passagens levam placa comum; interruptores, placa por nº de teclas.
  const placa4x2 = cx4x2 - swCx4x2 - cxExtraTeclas;
  const placa4x4 = cx4x4 - swCx4x4;
  if (placa4x2 > 0) materiais.push({ item: 'Placa 4x2', qtd: placa4x2, unidade: 'un', detalhe: 'Com espelho' });
  if (placa4x4 > 0) materiais.push({ item: 'Placa 4x4', qtd: placa4x4, unidade: 'un', detalhe: 'Com espelho' });
  const NOME_TECLAS: Record<number, string> = { 1: 'simples', 2: 'duplo', 3: 'triplo' };
  for (const chave of Object.keys(placasTeclas).sort()) {
    const [tam, teclas, comTom] = chave.split('|');
    const n = Number(teclas);
    materiais.push({
      item: `Placa ${tam} ${n} ${n === 1 ? 'tecla' : 'teclas'}${comTom === '1' ? ' + tomada' : ''}`,
      qtd: placasTeclas[chave],
      unidade: 'un',
      detalhe: `Interruptor ${NOME_TECLAS[n]} — ${n} ${n === 1 ? 'luz' : 'luzes'} no conjunto`,
    });
  }
  const ROTULO_TOM: Record<string, string> = { T10: '10A', T20: '20A', USB: 'USB' };
  for (const [t, q] of Object.entries(tomJunto)) {
    const base = t === 'USB' ? 'USB' : t.startsWith('T20') ? 'T20' : 'T10';
    materiais.push({ item: `Tomada ${ROTULO_TOM[base]} na placa do interruptor`, qtd: q, unidade: 'un', detalhe: 'Mesma placa do interruptor' });
  }

  // Aparente (sobrepor)
  const DET_SOB = 'Instalação aparente (sobrepor)';
  if (sob4x2 > 0) materiais.push({ item: 'Caixa de sobrepor 4x2 (condulete)', qtd: sob4x2, unidade: 'un', detalhe: DET_SOB });
  if (sob4x4 > 0) materiais.push({ item: 'Caixa de sobrepor 4x4 (condulete)', qtd: sob4x4, unidade: 'un', detalhe: DET_SOB });
  if (sobLuz > 0) materiais.push({ item: 'Caixa octogonal de sobrepor (condulete) para luz', qtd: sobLuz, unidade: 'un', detalhe: DET_SOB });
  if (tampa4x2 > 0) materiais.push({ item: 'Tampa para condulete 4x2', qtd: tampa4x2, unidade: 'un', detalhe: 'Para tomada/interruptor de sobrepor' });
  if (tampa4x4 > 0) materiais.push({ item: 'Tampa para condulete 4x4', qtd: tampa4x4, unidade: 'un', detalhe: 'Para tomada/interruptor de sobrepor' });
  if (sobCega > 0) materiais.push({ item: 'Tampa cega para condulete', qtd: sobCega, unidade: 'un', detalhe: 'Caixas de passagem aparentes' });
  if (tomSob10 > 0) materiais.push({ item: 'Tomada de sobrepor 2P+T 10A', qtd: tomSob10, unidade: 'un', detalhe: DET_SOB });
  if (tomSob20 > 0) materiais.push({ item: 'Tomada de sobrepor 2P+T 20A', qtd: tomSob20, unidade: 'un', detalhe: DET_SOB });
  if (tomSobUsb > 0) materiais.push({ item: 'Tomada USB de sobrepor', qtd: tomSobUsb, unidade: 'un', detalhe: DET_SOB });
  for (const teclas of Object.keys(intSobTeclas).map(Number).sort((a, b) => a - b)) {
    materiais.push({ item: `Interruptor de sobrepor ${teclas} ${teclas === 1 ? 'tecla' : 'teclas'}`, qtd: intSobTeclas[teclas], unidade: 'un', detalhe: DET_SOB });
  }

  // Conectores / emendas
  const totalConexoes = circuitos.length * 4; // estimativa
  materiais.push({ item: 'Conector de emenda (tipo Wago ou similar)', qtd: totalConexoes, unidade: 'un' });

  // Fita isolante
  materiais.push({ item: 'Fita isolante', qtd: Math.max(2, Math.ceil(circuitos.length / 3)), unidade: 'rolo' });

  // Fixação da instalação aparente (embutido não leva abraçadeira)
  if (metrosCanaleta > 0) {
    materiais.push({ item: 'Bucha e parafuso para fixação de canaleta', qtd: Math.ceil(metrosCanaleta * 1.1 / 0.6), unidade: 'un', detalhe: 'A cada 60 cm' });
  }
  if (abracadeiras > 0) {
    materiais.push({ item: 'Bucha e parafuso para abraçadeira de eletroduto', qtd: abracadeiras, unidade: 'un', detalhe: 'Uma por abraçadeira (eletroduto aparente)' });
  }

  // Materiais da entrada / alimentador principal + padrão de entrada pela categoria
  if (temEntrada && state.entrada) {
    if (quadro.caboRamal) {
      materiais.push({
        item: `Padrão de entrada categoria ${quadro.categoria}`,
        qtd: 1,
        unidade: 'conjunto',
        detalhe: `Ramal de conexão ${quadro.caboRamal}; ramal de entrada ${quadro.caboEntrada}; eletroduto ${quadro.eletrodutoEntrada} — verificar com a distribuidora`,
      });
    }
    for (const m of materiaisEntrada(state.entrada)) {
      materiais.push({ item: m.descricao, qtd: m.qtd, unidade: m.unidade, detalhe: 'Entrada / alimentador principal' });
    }
  }

  // Materiais do aterramento principal
  if (state.aterramento && state.aterramento.nHastes > 0 && state.aterramento.incluirNoPdf !== false) {
    for (const m of materiaisAterramento(state.aterramento)) {
      materiais.push({ item: m.descricao, qtd: m.qtd, unidade: m.unidade, detalhe: 'Sistema de aterramento' });
    }
  }

  return { circuitos, quadro, materiais };
}
