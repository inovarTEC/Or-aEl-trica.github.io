/* ===== Template HTML do PDF do Orçamento Elétrico ===== */
import { AppState, Room } from '../types';
import { calcTotais } from './calculator';
import { calcularMateriais, CircuitoCalc, ResultadoCalculo } from './calc-materiais';
import { resolverUnidades } from './circuitos';

import { num, routeLen } from '../util';

/** Escapa texto digitado pelo cliente antes de inserir no HTML (evita XSS no relatório). */
const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const fmtD = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
/** Texto vazio → "—" (já escapado). */
const ouTraco = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? '—' : esc(v));

function tipoLabel(t: string) {
  if (t === 'iluminacao') return 'Iluminação';
  if (t === 'tug') return 'Tomadas (TUG)';
  if (t === 'misto') return 'Iluminação + Tomadas';
  return 'Uso específico (TUE)';
}

/** Tomadas físicas por módulo (dupla = 2, tripla = 3; USB conta 1). */
const TOMADAS_POR_MODULO: Record<string, number> = { T10: 1, T10D: 2, T10T: 3, T20: 1, T20D: 2, T20T: 3, USB: 1 };
function contarTomadas(r: Room): number {
  let n = 0;
  for (const p of r?.pontos ?? []) for (const m of p?.mods ?? []) n += TOMADAS_POR_MODULO[String(m?.t ?? '')] ?? 0;
  return n;
}

const ROTULO_ENTRADA: Record<string, string> = { aerea: 'Aéreo', subterranea: 'Subterrâneo', parede: 'Pela parede' };
const ROTULO_POSTE: Record<string, string> = { '6m': '6 metros', '7m': '7 metros', 'nao-tem': 'Sem poste' };
const ROTULO_SISTEMA: Record<string, string> = { monofasico: 'Monofásico 127/220V', bifasico: 'Bifásico 220V', trifasico: 'Trifásico 380V' };
const ROTULO_ELETRODUTO: Record<string, string> = { rigido: 'rígido', flexivel: 'flexível' };

