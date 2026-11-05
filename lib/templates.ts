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

function emptyRoom(base: string, nome: string): Room {
  return {
    id: uid(), base, nome,
    c: '', l: '',
    medE: false,
    via: '', dq: '', dd: '', dr: '',
    dqE: false, ddE: false, drE: false,
    dpad: '1.5', dpadE: true,
    pontos: [], luzes: [], comandos: [], caixas: [],
    luzAuto: true, inst: '', pe: '2.8', obs: '',
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
    desc: '3 tomadas, 1 luz, 1 interruptor',
    icon: 'Bed',
    create: () => {
      const r = emptyRoom('Quarto', 'Quarto');
      r.pontos = [mkPonto('baixa', [{ t: 'T10' }]), mkPonto('baixa', [{ t: 'T10' }]), mkPonto('baixa', [{ t: 'T10' }])];
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  {
    label: 'Sala típica',
    desc: '5 tomadas, 2 luzes, 1 interruptor',
    icon: 'Sofa',
    create: () => {
      const r = emptyRoom('Sala', 'Sala');
      r.pontos = Array.from({ length: 5 }, () => mkPonto('baixa', [{ t: 'T10' }]));
      const l1 = mkLuz(); const l2 = mkLuz();
      r.luzes = [l1, l2];
      r.comandos = [mkComandoSimples([l1.id, l2.id])];
      return r;
    },
  },
  {
    label: 'Cozinha típica',
    desc: '3 tomadas 10A, 2 tomadas 20A, 1 luz',
    icon: 'CookingPot',
    create: () => {
      const r = emptyRoom('Cozinha', 'Cozinha');
      r.pontos = [
        mkPonto('media', [{ t: 'T10' }]),
        mkPonto('media', [{ t: 'T10' }]),
        mkPonto('media', [{ t: 'T10' }]),
        mkPonto('media', [{ t: 'T20' }]),
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
    desc: '2 tomadas, 1 luz, 1 interruptor',
    icon: 'Bath',
    create: () => {
      const r = emptyRoom('Banheiro', 'Banheiro');
      r.pontos = [mkPonto('media', [{ t: 'T10' }]), mkPonto('media', [{ t: 'T10' }])];
      const luz = mkLuz();
      r.luzes = [luz];
      r.comandos = [mkComandoSimples([luz.id])];
      return r;
    },
  },
  {
    label: 'Área de serviço',
    desc: '2 tomadas 10A, 1 tomada 20A, 1 luz',
    icon: 'WashingMachine',
    create: () => {
      const r = emptyRoom('Área de serviço', 'Área de serviço');
      r.pontos = [
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
    label: 'Personalizado',
    desc: 'Cômodo vazio para você configurar',
    icon: 'Plus',
    create: () => emptyRoom('Cômodo', 'Cômodo'),
  },
];
