/* ===== Motor de cálculo de materiais (NBR 5410) ===== */
import { AppState, Comando, Room } from '../types';
import { countMods } from './calculator';
import { tomadasFisicas, gruposTeclas } from '../nbr5410-regras';
export { gruposTeclas };
import { materiaisEntrada } from '../entrada-calc';
import { materiaisAterramento } from '../aterramento-calc';
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
  /** Tipo de instalação escolhido no cômodo (define eletroduto corrugado x canaleta). */
  instalacao?: string;
  /** Material da instalação aparente do cômodo (canaleta / eletroduto em metros / barras de 3 m). */
  materialAparente?: string;
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
        instalacao: r.inst || '',
        materialAparente: r.materialAparente,
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
        instalacao: r.inst || '',
        materialAparente: r.materialAparente,
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
      instalacao: room?.inst || '',
      materialAparente: room?.materialAparente,
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

  // Disjuntor geral: um só. Se a etapa Entrada foi preenchida, vale o da entrada (lançado abaixo).
  const polosGeral = rede === 'Trifásico' ? 'tripolar' : rede === 'Bifásico' ? 'bipolar' : 'monopolar';
  const temEntrada = !!state.entrada?.tipoEntrada && state.entrada?.incluirNoPdf !== false;
  if (!temEntrada) {
    materiais.push({
      item: `Disjuntor geral ${djGeral}A`,
      qtd: 1,
      unidade: 'un',
      detalhe: `Curva C, ${polosGeral}`,
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

  // Materiais da entrada / alimentador principal
  if (temEntrada && state.entrada && state.entrada.incluirNoPdf !== false) {
    for (const m of materiaisEntrada(state.entrada)) {
      const ehGeral = m.descricao.startsWith('Disjuntor geral');
      materiais.push({
        item: m.descricao,
        qtd: m.qtd,
        unidade: m.unidade,
        detalhe: ehGeral
          ? `Entrada / alimentador principal — curva C, ${polosGeral}; pela carga instalada o mínimo é ${djGeral}A`
          : 'Entrada / alimentador principal',
      });
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
