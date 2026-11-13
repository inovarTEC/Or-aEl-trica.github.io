import { Room, Ponto, Luz, Comando } from './types';

let _uid = 0;
export function uid(): string {
  _uid += 1;
  return `_${Date.now().toString(36)}_${_uid}`;
}

function mkPonto(h: 'baixa' | 'media' | 'alta', mods: { t: 'T10' | 'T10D' | 'T20' | 'T20D' | 'USB' }[]): Ponto {
  return {
    id: uid(),
    h,
    d: '',
    cx: '4x2',
    mods: mods.map(m => ({ id: uid(), t: m.t })),
  };
}

function mkLuz(): Luz {
  return { id: uid(), d: '', cx: 'Redonda' };
}

function mkComandoSimples(luzIds: string[]): Comando {
  return {
    id: uid(),
    t: 'IS',
    luzes: luzIds,
    sws: [{ id: uid(), h: 'media', d: '', tom: '', cx: '4x2' }],
  };
}

/**
 * Distância padrão entre pontos (m) por tipo de cômodo:
 * cozinha/copa/serviço/lavanderia/banheiro 3 · garagem/varanda/terraço/subsolo 5 ·
 * sala, quarto, suíte e demais 5 (padrão).
 */
export function dpadPorTipo(tipo: string): string {
  const t = (tipo ?? '').toLowerCase();
  if (/cozinha|copa|servi|lavanderia|banheiro|lavabo/.test(t)) return '3';
  if (/garagem|varanda|terra[cç]o|subsolo/.test(t)) return '5';
  return '5';
}

/**
 * Tomada padrão de um ponto novo: simples (T10) em banheiro/lavabo, área de serviço/lavanderia
 * e garagem; dupla (T10D) nos demais cômodos e quando o tipo não é identificado.
 */
export function tomadaPadrao(tipo: string): 'T10' | 'T10D' {
  const t = (tipo ?? '').toLowerCase();
  return /banheiro|lavabo|servi|lavanderia|garagem/.test(t) ? 'T10' : 'T10D';
}

function emptyRoom(base: string, nome: string): Room {
  return {
    id: uid(), base, nome,
    c: '', l: '',
    medE: false,
    via: '', dq: '', dd: '', dr: '',
    dqE: false, ddE: false, drE: false,
    dpad: dpadPorTipo(`${base} ${nome}`), dpadE: true,
    pontos: [], luzes: [], comandos: [], caixas: [],
    luzAuto: true, inst: 'Embutida na parede', pe: '2.8', obs: '',
  };
}

export interface RoomTemplate {
  label: string;
  desc: string;
  icon: string;
  create: () => Room;
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    label: 'Quarto típico',
    desc: '3 tomadas duplas, 1 luz, 1 interruptor',
    icon: 'Bed',
    create: () => {
      const r = emptyRoom('Quarto', 'Quarto');
      r.pontos = Array.from({ length: 3 }, () => mkPonto('baixa', [{ t: 'T10D' }]));
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  // Suítes: só o quarto; o banheiro da suíte é adicionado como cômodo separado.
  {
    label: 'Suíte 1 (básica)',
    desc: '2 tomadas duplas, 1 luz, 1 interruptor',
    icon: 'Bed',
    create: () => {
      const r = emptyRoom('Quarto', 'Suíte 1');
      r.pontos = [mkPonto('baixa', [{ t: 'T10D' }]), mkPonto('baixa', [{ t: 'T10D' }])];
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  {
    label: 'Suíte 2 (padrão)',
    desc: '3 tomadas duplas, 1 luz, 1 interruptor',
    icon: 'Bed',
    create: () => {
      const r = emptyRoom('Quarto', 'Suíte 2');
      r.dpad = '4';
      r.pontos = Array.from({ length: 3 }, () => mkPonto('baixa', [{ t: 'T10D' }]));
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  {
    label: 'Suíte 3 (luxo)',
    desc: '4 tomadas duplas, 2 luzes, 1 interruptor',
    icon: 'Bed',
    create: () => {
      const r = emptyRoom('Quarto', 'Suíte 3');
      r.dpad = '4';
      r.pontos = Array.from({ length: 4 }, () => mkPonto('baixa', [{ t: 'T10D' }]));
      const l1 = mkLuz(); const l2 = mkLuz();
      r.luzes = [l1, l2];
      r.comandos = [mkComandoSimples([l1.id, l2.id])]; // as duas luzes no mesmo interruptor
      return r;
    },
  },
  {
    label: 'Sala típica',
    desc: '4 tomadas duplas, 2 luzes, 1 interruptor',
    icon: 'Sofa',
    create: () => {
      const r = emptyRoom('Sala', 'Sala');
      r.pontos = Array.from({ length: 4 }, () => mkPonto('baixa', [{ t: 'T10D' }]));
      const l1 = mkLuz(); const l2 = mkLuz();
      r.luzes = [l1, l2];
      r.comandos = [mkComandoSimples([l1.id, l2.id])];
      return r;
    },
  },
  {
    label: 'Cozinha típica',
    desc: '4 tomadas 10A, 2 tomadas 20A, 1 luz',
    icon: 'CookingPot',
    create: () => {
      const r = emptyRoom('Cozinha', 'Cozinha');
      r.pontos = [
        mkPonto('media', [{ t: 'T10' }]),
        mkPonto('media', [{ t: 'T10' }]),
        mkPonto('media', [{ t: 'T10' }]),
        mkPonto('media', [{ t: 'T20' }]),
      ];
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  {
    label: 'Banheiro típico',
    desc: '1 tomadas, 1 luz, 1 interruptor',
    icon: 'Bath',
    create: () => {
      const r = emptyRoom('Banheiro', 'Banheiro');
      r.pontos = [mkPonto('media', [{ t: 'T10' }])];
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  {
    label: 'Área de serviço',
    desc: '1 tomadas 10A, 1 tomada 20A, 1 luz',
    icon: 'WashingMachine',
    create: () => {
      const r = emptyRoom('Área de serviço', 'Área de serviço');
      r.pontos = [

        mkPonto('media', [{ t: 'T10' }]),
        mkPonto('media', [{ t: 'T20' }]),
      ];
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  {
    label: 'Personalizado',
    desc: 'Cômodo vazio para você configurar',
    icon: 'Plus',
    create: () => emptyRoom('Cômodo', 'Cômodo'),
  },
];


/** Nome sem repetir os já usados: "Quarto", "Quarto 2", "Quarto 3"... */
export function nomeUnico(nome: string, rooms: { nome?: string }[]): string {
  const base = (nome ?? '').trim() || 'Cômodo';
  const usados = new Set(rooms.map((r) => (r?.nome ?? '').trim().toLowerCase()));
  if (!usados.has(base.toLowerCase())) return base;
  let i = 2;
  while (usados.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

/** Cômodo novo a partir de um modelo. Nome único; medidas opcionais (as tomadas automáticas da NBR 5410 entram no addRoom). */
export function novoComodo(tpl: RoomTemplate, rooms: { nome?: string }[], extra?: { nome?: string; c?: string; l?: string }): Room {
  const room = tpl.create();
  room.nome = nomeUnico(extra?.nome?.trim() || room.nome, rooms);
  if (extra?.c) room.c = extra.c;
  if (extra?.l) room.l = extra.l;
  return room;
}
