/* Regras da Etapa 7 — entrada / alimentador principal (usado pelo wizard e pela prévia no servidor). */
import type {
  BitolaCabo, DiametroEletroduto, EntradaPrincipal, SistemaAlimentacao, TipoEletroduto, TipoEntrada,
} from './types';

export const LIMIAR_PERCURSO_AVISO = 30; // metros

export function entradaPadrao(): EntradaPrincipal {
  return {
    tipoEntrada: 'aerea', poste: 'nao-tem', sistema: 'monofasico', sistemaManual: false,
    bitola: '6', bitolaManual: false, diametroEletroduto: '1', diametroManual: false,
    tipoEletroduto: 'rigido', percurso: '', tensao: '220', potenciaDemandada: '', obs: '',
  };
}

/** Sugestão de sistema por potência (simplificada até o fator de demanda NBR 5410:2025 ser implementado). */
export function sugerirSistema(potKw: number): SistemaAlimentacao {
  if (potKw <= 7) return 'monofasico';
  if (potKw <= 14) return 'bifasico';
  return 'trifasico';
}

/** Mínimo 6 mm²; acima de 30 m sugere 10 mm²; acima de 50 m sugere 16 mm². */
export function sugerirBitola(percursoM: number, _sistema: SistemaAlimentacao): BitolaCabo {
  if (percursoM > 50) return '16';
  if (percursoM > LIMIAR_PERCURSO_AVISO) return '10';
  return '6';
}

export function faixaDisjuntor(bitola: BitolaCabo): string {
  if (bitola === '6') return '32–40 A';
  if (bitola === '10') return '40–50 A';
  return '50–63 A';
}

export function sugerirDiametro(sistema: SistemaAlimentacao): DiametroEletroduto {
  return sistema === 'trifasico' ? '1-1/4' : '1';
}

export function tipoEletrodutoPadrao(t: TipoEntrada): TipoEletroduto {
  return t === 'parede' ? 'flexivel' : 'rigido';
}

export function tensaoDoSistema(s: SistemaAlimentacao): string {
  return s === 'trifasico' ? '380' : '220';
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

  // Cabo e disjuntor: reservados ao PDF (a prévia gratuita não mostra bitola nem disjuntor).
  const nCondutores = e.sistema === 'trifasico' ? 5 : 3;
  items.push({ descricao: `Cabo ${e.bitola} mm² isolação 1 kV (alimentador)`, qtd: Math.ceil(percurso * nCondutores * 1.1), unidade: 'm', mostrarNaPrevia: false });
  const sistemaLabel: Record<string, string> = { monofasico: 'Monofásico', bifasico: 'Bifásico', trifasico: 'Trifásico' };
  items.push({ descricao: `Disjuntor geral ${faixaDisjuntor(e.bitola)} (${sistemaLabel[e.sistema] ?? e.sistema})`, qtd: 1, unidade: 'un', mostrarNaPrevia: false });

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
