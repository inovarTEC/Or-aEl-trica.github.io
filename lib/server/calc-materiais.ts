/* ===== Motor de cálculo de materiais (NBR 5410) ===== */
import { AppState, Room } from '../types';
import { countMods } from './calculator';
import {
  potenciaIluminacao,
  potenciaTUG,
  bitolaCircuito,
  disjuntor,
  disjuntorGeral,
  eletrodutoDN,
  nCondutoresCircuito,
  MaterialItem,
} from './nbr5410';

/* ---------- Helpers ---------- */
function num(v: string | number | undefined | null): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(v ?? '');
  return isNaN(n) ? 0 : n;
}

function routeLen(r: Room, rooms: Room[]): number {
  if (r.via) {
    return num(r.dd) + num(r.dr);
  }
  return num(r.dq);
}

function tensaoCircuito(rede: string, tipo: string): number {
  // TUEs de alta potência geralmente são 220V
  if (tipo === 'tue') {
    return (rede === 'Monofásico') ? 127 : 220;
  }
  // Iluminação e TUGs: 127V (monofásico/bifásico) ou 127V (trifásico F-N)
  return 127;
}

/* ---------- Tipos de resultado ---------- */

export interface CircuitoCalc {
  nome: string;
  tipo: 'iluminacao' | 'tug' | 'tue';
  potenciaW: number;
  tensaoV: number;
  correnteA: number;
  bitolaMM2: number;
  disjuntorA: number;
  comprimentoM: number;
  eletrodutoDN: number;
  nCondutores: number;
  comodo?: string;
}

export interface QuadroGeral {
  disjuntorGeralA: number;
  nCircuitos: number;
  cargaTotalW: number;
  correnteTotalA: number;
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

  /* ----- Circuitos por cômodo ----- */
  for (const r of state.rooms ?? []) {
    const area = num(r.c) * num(r.l);
    const distQuadro = routeLen(r, state.rooms);
    const nTomadas = countMods(r, 'T');
    const nLuzes = r.luzes?.length ?? 0;
    const roomName = r.nome || r.base || 'Cômodo';

    /* Circuito de iluminação */
    if (nLuzes > 0) {
      const potIlum = potenciaIluminacao(area);
      const tensao = 127;
      const calc = bitolaCircuito(potIlum, tensao, distQuadro, 'iluminacao', 2);
      const nCond = nCondutoresCircuito('iluminacao', rede);
      circuitos.push({
        nome: `Iluminação — ${roomName}`,
        tipo: 'iluminacao',
        potenciaW: potIlum,
        tensaoV: tensao,
        correnteA: calc.corrente,
        bitolaMM2: calc.secao,
        disjuntorA: disjuntor(calc.corrente, calc.secao),
        comprimentoM: distQuadro,
        eletrodutoDN: eletrodutoDN(calc.secao, nCond),
        nCondutores: nCond,
        comodo: roomName,
      });
    }

    /* Circuito de TUGs */
    if (nTomadas > 0) {
      const potTug = potenciaTUG(nTomadas, r.base || roomName);
      const tensao = 127;
      const calc = bitolaCircuito(potTug, tensao, distQuadro, 'tug', 2);
      const nCond = nCondutoresCircuito('tug', rede);
      circuitos.push({
        nome: `Tomadas (TUG) — ${roomName}`,
        tipo: 'tug',
        potenciaW: potTug,
        tensaoV: tensao,
        correnteA: calc.corrente,
        bitolaMM2: calc.secao,
        disjuntorA: disjuntor(calc.corrente, calc.secao),
        comprimentoM: distQuadro,
        eletrodutoDN: eletrodutoDN(calc.secao, nCond),
        nCondutores: nCond,
        comodo: roomName,
      });
    }
  }

  /* ----- Circuitos de equipamentos (TUEs) ----- */
  for (const eq of state.equips ?? []) {
    if (!eq.tipo || !eq.pot) continue;
    const room = (state.rooms ?? []).find(r => r.id === eq.room);
    const eqName = eq.tipo;
    const potW = num(eq.pot);
    const tensao = eq.tens === '127V' ? 127 : eq.tens === '220V' ? 220 : tensaoCircuito(rede, 'tue');

    // Distância: direta ou estimada pela rota do cômodo + dint
    let dist = num(eq.dist);
    if (dist <= 0 && room) {
      dist = routeLen(room, state.rooms) + num(eq.dint);
    }
    if (dist <= 0) dist = 10; // fallback

    const condCarr: 2 | 3 = tensao > 200 && (rede === 'Trifásico') ? 3 : 2;
    const calc = bitolaCircuito(potW, tensao, dist, 'tue', condCarr);
    const nCond = nCondutoresCircuito('tue', rede);

    circuitos.push({
      nome: `${eqName}${room ? ` — ${room.nome || room.base}` : ''}`,
      tipo: 'tue',
      potenciaW: potW,
      tensaoV: tensao,
      correnteA: calc.corrente,
      bitolaMM2: calc.secao,
      disjuntorA: disjuntor(calc.corrente, calc.secao),
      comprimentoM: dist,
      eletrodutoDN: eletrodutoDN(calc.secao, nCond),
      nCondutores: nCond,
      comodo: room ? (room.nome || room.base) : undefined,
    });
  }

  /* ----- Quadro geral ----- */
  const cargaTotal = circuitos.reduce((s, c) => s + c.potenciaW, 0);
  const correnteTotal = circuitos.reduce((s, c) => s + c.correnteA, 0);
  const djGeral = disjuntorGeral(correnteTotal, rede);

