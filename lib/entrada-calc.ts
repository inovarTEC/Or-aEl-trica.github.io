/* Regras da Etapa 7 — entrada / alimentador principal (usado pelo wizard e pela prévia no servidor). */
import type {
  DiametroEletroduto, EntradaPrincipal, SistemaAlimentacao, TipoEletroduto, TipoEntrada,
} from './types';
import { bitolaEntrada, categoriaDisNor, sistemaSugeridoUf } from './tensao-por-uf';

export const LIMIAR_PERCURSO_AVISO = 30; // metros

export function entradaPadrao(): EntradaPrincipal {
  return {
    tipoEntrada: 'aerea', poste: 'nao-tem', sistema: 'monofasico', sistemaManual: false,
    bitola: '6', bitolaManual: false, diametroEletroduto: '1', diametroManual: false,
    tipoEletroduto: 'rigido', percurso: '', tensao: '220', potenciaDemandada: '', potenciaManual: false, obs: '',
  };
}

/* Sistema, bitola e disjuntor da entrada: motor DIS-NOR-030 em lib/tensao-por-uf (sistemaSugeridoUf, categoriaDisNor, bitolaEntrada). */

export function sugerirDiametro(sistema: SistemaAlimentacao): DiametroEletroduto {
  return sistema === 'trifasico' ? '1-1/4' : '1';
}

export function tipoEletrodutoPadrao(t: TipoEntrada): TipoEletroduto {
  return t === 'parede' ? 'flexivel' : 'rigido';
}

/** Tensão de referência do sistema: em 380/220 V o trifásico é 380 V; em 220/127 V a tensão entre fases é 220 V. */
export function tensaoDoSistema(s: SistemaAlimentacao, sistemaTensao?: string): string {
  if (sistemaTensao === '220/127') return s === 'monofasico' ? '127' : '220';
  return s === 'trifasico' ? '380' : '220';
}

/**
 * Sugestões automáticas da entrada (sistema, bitola, diâmetro): só mexem nos campos que a pessoa
 * não sobrescreveu. A potência estimada é usada como carga instalada e demanda.
 * Função pura: devolve só o que mudou (vazio = nada a fazer).
 */
export function sugestoesEntrada(e: EntradaPrincipal): Partial<EntradaPrincipal> {
  const patch: Partial<EntradaPrincipal> = {};
  const potKw = parseFloat(e.potenciaDemandada) || 0;
  const percurso = parseFloat(e.percurso) || 0;
  const vs = e.sistemaTensao === '220/127' || e.sistemaTensao === '380/220' ? e.sistemaTensao : undefined;
  const sugerido = sistemaSugeridoUf(vs ?? '220/127', potKw);
  const sistema = e.sistemaManual || potKw <= 0 ? e.sistema : sugerido;
  if (sistema !== e.sistema) { patch.sistema = sistema; patch.tensao = tensaoDoSistema(sistema, vs); }
  if (!e.bitolaManual) {
    const cat = potKw > 0 ? categoriaDisNor(potKw, potKw, vs ?? '220/127', sistema) : null;
    const b = bitolaEntrada(cat?.secaoCu ?? 6, percurso);
    if (b !== e.bitola) patch.bitola = b;
  }
  if (!e.diametroManual) {
    const d = sugerirDiametro(sistema);
    if (d !== e.diametroEletroduto) patch.diametroEletroduto = d;
  }
  return patch;
}

/** Potência (kVA) como texto do campo: sem demanda = vazio. */
export const textoPotencia = (demandaKva: number | null | undefined): string =>
  demandaKva && demandaKva > 0 ? String(Math.round(demandaKva * 100) / 100) : '';

/**
 * Sincroniza a entrada com a demanda calculada (padrão de entrada): se a pessoa não editou a potência,
 * ela acompanha a demanda (some quando não há mais carga) e sistema/bitola/diâmetro se ajustam junto.
 * `demandaKva` null = não há cômodo nem equipamento. Devolve só o que mudou.
 */
export function sincronizarEntrada(e: EntradaPrincipal, demandaKva: number | null): Partial<EntradaPrincipal> {
  const patch: Partial<EntradaPrincipal> = {};
  if (!e.potenciaManual) {
    const alvo = textoPotencia(demandaKva);
    if (alvo !== (e.potenciaDemandada ?? '')) patch.potenciaDemandada = alvo;
  }
  const depois: EntradaPrincipal = { ...e, ...patch };
  return { ...patch, ...sugestoesEntrada(depois) };
}

export interface MaterialEntrada {
  descricao: string;
  qtd: number;
  unidade: string;
  mostrarNaPrevia: boolean; // false = reservado ao PDF
}