/** Deixa o texto seguro para nome de arquivo: sem acentos, espaços → hífen, só [A-Za-z0-9-]. */
export function slugArquivo(v: unknown, max = 40): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/** Data de hoje no fuso de Brasília, no formato DD-MM-AAAA. */
function dataArquivo(agora = new Date()): string {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(agora);
  const v = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${v('day')}-${v('month')}-${v('year')}`;
}

/** Nome do cliente/empresa/responsável, se o orçamento tiver algum. */
function nomeCliente(dados: Partial<AppState> & Record<string, any>): string {
  const n = dados?.nomeCliente ?? dados?.nomeEmpresa ?? dados?.nomeResponsavel;
  return typeof n === 'string' ? n.trim() : '';
}

/**
 * Título único do relatório (o navegador usa como nome sugerido ao "Salvar como PDF").
 * Nome do cliente (se houver) + data. Ex.: Orcamento-Joao-Silva-05-11-2026 ou Orcamento-05-11-2026
 */
function tituloPdf(dados: Partial<AppState> & Record<string, any>, agora?: Date): string {
  const nome = slugArquivo(dados?.nomeCliente ?? dados?.nomeEmpresa ?? dados?.nomeResponsavel);
  return ['Orcamento', nome, dataArquivo(agora)].filter(Boolean).join('-');
}

/** Tipo de ligação com a tensão nominal usual da concessionária. */
function redeComTensao(rede: string | undefined): string {
  if (rede === 'Monofásico') return 'Monofásico — 127/220V';
  if (rede === 'Bifásico') return 'Bifásico — 220V';
  if (rede === 'Trifásico') return 'Trifásico — 380V';
  return rede || 'Não informado';
}

export function gerarHtmlPdf(dados: AppState): string {
  const totais = calcTotais(dados);
  const resultado: ResultadoCalculo = calcularMateriais(dados);
  const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  const cliente = nomeCliente(dados as AppState & Record<string, any>);

  /* Divisão de circuitos escolhida: o PDF diz o que foi juntado e repete os avisos (a juntada é escolha do cliente, não da norma). */
  const ROTULO_MODO: Record<string, string> = {
    economico: 'econômico (iluminação e tomadas no mesmo disjuntor, por cômodo)',
    maximo: 'mais econômico (também junta cômodos vizinhos)',
    manual: 'ajuste manual',
  };
  const divisao = resolverUnidades(dados.rooms ?? [], dados.circuitos);
  const modoCirc = dados.circuitos?.modo ?? 'norma';
  const juntados = divisao.unidades.filter((u) => u.rooms.length > 1 || u.unico);
  const circuitosObsHtml = modoCirc === 'norma' && juntados.length === 0 ? '' : `
    <li>Divisão de circuitos: ${esc(ROTULO_MODO[modoCirc] ?? modoCirc)}. ${juntados.length === 0 ? 'Nenhum circuito foi juntado.' : 'Circuitos juntados: ' + juntados.map((u) => {
      const nomes = u.rooms.map((r) => r.nome || r.base || 'Cômodo').join(' + ');
      return esc(`${nomes} (${u.unico ? 'iluminação e tomadas no mesmo disjuntor' : 'iluminação juntas e tomadas juntas'})`);
    }).join('; ') + '.'} Juntar circuitos é escolha do cliente para reduzir disjuntores e cabo: o padrão da NBR 5410 é separar iluminação e tomadas — confirme com o profissional responsável.</li>
    ${divisao.avisos.map((a) => `<li>Circuitos: ${esc(a)}</li>`).join('')}`;

  const circuitosHtml = resultado.circuitos.map((c: CircuitoCalc, i: number) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(c.nome)}</td>
      <td>${tipoLabel(c.tipo)}</td>
      <td class="r">${fmt(c.potenciaW)}</td>
      <td class="r">${c.tensaoV}</td>
      <td class="r">${fmtD(c.correnteA)}</td>
      <td class="r">${c.bitolaMM2}</td>
      <td class="r">${c.disjuntorA}</td>
      <td class="r">${c.eletrodutoDN}</td>
      <td class="r">${fmt(c.comprimentoM)}</td>
    </tr>
  `).join('');

  const materiaisHtml = resultado.materiais.map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(m.item)}</td>
      <td class="r">${m.qtd}</td>
      <td>${m.unidade}</td>
      <td>${esc(m.detalhe || '—')}</td>
    </tr>
  `).join('');

  const comodosHtml = (totais.porComodo ?? []).map(c => `
    <tr>
      <td>${esc(c.nome)}</td>
      <td class="r">${c.caixas}</td>
      <td class="r">${c.tomadas}</td>
      <td class="r">${c.interruptores}</td>
      <td class="r">${c.luzes}</td>
      <td class="r">${c.distInterna}</td>
    </tr>
  `).join('');

  /* ---------- Especificações por cômodo ---------- */
  const rooms = dados.rooms ?? [];
  const ROTULO_MAT_APARENTE: Record<string, string> = {
    canaleta: 'canaleta (barras de 2 m)',
    eletroduto_metro: 'eletroduto rígido (metros)',
    eletroduto_peca3m: 'eletroduto rígido (barras de 3 m)',
  };
  const especHtml = `
    <div class="section">
      <h2>Especificações por Cômodo</h2>
      ${rooms.length === 0 ? '<p class="aviso-box">Nenhum cômodo informado.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Cômodo</th>
            <th>Dimensões</th>
            <th class="r">Pé-direito</th>
            <th>Instalação</th>
            <th class="r">Tomadas</th>
            <th class="r">Luzes</th>
            <th class="r">Interruptores</th>
          </tr>
        </thead>
        <tbody>
          ${rooms.map(r => `
            <tr>
              <td>${esc(r.nome || r.base || 'Cômodo')}</td>
              <td>${num(r.c) > 0 && num(r.l) > 0 ? `C: ${fmtD(num(r.c))}m × L: ${fmtD(num(r.l))}m` : '—'}</td>
              <td class="r">${num(r.pe) > 0 ? `${fmtD(num(r.pe))} m` : '—'}</td>
              <td>${r.inst === 'Aparente' ? `Aparente (sobrepor) — ${esc(ROTULO_MAT_APARENTE[r.materialAparente ?? 'canaleta'] ?? 'canaleta')}` : ouTraco(r.inst)}</td>
              <td class="r">${contarTomadas(r)}</td>
              <td class="r">${(r.luzes ?? []).length}</td>
              <td class="r">${(r.comandos ?? []).length}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`}
      <p class="note">Tipo de teto: <strong>${esc(dados.cobertura || 'Não informado')}</strong>.</p>
      <p class="note">* Tipo de luminária (pendente, embutida, lustre, arandela) a definir pelo responsável da obra conforme tipo de teto: ${esc(dados.cobertura || 'não informado')}.</p>
    </div>
  `;

  /* ---------- Equipamentos ---------- */
  const equipHtml = (dados.equips ?? []).length > 0 ? `
    <div class="section">
      <h2>Equipamentos de Uso Específico</h2>
      <table>
        <thead>
          <tr>
            <th>Equipamento</th>
            <th>Cômodo</th>
            <th class="r">Potência (W)</th>
            <th class="r">Tensão (V)</th>
            <th class="r">Dist. quadro (m)</th>
          </tr>
        </thead>
        <tbody>
          ${(dados.equips ?? []).map(eq => {
            const room = rooms.find(r => r.id === eq.room);
            const dist = num(eq.dist) || (room ? routeLen(room) + num(eq.dint) : 0);
            return `
              <tr>
                <td>${esc(eq.tipo || '—')}</td>
                <td>${esc(room ? (room.nome || room.base) : '—')}</td>
                <td class="r">${num(eq.pot)}</td>
                <td class="r">${esc(eq.tens || '—')}</td>
                <td class="r">${fmt(dist)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  /* ---------- Entrada / alimentador ---------- */
  const ent = dados.entrada;
  const entradaHtml = dados.entrada?.incluirNoPdf === false ? '' : `
    <div class="section">
      <h2>Entrada / Alimentador Principal</h2>
      ${ent && ent.tipoEntrada ? `
      <div class="info-grid">
        <div><div class="label">Tipo de entrada</div><div class="value">${esc(ROTULO_ENTRADA[ent.tipoEntrada] ?? ent.tipoEntrada)}</div></div>
        <div><div class="label">Poste</div><div class="value">${esc(ROTULO_POSTE[ent.poste] ?? (ent.poste || '—'))}</div></div>
        <div><div class="label">Sistema elétrico</div><div class="value">${esc(ROTULO_SISTEMA[ent.sistema] ?? (ent.sistema || '—'))}</div></div>
        <div><div class="label">Bitola do cabo</div><div class="value">${ent.bitola ? `${esc(ent.bitola)} mm²` : '—'}</div></div>
        <div><div class="label">Eletroduto</div><div class="value">${ent.diametroEletroduto ? `${esc(ent.diametroEletroduto)}" — ${esc(ROTULO_ELETRODUTO[ent.tipoEletroduto] ?? ent.tipoEletroduto)}${ent.tipoEntrada !== 'aerea' ? (ent.unidadeEletroduto === 'peca3m' ? ' (barras de 3 m)' : ' (em metros)') : ''}` : '—'}</div></div>
        <div><div class="label">Percurso total (m)</div><div class="value">${ouTraco(ent.percurso)}</div></div>
        <div><div class="label">Tensão de fornecimento</div><div class="value">${ent.tensao ? `${esc(ent.tensao)} V` : '—'}</div></div>
        <div class="full"><div class="label">Observações</div><div class="value">${ouTraco(ent.obs)}</div></div>
      </div>` : '<p class="aviso-box">Dados da entrada principal não informados.</p>'}
    </div>
  `;

  /* ---------- Aterramento ---------- */
  const at = dados.aterramento;
  const aterramentoHtml = dados.aterramento?.incluirNoPdf === false ? '' : `
    <div class="section">
      <h2>Sistema de Aterramento</h2>
      ${at && num(at.nHastes) > 0 ? `
      <div class="info-grid">
        <div><div class="label">Número de hastes</div><div class="value">${num(at.nHastes)} haste(s) de ${esc(String(at.comprimentoHaste || '2.4').replace('.', ','))} m</div></div>
        <div><div class="label">Cabo de aterramento</div><div class="value">${at.bitolaCabo ? `${esc(at.bitolaCabo)} mm²` : '—'}</div></div>
        <div><div class="label">Distância</div><div class="value">${at.distancia ? `${esc(at.distancia)} m` : '—'}</div></div>
        <div><div class="label">Caixas de inspeção</div><div class="value">${num(at.nCaixasInspecao)}</div></div>
        <div class="full"><div class="label">Observações</div><div class="value">${ouTraco(at.obs)}</div></div>
      </div>` : '<p class="aviso-box">Dados do aterramento não informados.</p>'}
    </div>
  `;


  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(tituloPdf(dados))}</title>
<style>
  @page { size: A4; margin: 22mm 20mm 32mm 20mm;
    /* Rodapé inteiro (o Chrome só resolve counter(page) em caixas de margem do @page) na margem inferior: repete em todas as páginas e nunca cobre o conteúdo */
    @bottom-center {
      content: "OrçaElétrica — Orçamento de referência  ·  Página " counter(page) " de " counter(pages) "\\A Estimativa baseada na NBR 5410:2004; não substitui projeto de profissional habilitado.";
      white-space: pre; font-family: 'Segoe UI', Arial, sans-serif; font-size: 7.5pt; line-height: 1.5; color: #94a3b8; text-align: center;
      vertical-align: top; padding-top: 4mm; border-top: 2px solid #2563EB; margin-top: 6mm;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.55; padding: 0 6px; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 3px solid #2563EB; padding-bottom: 14px; margin-bottom: 28px; }
  .header h1 { font-size: 22pt; color: #2563EB; font-weight: 800; letter-spacing: -0.5px; }
  .header .sub { font-size: 9pt; color: #64748b; margin-top: 2px; }
  .header .cliente { font-size: 10.5pt; color: #1a1a2e; font-weight: 600; margin-top: 8px; }
  .header .cliente span { font-size: 8pt; color: #64748b; font-weight: 400; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 6px; }
  .header .meta { text-align: right; font-size: 9pt; color: #64748b; white-space: nowrap; }

  /* Sections */
  .section { margin-bottom: 24px; page-break-inside: avoid; }
  .grupo { page-break-before: auto; }
  h2 { font-size: 13pt; color: #2563EB; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 12px; }
  h3 { font-size: 10.5pt; color: #334155; margin: 14px 0 8px; }

  /* Info grid */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin-bottom: 8px; }
  .info-grid .full { grid-column: 1 / -1; }
  .info-grid .label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-grid .value { font-size: 10pt; font-weight: 600; margin-bottom: 4px; }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
  .stat { background: #f1f5f9; border-radius: 8px; padding: 12px 10px; text-align: center; }
  .stat .num { font-size: 18pt; font-weight: 800; color: #2563EB; }
  .stat .lbl { font-size: 7pt; color: #64748b; text-transform: uppercase; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 8px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #f1f5f9; color: #475569; font-weight: 700; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  .r { text-align: right; }
  tbody tr:nth-child(even) { background: #f8fafc; }

  /* Pendencias */
  .pend { list-style: none; padding: 0; }
  .pend li { padding: 5px 10px; margin: 4px 0; border-radius: 4px; font-size: 9pt; }
  .pend li.erro { background: #fef2f2; color: #dc2626; border-left: 3px solid #dc2626; }
  .pend li.aviso { background: #fffbeb; color: #d97706; border-left: 3px solid #d97706; }
  .pend li.info { background: #eff6ff; color: #2563eb; border-left: 3px solid #2563eb; }
  .ok { color: #16a34a; font-weight: 600; padding: 10px 12px; background: #f0fdf4; border-radius: 6px; }
  .aviso-box { font-size: 9pt; color: #92400e; padding: 10px 12px; background: #fffbeb; border-left: 3px solid #d97706; border-radius: 4px; }
  .note { font-size: 8pt; color: #94a3b8; margin: 6px 0 8px; }
  .note strong { color: #475569; }

  /* Rodapé: no navegador fica no fim; na impressão, fixo em cada página */
  .footer-fixo { margin-top: 32px; padding: 10px 0; border-top: 2px solid #2563EB; font-size: 7.5pt; color: #94a3b8; text-align: center; }
  .footer-fixo strong { color: #2563EB; }
  @media print {
    /* Na impressão o rodapé vem do @page (acima); este bloco só aparece na visualização no navegador */
    .footer-fixo { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>⚡ OrçaElétrica</h1>
    <div class="sub">Orçamento de Instalação Elétrica Residencial</div>
    ${cliente ? `<div class="cliente"><span>Cliente</span>${esc(cliente)}</div>` : ''}
  </div>
  <div class="meta">
    <div>Data: ${dataAtual}</div>
  </div>
</div>

<!-- Grupo 1: dados da obra -->
<div class="grupo">
<div class="section">
  <h2>Dados do Imóvel</h2>
  <div class="info-grid">
    <div><div class="label">Tipo de imóvel</div><div class="value">${esc(dados.imovel || 'Não informado')}</div></div>
    <div><div class="label">Tipo de obra</div><div class="value">${esc(dados.obra || 'Não informado')}</div></div>
    <div><div class="label">Cobertura / Teto</div><div class="value">${esc(dados.cobertura || 'Não informado')}</div></div>
    <div><div class="label">Ligação da rede</div><div class="value">${esc(redeComTensao(dados.rede))}</div></div>
  </div>
</div>

${especHtml}

${equipHtml}

${entradaHtml}

${aterramentoHtml}
</div>

<!-- Grupo 2: dimensionamento -->
<div class="grupo">
<div class="section">
  <h2>Resumo Geral</h2>
  <div class="stats">
    <div class="stat"><div class="num">${resultado.quadro.nCircuitos}</div><div class="lbl">Circuitos</div></div>
    <div class="stat"><div class="num">${fmt(resultado.quadro.cargaTotalW)}</div><div class="lbl">Carga total (W)</div></div>
    <div class="stat"><div class="num">${resultado.quadro.disjuntorGeralA}A</div><div class="lbl">Disjuntor geral</div></div>
    <div class="stat"><div class="num">${fmt(totais.distEletroduto)}</div><div class="lbl">Eletroduto (m)</div></div>
  </div>
  <h3>Detalhamento por cômodo</h3>
  <table>
    <thead>
      <tr>
        <th>Cômodo</th>
        <th class="r">Caixas</th>
        <th class="r">Tomadas</th>
        <th class="r">Interruptores</th>
        <th class="r">Luzes</th>
        <th class="r">Dist. interna (m)</th>
      </tr>
    </thead>
    <tbody>${comodosHtml}</tbody>
  </table>
</div>

<div class="section">
  <h2>Quadro de Distribuição</h2>
  <div class="info-grid">
    <div><div class="label">UF / distribuidora</div><div class="value">${resultado.quadro.uf ? `${esc(resultado.quadro.uf)} — ${esc(resultado.quadro.distribuidora)}` : 'Não informada'}</div></div>
    <div><div class="label">Tensão da localidade</div><div class="value">${esc(resultado.quadro.sistema)} V</div></div>
    <div><div class="label">Demanda total calculada</div><div class="value">${fmtD(resultado.quadro.demandaKva)} kVA (carga instalada ${fmtD(resultado.quadro.cargaInstaladaKw)} kW)</div></div>
    <div><div class="label">Categoria de atendimento</div><div class="value">${esc(resultado.quadro.categoria)}${resultado.quadro.caboRamal ? ` — ramal ${esc(resultado.quadro.caboRamal)}; entrada ${esc(resultado.quadro.caboEntrada)}; eletroduto ${esc(resultado.quadro.eletrodutoEntrada)}` : ''}</div></div>
    <div><div class="label">Disjuntor geral</div><div class="value">${resultado.quadro.disjuntorGeralA}A — ${resultado.quadro.ligacaoSistema === 'trifasico' ? 'Tripolar' : resultado.quadro.ligacaoSistema === 'bifasico' ? 'Bipolar' : 'Monopolar'}</div></div>
    <div><div class="label">Número de circuitos</div><div class="value">${resultado.quadro.nCircuitos}</div></div>
    <div><div class="label">Carga total instalada</div><div class="value">${fmt(resultado.quadro.cargaTotalW)} W</div></div>
    <div><div class="label">Corrente total</div><div class="value">${fmtD(resultado.quadro.correnteTotalA)} A</div></div>
  </div>
  <p class="aviso-box">Pré-dimensionamento (DIS-NOR-030 Rev.05) — verificar com a distribuidora${resultado.quadro.verificarDistribuidora ? ' local: a tabela de categorias usada é apenas referência para esta UF' : ''}.</p>
</div>

<div class="section">
  <h2>Circuitos — Dimensionamento (NBR 5410)</h2>
  <p class="note">Método B1 — Condutor de cobre com isolação PVC em eletroduto embutido. Fator de potência: 0,92.</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Circuito</th>
        <th>Tipo</th>
        <th class="r">Pot. (W)</th>
        <th class="r">Tensão</th>
        <th class="r">Corrente (A)</th>
        <th class="r">Bitola (mm²)</th>
        <th class="r">Disj. (A)</th>
        <th class="r">Eletrod. (mm)</th>
        <th class="r">Comp. (m)</th>
      </tr>
    </thead>
    <tbody>${circuitosHtml}</tbody>
  </table>
</div>
</div>

<!-- Grupo 3: materiais e pendências -->
<div class="grupo">
<div class="section">
  <h2>Lista de Materiais</h2>
  <p class="note">⚡ Cabos: cores conforme NBR 5410 — Preto/Vermelho/Marrom = fase · Azul claro = neutro · Verde-amarelo = terra (PE)</p>
  <p class="note">Quantidades incluem folga de segurança (15% para cabos, 10% para eletrodutos). Valores de referência para orçamento.</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Material</th>
        <th class="r">Qtd</th>
        <th>Un</th>
        <th>Detalhe</th>
      </tr>
    </thead>
    <tbody>${materiaisHtml}</tbody>
  </table>
</div>

</div>

<!-- Afiliados -->
<div style="margin-top:32px; padding:16px; border:1px solid #e0e0e0; border-radius:8px; background:#fafafa; page-break-inside:avoid;">
  <p style="margin:0 0 8px 0; font-size:13px; font-weight:bold; color:#333;">
    ⚡ Encontre os materiais com preço que cabe no seu bolso!
  </p>
  <p style="margin:0 0 12px 0; font-size:12px; color:#555;">
    Conheça os materiais elétricos nas lojas mais conhecidas do mercado:
  </p>
  <table style="width:100%; border-collapse:collapse; font-size:12px;">
    <tr>
      <td style="padding:4px 8px 4px 0; color:#555;">⚡ Materiais Elétricos</td>
      <td style="padding:4px 8px;"><a href="https://collshp.com/jose_o_souza271/category/4439164?share_channel_code=1&view=storefront" style="color:#ee4d2d;">Shopee</a></td>
      <td style="padding:4px 8px;"><a href="https://meli.la/2AepJUo" style="color:#f0a500;">Mercado Livre</a></td>
    </tr>
    <tr>
      <td style="padding:4px 8px 4px 0; color:#555;">🔧 Ferramentas</td>
      <td style="padding:4px 8px;"><a href="https://collshp.com/jose_o_souza271/category/3503601?share_channel_code=1&view=storefront" style="color:#ee4d2d;">Shopee</a></td>
      <td style="padding:4px 8px;"><a href="https://meli.la/2ofRVk2" style="color:#f0a500;">Mercado Livre</a></td>
    </tr>
    <tr>
      <td style="padding:4px 8px 4px 0; color:#555;">🏠 Casa Inteligente</td>
      <td style="padding:4px 8px;"><a href="https://collshp.com/jose_o_souza271/category/3649413?share_channel_code=1&view=storefront" style="color:#ee4d2d;">Shopee</a></td>
      <td style="padding:4px 8px;"><a href="https://meli.la/2QVebrw" style="color:#f0a500;">Mercado Livre</a></td>
    </tr>
  </table>
  <p style="margin:12px 0 0 0; font-size:11px; color:#888;">
    📱 Conheça nossos outros apps para eletricista: <a href="https://eletricistapro.com.br/" style="color:#0077aa;">eletricistapro.com.br</a>
  </p>
</div>

<!-- Busca de eletricista -->
<div style="margin-top:16px; padding:16px; border:1px solid #e0e0e0; border-radius:8px; background:#f5f9ff; page-break-inside:avoid;">
  <p style="margin:0 0 6px 0; font-size:13px; font-weight:bold; color:#333;">
    🔍 Precisa de um eletricista?
  </p>
  <p style="margin:0; font-size:12px; color:#555;">
    Encontre eletricistas próximos de você no Google Maps:
    <a href="https://www.google.com/maps/search/eletricista" style="color:#0077cc;">
      maps.google.com → buscar "eletricista"
    </a>
    &nbsp;— ou pesquise com seu CEP para resultados mais precisos.
  </p>
</div>

<!-- Observações técnicas -->
<div class="section" style="margin-top:24px;">
  <h2>Observações Técnicas</h2>
  <ul style="font-size: 8.5pt; color: #475569; padding-left: 16px; line-height: 1.7;">
    <li>Premissas: sistema ${resultado.quadro.sistema} V (${(dados.entrada?.sistemaTensao && dados.entrada.sistemaTensao !== 'nao-sei') || resultado.quadro.uf ? 'informado' : 'não informado — adotado 220/127 V, confirme'}); categoria de atendimento ${resultado.quadro.categoria}; carga instalada ${resultado.quadro.cargaInstaladaKw} kW; demanda ${resultado.quadro.demandaKva} kVA (DIS-NOR-030 6.26–6.27, fatores g/h/i = 1,00).</li>
    ${circuitosObsHtml}
    <li>Seções mínimas: 1,5 mm² (iluminação), 2,5 mm² (tomadas e uso específico) — NBR 5410 6.2.6.1.1.</li>
    <li>Método de referência B1 (Tabela 36) com fator de agrupamento da Tabela 42; disjuntor curva C com IB ≤ In ≤ Iz; mínimo de 10 A em TUG e iluminação.</li>
    <li>Queda de tensão: meta de 3% no circuito terminal (ρ = 0,0225 Ω·mm²/m); fator de potência 1 (resistivos) e 0,92 (ar-condicionado e motores).</li>
    <li>Iluminação e tomadas em fase-neutro (${resultado.quadro.sistema === '380/220' ? '220' : '127'} V); quadro com ${resultado.quadro.reserva} posições de reserva (NBR 5410 Tabela 59).</li>
    <li>Disjuntor geral pela categoria de atendimento (DIS-NOR-030): padrão de referência; confirme na sua concessionária.${resultado.quadro.avisoCategoria ? ' ' + esc(resultado.quadro.avisoCategoria) : ''}</li>
    <li>Diâmetros de eletroduto e capacidade do DR: A VALIDAR pelo profissional. Folgas de 15% (cabos) e 10% (eletroduto).</li>
    <li>Motor de cálculo versão ${resultado.quadro.versaoMotor}. A instalação deve ser executada por profissional habilitado.</li>
  </ul>
</div>

<div class="footer-fixo">
  <strong>OrçaElétrica</strong> — Orçamento de referência<span class="pg-txt"> — Página <span class="pg"></span></span><br>
  Estimativa baseada na NBR 5410:2004; não substitui projeto de profissional habilitado.
</div>

</body>
</html>`;
}
