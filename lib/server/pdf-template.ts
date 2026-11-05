/* ===== Template HTML do PDF do Orçamento Elétrico ===== */
import { AppState, Room } from '../types';
import { calcTotais, calcPendencias } from './calculator';
import { calcularMateriais, CircuitoCalc, ResultadoCalculo } from './calc-materiais';

function num(v: string | number | undefined | null): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(v ?? '');
  return isNaN(n) ? 0 : n;
}

/** Escapa texto digitado pelo cliente antes de inserir no HTML (evita XSS no relatório). */
const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const fmtD = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function tipoLabel(t: string) {
  if (t === 'iluminacao') return 'Iluminação';
  if (t === 'tug') return 'Tomadas (TUG)';
  return 'Uso específico (TUE)';
}

function routeLen(r: Room): number {
  return r.via ? num(r.dd) + num(r.dr) : num(r.dq);
}

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

/**
 * Título único do relatório (o navegador usa como nome sugerido ao "Salvar como PDF").
 * Nome do cliente (se houver) + data. Ex.: Orcamento-Joao-Silva-05-11-2026 ou Orcamento-05-11-2026
 */
function tituloPdf(dados: Partial<AppState> & Record<string, any>, agora?: Date): string {
  const nome = slugArquivo(dados?.nomeCliente ?? dados?.nomeEmpresa ?? dados?.nomeResponsavel);
  return ['Orcamento', nome, dataArquivo(agora)].filter(Boolean).join('-');
}

