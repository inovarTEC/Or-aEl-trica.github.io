/* ===== OrçaElétrica — Tipos do modelo de dados ===== */

export type TipoImovel = 'Casa' | 'Apartamento' | 'Comércio pequeno' | '';
export type TipoObra = 'Construção nova' | 'Reforma' | 'Ampliação' | '';
export type TipoCobertura = 'Laje' | 'Forro de gesso' | 'Telhado aparente' | 'Não sei' | '';
export type TipoRede = 'Monofásico' | 'Bifásico' | 'Trifásico' | 'Não sei' | '';
export type AlturaP = 'baixa' | 'media' | 'alta';
export type TipoCaixa = '4x2' | '4x4' | 'Redonda';
/** D = dupla (2 tomadas físicas), T = tripla (3 tomadas físicas). */
export type TipoModulo = 'T10' | 'T10D' | 'T10T' | 'T20' | 'T20D' | 'T20T' | 'USB';
export type TipoInstalacao = 'Embutida na parede' | 'Aparente' | 'Pela laje' | '';
/** Material usado quando a instalação do cômodo é aparente (sobrepor). */
export type MaterialAparente = 'canaleta' | 'eletroduto_metro' | 'eletroduto_peca3m';
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
  /** Tomada simples 10A na mesma placa do interruptor (opcional; ausente = false). */
  comTomada?: boolean;
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
  /** Só vale quando inst === 'Aparente'. Ausente = canaleta (orçamentos antigos). */
  materialAparente?: MaterialAparente;
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
  /** Caixa do ponto do equipamento (opcional — orçamentos antigos não têm). */
  cx?: '4x2' | '4x4';
  /** O que vai na caixa: tomada 20A, tomada 20A dupla, borne/conector ou só tampa (ligação direta). */
  ponto?: 'T20' | 'T20D' | 'borne' | 'tampa' | 'emenda';
}

export type TipoEntrada = 'aerea' | 'subterranea' | 'parede';
export type SistemaAlimentacao = 'monofasico' | 'bifasico' | 'trifasico';
export type BitolaCabo = '6' | '10' | '16';
export type DiametroEletroduto = '3/4' | '1' | '1-1/4';
export type TipoEletroduto = 'rigido' | 'flexivel';
export type TipoPoste = '6m' | '7m' | 'nao-tem';
/** Como o eletroduto do alimentador é comprado: em metros ou em barras de 3 m. */
export type UnidadeEletroduto = 'metro' | 'peca3m';

/** Entrada / alimentador principal (Etapa 7). Campos numéricos ficam como string, como no resto do wizard. */
export interface EntradaPrincipal {
  tipoEntrada: TipoEntrada;
  poste: TipoPoste;
  sistema: SistemaAlimentacao;
  sistemaManual: boolean;
  bitola: BitolaCabo;
  bitolaManual: boolean;
  diametroEletroduto: DiametroEletroduto;
  diametroManual: boolean;
  tipoEletroduto: TipoEletroduto;
  /** Opcional (orçamentos antigos não têm). Ausente = metro. */
  unidadeEletroduto?: UnidadeEletroduto;
  percurso: string;
  tensao: string;
  potenciaDemandada: string;
  obs: string;
  /** Incluir a entrada no orçamento/PDF (ausente = true). */
  incluirNoPdf?: boolean;
}

/** Aterramento principal da casa (Etapa 8). */
export interface AterramentoPrincipal {
  nHastes: number;
  comprimentoHaste: '2.4';
  nCaixasInspecao: number;
  bitolaCabo: '6' | '10';
  distancia: string;
  obs: string;
  /** Incluir o aterramento no orçamento/PDF (ausente = true). */
  incluirNoPdf?: boolean;
}

export interface AppState {
  id: string;
  imovel: TipoImovel;
  obra: TipoObra;
  cobertura: TipoCobertura;
  rede: TipoRede;
  rooms: Room[];
  equips: Equip[];
  entrada: EntradaPrincipal;
  aterramento: AterramentoPrincipal;
  step: number;
  /** Navegação (não vai ao servidor): cômodo/equipamento a abrir e se veio da prévia. */
  activeRoomId: string;
  activeEquipId: string;
  veioDaPrevia: boolean;
}

/** Só os campos que alimentam o cálculo (é o que vai ao servidor). */
export type DadosOrcamento = Pick<AppState, 'imovel' | 'obra' | 'cobertura' | 'rede' | 'rooms' | 'equips'> & {
  /** Opcional: orçamentos antigos e o fluxo do PDF não enviam a entrada. */
  entrada?: EntradaPrincipal;
  aterramento?: AterramentoPrincipal;
};

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
    /** Trajeto do quadro até o cômodo (dq, ou dd + dr quando passa por outro cômodo). */
    distTrajeto: number;
  }[];
}
