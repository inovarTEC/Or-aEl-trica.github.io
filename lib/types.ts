/* ===== OrçaElétrica — Tipos do modelo de dados ===== */

export type TipoImovel = 'Casa' | 'Apartamento' | 'Comércio pequeno' | '';
export type TipoObra = 'Construção nova' | 'Reforma' | 'Ampliação' | '';
export type TipoCobertura = 'Laje' | 'Forro de gesso' | 'Telhado aparente' | 'Não sei' | '';
export type TipoRede = 'Monofásico' | 'Bifásico' | 'Trifásico' | 'Não sei' | '';
export type AlturaP = 'baixa' | 'media' | 'alta';
export type TipoCaixa = '4x2' | '4x4' | 'Redonda';
export type TipoModulo = 'T10' | 'T10D' | 'T20' | 'T20D' | 'USB';
export type TipoInstalacao = 'Embutida na parede' | 'Aparente' | 'Pela laje' | '';
export type TipoComando = 'IS' | 'IP' | 'II';
export type TipoCaixaPass = 'Redonda' | '4x4' | '4x2';
export type TipoEquip = 
  | 'Chuveiro elétrico' | 'Torneira elétrica' | 'Ar-condicionado'
  | 'Forno elétrico' | 'Cooktop elétrico' | 'Máquina de lavar'
  | 'Secadora' | 'Aquecedor' | 'Bomba' | 'Carregador de veículo elétrico' | 'Outro' | '';
export type Tensao = '127V' | '220V' | '';

export interface Modulo {
  id: string;
  t: TipoModulo;
}

export interface Ponto {
  id: string;
  h: AlturaP;
  d: string; // distância do anterior — vazio = padrão
  cx: '4x2' | '4x4';
  mods: Modulo[];
}

export interface Luz {
  id: string;
  d: string; // distância
  cx: TipoCaixa;
}

export interface Sw {
  id: string;
  h: AlturaP;
  d: string;
  tom: TipoModulo | '';
  cx: '4x2' | '4x4';
}

export interface Comando {
  id: string;
  t: TipoComando;
  luzes: string[]; // ids de Luz
  sws: Sw[];
}

export interface CaixaPassagem {
  id: string;
  tipo: TipoCaixaPass;
  inst: 'Embutida' | 'Sobreposta';
  s: boolean; // sugerida
}

export interface Room {
  id: string;
  base: string;
  nome: string;
  c: string; // comprimento
  l: string; // largura
  medE: boolean;
  via: string; // id de outro cômodo (rota compartilhada)
  dq: string; // dist direta ao quadro
  dd: string; // dist até onde se separam
  dr: string; // dist do split ao cômodo
  dqE: boolean;
  ddE: boolean;
  drE: boolean;
  dpad: string; // dist padrão entre pontos
  dpadE: boolean;
  pontos: Ponto[];
  luzes: Luz[];
  comandos: Comando[];
  caixas: CaixaPassagem[];
  luzAuto: boolean;
  inst: TipoInstalacao;
  pe: string; // pé-direito
  obs: string;
}

export interface Equip {
  id: string;
  tipo: TipoEquip;
  room: string; // id do cômodo
  pot: string; // potência W
  tens: Tensao;
  dint: string; // dist dentro do cômodo
  dist: string; // dist direta ao quadro
  alim: 'Unidade externa' | 'Unidade interna' | '';
}

/** Orçamento pago que está sendo editado (edição gratuita dentro do prazo). Só existe no navegador. */
export interface EdicaoAtiva {
  codigo: string;
  email: string;
  expiraEm: string;
  restantes: number;
}

export interface AppState {
  id: string;
  imovel: TipoImovel;
  obra: TipoObra;
  cobertura: TipoCobertura;
  rede: TipoRede;
  rooms: Room[];
  equips: Equip[];
  step: number;
  edicao?: EdicaoAtiva | null;
}

/** Só os campos que alimentam o cálculo (é o que vai ao servidor). */
export type DadosOrcamento = Pick<AppState, 'imovel' | 'obra' | 'cobertura' | 'rede' | 'rooms' | 'equips'>;

export interface Pendencia {
  tipo: 'erro' | 'aviso' | 'info';
  msg: string;
  step: number;
  roomId?: string;
  equipId?: string;
}

export interface Totais {
  totalCaixas: number;
  totalTomadas: number;
  totalInterruptores: number;
  totalUsb: number;
  totalLuzes: number;
  distEletroduto: number;
  distTrunk: number;
  porComodo: {
    roomId: string;
    nome: string;
    caixas: number;
    tomadas: number;
    interruptores: number;
    luzes: number;
    distInterna: number;
  }[];
}