export function gerarHtmlPdf(dados: AppState): string {
  const totais = calcTotais(dados);
  const pendencias = calcPendencias(dados);
  const resultado: ResultadoCalculo = calcularMateriais(dados);
  const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

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

  const pendHtml = pendencias.length > 0 ? `
    <div class="section">
      <h2>Pendências</h2>
      <p class="note">Os itens abaixo precisam ser revisados para um orçamento mais preciso.</p>
      <ul class="pend">
        ${pendencias.map(p => `<li class="${esc(p.tipo)}">${esc(p.msg)}</li>`).join('')}
      </ul>
    </div>
  ` : `
    <div class="section">
      <h2>Pendências</h2>
      <p class="ok">✓ Nenhuma pendência encontrada. Todos os dados foram preenchidos.</p>
    </div>
  `;

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
            const room = (dados.rooms ?? []).find(r => r.id === eq.room);
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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(tituloPdf(dados))}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.5; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2563EB; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 22pt; color: #2563EB; font-weight: 800; letter-spacing: -0.5px; }
  .header .sub { font-size: 9pt; color: #64748b; }
  .header .meta { text-align: right; font-size: 9pt; color: #64748b; }

  /* Sections */
  .section { margin-bottom: 18px; page-break-inside: avoid; }
  h2 { font-size: 13pt; color: #2563EB; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px; }

  /* Info grid */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 16px; }
  .info-grid .label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-grid .value { font-size: 10pt; font-weight: 600; margin-bottom: 6px; }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .stat { background: #f1f5f9; border-radius: 8px; padding: 10px; text-align: center; }
  .stat .num { font-size: 18pt; font-weight: 800; color: #2563EB; }
  .stat .lbl { font-size: 7pt; color: #64748b; text-transform: uppercase; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 8px; }
  th { background: #f1f5f9; color: #475569; font-weight: 700; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  .r { text-align: right; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:hover { background: #eff6ff; }

  /* Pendencias */
  .pend { list-style: none; padding: 0; }
  .pend li { padding: 4px 8px; margin: 3px 0; border-radius: 4px; font-size: 9pt; }
  .pend li.erro { background: #fef2f2; color: #dc2626; border-left: 3px solid #dc2626; }
  .pend li.aviso { background: #fffbeb; color: #d97706; border-left: 3px solid #d97706; }
  .pend li.info { background: #eff6ff; color: #2563eb; border-left: 3px solid #2563eb; }
  .ok { color: #16a34a; font-weight: 600; padding: 8px; background: #f0fdf4; border-radius: 6px; }
  .note { font-size: 8pt; color: #94a3b8; margin-bottom: 8px; }

  /* Footer */
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1.5px solid #e2e8f0; font-size: 7.5pt; color: #94a3b8; text-align: center; }
  .footer strong { color: #2563EB; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>⚡ OrçaElétrica</h1>
    <div class="sub">Orçamento de Instalação Elétrica Residencial</div>
  </div>
  <div class="meta">
    <div>Data: ${dataAtual}</div>
  </div>
</div>

<!-- Dados do Imóvel -->
<div class="section">
  <h2>Dados do Imóvel</h2>
  <div class="info-grid">
    <div><div class="label">Tipo de imóvel</div><div class="value">${esc(dados.imovel || 'Não informado')}</div></div>
    <div><div class="label">Tipo de obra</div><div class="value">${esc(dados.obra || 'Não informado')}</div></div>
    <div><div class="label">Cobertura / Teto</div><div class="value">${esc(dados.cobertura || 'Não informado')}</div></div>
    <div><div class="label">Ligação da rede</div><div class="value">${esc(dados.rede || 'Não informado')}</div></div>
  </div>
</div>

<!-- Resumo geral -->
<div class="section">
  <h2>Resumo Geral</h2>
  <div class="stats">
    <div class="stat"><div class="num">${resultado.quadro.nCircuitos}</div><div class="lbl">Circuitos</div></div>
    <div class="stat"><div class="num">${fmt(resultado.quadro.cargaTotalW)}</div><div class="lbl">Carga total (W)</div></div>
    <div class="stat"><div class="num">${resultado.quadro.disjuntorGeralA}A</div><div class="lbl">Disjuntor geral</div></div>
    <div class="stat"><div class="num">${fmt(totais.distEletroduto)}</div><div class="lbl">Eletroduto (m)</div></div>
  </div>
</div>

<!-- Detalhamento por cômodo -->
<div class="section">
  <h2>Detalhamento por Cômodo</h2>
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

${equipHtml}

<!-- Circuitos -->
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

<!-- Quadro de distribuição -->
<div class="section">
  <h2>Quadro de Distribuição</h2>
  <div class="info-grid">
    <div><div class="label">Disjuntor geral</div><div class="value">${resultado.quadro.disjuntorGeralA}A — ${dados.rede === 'Trifásico' ? 'Tripolar' : dados.rede === 'Bifásico' ? 'Bipolar' : 'Monopolar'}</div></div>
    <div><div class="label">Número de circuitos</div><div class="value">${resultado.quadro.nCircuitos}</div></div>
    <div><div class="label">Carga total instalada</div><div class="value">${fmt(resultado.quadro.cargaTotalW)} W</div></div>
    <div><div class="label">Corrente total</div><div class="value">${fmtD(resultado.quadro.correnteTotalA)} A</div></div>
  </div>
</div>

<!-- Lista de materiais -->
<div class="section">
  <h2>Lista de Materiais</h2>
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

${pendHtml}

<!-- Observações técnicas -->
<div class="section">
  <h2>Observações Técnicas</h2>
  <ul style="font-size: 8.5pt; color: #475569; padding-left: 16px; line-height: 1.7;">
    <li>Dimensionamento conforme <strong>NBR 5410:2004</strong> (ABNT) — Instalações elétricas de baixa tensão.</li>
    <li>Seções mínimas: 1,5 mm² (iluminação), 2,5 mm² (tomadas e circuitos de uso específico).</li>
    <li>Queda de tensão máxima considerada: 2% por circuito terminal.</li>
    <li>Método de instalação B1 — condutores em eletroduto embutido em parede.</li>
    <li>Fator de potência de referência: 0,92.</li>
    <li>Fator de demanda para disjuntor geral: 0,70 (residencial).</li>
    <li>Este orçamento é uma estimativa de referência. A instalação deve ser executada por profissional habilitado (eletricista com registro no CREA/CRT).</li>
    <li>Os valores podem variar conforme as condições específicas da obra, comprimento real dos circuitos e particularidades da instalação.</li>
  </ul>
</div>

<div class="footer">
  <strong>OrçaElétrica</strong> — Orçamento gerado automaticamente com base na NBR 5410<br>
  Este documento é uma estimativa de referência e não substitui o projeto elétrico elaborado por profissional habilitado.
</div>

</body>
</html>`;
}
