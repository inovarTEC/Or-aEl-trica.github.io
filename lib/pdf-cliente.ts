/* Ajudas do navegador para o PDF liberado pelo servidor. */

/** Abre a janela de impressão (o cliente escolhe «Salvar como PDF»). */
export function imprimirHtml(html: string): void {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.srcdoc = html;
  f.onload = () => {
    // Alguns navegadores sugerem o nome do arquivo pelo título da página principal, não do iframe:
    // usa o <title> do relatório durante a impressão e restaura depois.
    const tituloOriginal = document.title;
    const tituloRelatorio = f.contentDocument?.title;
    if (tituloRelatorio) document.title = tituloRelatorio;
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => { document.title = tituloOriginal; }, 1_000);
    setTimeout(() => f.remove(), 60_000);
  };
  document.body.appendChild(f);
}

/** Baixa uma cópia do relatório em .html (nome = <title> do relatório, ex.: Orcamento-05-11-2026.html). */
export function baixarHtml(html: string): void {
  const titulo = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim() || 'Orcamento';
  const nomeArquivo = `${titulo.replace(/[^A-Za-z0-9-]+/g, '-')}.html`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
