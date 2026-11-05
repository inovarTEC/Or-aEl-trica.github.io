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

  // Agrupar fios por bitola
  const fiosPorBitola: Record<number, number> = {};
  for (const c of circuitos) {
    const metragem = c.comprimentoM * c.nCondutores;
    fiosPorBitola[c.bitolaMM2] = (fiosPorBitola[c.bitolaMM2] ?? 0) + metragem;
  }
  for (const [bitola, metros] of Object.entries(fiosPorBitola)) {
    materiais.push({
      item: `Cabo flexível ${bitola} mm²`,
      qtd: Math.ceil(Number(metros) * 1.15), // 15% de folga
      unidade: 'm',
      detalhe: `Cobre, isolação PVC 750V`,
    });
  }

  // Eletroduto por bitola mais comum
  const eletroPorDN: Record<number, number> = {};
  for (const c of circuitos) {
    eletroPorDN[c.eletrodutoDN] = (eletroPorDN[c.eletrodutoDN] ?? 0) + c.comprimentoM;
  }
  for (const [dn, metros] of Object.entries(eletroPorDN)) {
    materiais.push({
      item: `Eletroduto PVC ${dn} mm`,
      qtd: Math.ceil(Number(metros) * 1.1), // 10% de folga
      unidade: 'm',
      detalhe: 'Rígido ou corrugado, conforme instalação',
    });
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