  const quadro: QuadroGeral = {
    disjuntorGeralA: djGeral,
    nCircuitos: circuitos.length,
    cargaTotalW: Math.round(cargaTotal),
    correnteTotalA: Math.round(correnteTotal * 100) / 100,
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
    const fases = temTerra ? n - 2 : 1;
    if (!temTerra) bitolasSemTerra.add(c.bitolaMM2);
    for (let f = 0; f < fases; f++) somarFio(c.bitolaMM2, CORES_FASE[f], c.comprimentoM);
    somarFio(c.bitolaMM2, 'Azul claro', c.comprimentoM);
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

  // Eletroduto rígido por DN: metragem, tubos de 3 m, luvas de emenda, curvas 90° e luvas das curvas
  const eletroPorDN: Record<number, number> = {};
  const circuitosPorDN: Record<number, number> = {};
  for (const c of circuitos) {
    eletroPorDN[c.eletrodutoDN] = (eletroPorDN[c.eletrodutoDN] ?? 0) + c.comprimentoM;
    circuitosPorDN[c.eletrodutoDN] = (circuitosPorDN[c.eletrodutoDN] ?? 0) + 1;
  }
  for (const dn of Object.keys(eletroPorDN).map(Number).sort((a, b) => a - b)) {
    const metrosFolga = eletroPorDN[dn] * 1.1; // 10% de folga
    const tubos = Math.ceil(metrosFolga / 3);
    const curvas = circuitosPorDN[dn] * 2; // saída do quadro + chegada no cômodo
    materiais.push({ item: `Eletroduto PVC rígido ${dn}mm`, qtd: Math.ceil(metrosFolga), unidade: 'm', detalhe: 'Rígido rosqueável, trecho(s) de 3 m' });
    materiais.push({ item: `Tubo eletroduto ${dn}mm (3 m)`, qtd: tubos, unidade: 'pç', detalhe: 'Trecho unitário' });
    materiais.push({ item: `Luva de emenda ${dn}mm`, qtd: Math.max(0, tubos - 1), unidade: 'un', detalhe: 'Rosqueável, PVC rígido' });
    materiais.push({ item: `Curva 90° eletroduto ${dn}mm`, qtd: curvas, unidade: 'un', detalhe: 'PVC rígido com luva' });
    materiais.push({ item: `Luva de rosca ${dn}mm (curva)`, qtd: curvas * 2, unidade: 'un', detalhe: 'Para fixação das curvas 90°' });
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

  // Disjuntor geral
  const polosGeral = rede === 'Trifásico' ? 'tripolar' : rede === 'Bifásico' ? 'bipolar' : 'monopolar';
  materiais.push({
    item: `Disjuntor geral ${djGeral}A`,
    qtd: 1,
    unidade: 'un',
    detalhe: `Curva C, ${polosGeral}`,
  });

  // Quadro de distribuição
  const nDJ = circuitos.length + 1; // +1 para o geral
  const tamQuadro = nDJ <= 8 ? 8 : nDJ <= 12 ? 12 : nDJ <= 18 ? 18 : nDJ <= 24 ? 24 : 36;
  materiais.push({
    item: `Quadro de distribuição ${tamQuadro} disjuntores`,
    qtd: 1,
    unidade: 'un',
    detalhe: `Embutir ou sobrepor, com barramento e tampa`,
  });

  // Caixas
  let cx4x2 = 0, cx4x4 = 0, cxRedonda = 0;
  for (const r of state.rooms ?? []) {
    for (const p of r.pontos ?? []) {
      if (p.cx === '4x4') cx4x4++; else cx4x2++;
    }
    for (const l of r.luzes ?? []) {
      if (l.cx === '4x4') cx4x4++;
      else if (l.cx === 'Redonda') cxRedonda++;
      else cx4x2++;
    }
    for (const cmd of r.comandos ?? []) {
      for (const sw of cmd.sws ?? []) {
        if (sw.cx === '4x4') cx4x4++; else cx4x2++;
      }
    }
    for (const cx of r.caixas ?? []) {
      if (cx.tipo === '4x4') cx4x4++;
      else if (cx.tipo === 'Redonda') cxRedonda++;
      else cx4x2++;
    }
  }
  if (cx4x2 > 0) materiais.push({ item: 'Caixa 4x2', qtd: cx4x2, unidade: 'un' });
  if (cx4x4 > 0) materiais.push({ item: 'Caixa 4x4', qtd: cx4x4, unidade: 'un' });
  if (cxRedonda > 0) materiais.push({ item: 'Caixa redonda (fundo)', qtd: cxRedonda, unidade: 'un' });

  // Placas
  if (cx4x2 > 0) materiais.push({ item: 'Placa 4x2', qtd: cx4x2, unidade: 'un', detalhe: 'Com espelho' });
  if (cx4x4 > 0) materiais.push({ item: 'Placa 4x4', qtd: cx4x4, unidade: 'un', detalhe: 'Com espelho' });

  // Conectores / emendas
  const totalConexoes = circuitos.length * 4; // estimativa
  materiais.push({ item: 'Conector de emenda (tipo Wago ou similar)', qtd: totalConexoes, unidade: 'un' });

  // Fita isolante
  materiais.push({ item: 'Fita isolante', qtd: Math.max(2, Math.ceil(circuitos.length / 3)), unidade: 'rolo' });

  // Abraçadeiras
  const totalEletroduto = Object.values(eletroPorDN).reduce((a, b) => a + Number(b), 0);
  materiais.push({ item: 'Abraçadeira para eletroduto', qtd: Math.ceil(totalEletroduto / 0.6), unidade: 'un', detalhe: 'A cada 60 cm' });

  return { circuitos, quadro, materiais };
}