function acessoriosPoste(tubos: number): MaterialEntrada[] {
  return [
    { descricao: 'Tubo eletroduto (3 m) para poste', qtd: tubos, unidade: 'un', mostrarNaPrevia: true },
    { descricao: 'Curva 90° para eletroduto', qtd: 1, unidade: 'un', mostrarNaPrevia: true },
    { descricao: 'Curva 180° para eletroduto', qtd: 1, unidade: 'un', mostrarNaPrevia: true },
    { descricao: 'Luva de rosca para eletroduto', qtd: 4, unidade: 'un', mostrarNaPrevia: true },
    { descricao: 'Abraçadeira de aço para eletroduto no poste', qtd: 1, unidade: 'un', mostrarNaPrevia: true },
  ];
}

export function materiaisEntrada(e: EntradaPrincipal): MaterialEntrada[] {
  const items: MaterialEntrada[] = [];
  const percurso = parseFloat(e.percurso) || 0;

  if (e.poste === '6m') items.push(...acessoriosPoste(2));
  if (e.poste === '7m') items.push(...acessoriosPoste(3));

  // Eletroduto do percurso (só quando não é aérea); a descrição segue o tipo escolhido.
  if (e.tipoEntrada !== 'aerea' && percurso > 0) {
    const descTipo = e.tipoEletroduto === 'rigido' ? 'Eletroduto rígido' : 'Eletroduto flexível corrugado';
    const diam = e.diametroEletroduto;
    if (e.unidadeEletroduto === 'peca3m') {
      const barras = Math.ceil(percurso * 1.1 / 3);
      items.push({ descricao: `${descTipo} ${diam}" (barra 3 m) para alimentador`, qtd: barras, unidade: barras === 1 ? 'barra' : 'barras', mostrarNaPrevia: true });
      items.push({ descricao: `Luva ${diam}"`, qtd: Math.max(0, barras - 1), unidade: 'un', mostrarNaPrevia: true });
      items.push({ descricao: `Curva 90° ${diam}"`, qtd: 2, unidade: 'un', mostrarNaPrevia: true });
    } else {
      items.push({ descricao: `${descTipo} ${diam}" para alimentador`, qtd: Math.ceil(percurso * 1.1), unidade: 'm', mostrarNaPrevia: true });
    }
    items.push({ descricao: `Kit fita/fixação eletroduto ${diam}"`, qtd: 1, unidade: 'kit', mostrarNaPrevia: true });
  }

  // Cabo: reservado ao PDF (a prévia gratuita não mostra bitola nem disjuntor).
  const nCondutores = e.sistema === 'trifasico' ? 5 : 3;
  items.push({ descricao: `Cabo ${e.bitola} mm² isolação 1 kV (alimentador)`, qtd: Math.ceil(percurso * nCondutores * 1.1), unidade: 'm', mostrarNaPrevia: false });
  // Disjuntor geral: lançado uma única vez em calc-materiais, pela categoria de atendimento (DIS-NOR-030).

  const caixaTipo = e.sistema === 'monofasico' ? 'Monofásica' : e.sistema === 'bifasico' ? 'Bifásica' : 'Trifásica';
  items.push({ descricao: `Caixa padrão concessionária ${caixaTipo}`, qtd: 1, unidade: 'un', mostrarNaPrevia: true });

  items.push({ descricao: 'Haste de aterramento 1,5 m', qtd: 1, unidade: 'un', mostrarNaPrevia: true });
  items.push({ descricao: 'Conector de haste de aterramento', qtd: 1, unidade: 'un', mostrarNaPrevia: true });
  items.push({ descricao: 'Caixa de inspeção de aterramento', qtd: 1, unidade: 'un', mostrarNaPrevia: true });

  return items;
}

export interface AvisoEntrada { tipo: 'aviso' | 'erro'; msg: string }

export function avisosEntrada(e: EntradaPrincipal): AvisoEntrada[] {
  const avisos: AvisoEntrada[] = [];
  const percurso = parseFloat(e.percurso) || 0;
  if (!e.percurso) avisos.push({ tipo: 'aviso', msg: 'Informe o percurso da entrada para calcular os materiais.' });
  if (percurso > LIMIAR_PERCURSO_AVISO && e.bitola === '6' && !e.bitolaManual)
    avisos.push({ tipo: 'aviso', msg: `Percurso de ${percurso} m: considere aumentar a bitola para 10 mm².` });
  if (e.tipoEntrada !== 'aerea' && e.sistema === 'trifasico' && e.diametroEletroduto !== '1-1/4' && !e.diametroManual)
    avisos.push({ tipo: 'aviso', msg: 'Sistema trifásico: diâmetro recomendado é 1¼".' });
  if (e.tipoEntrada === 'subterranea' && e.tipoEletroduto !== 'rigido')
    avisos.push({ tipo: 'aviso', msg: 'Entrada subterrânea requer eletroduto rígido.' });
  if (e.tipoEntrada === 'parede' && e.tipoEletroduto !== 'flexivel')
    avisos.push({ tipo: 'aviso', msg: 'Entrada pela parede recomenda eletroduto flexível corrugado.' });
  return avisos;
}
