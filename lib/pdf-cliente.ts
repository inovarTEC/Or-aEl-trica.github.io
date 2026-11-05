/* Ajudas do navegador para o PDF liberado pelo servidor. */

/** Abre a janela de impressão (o cliente escolhe «Salvar como PDF»). */
export function imprimirHtml(html: string): void {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.srcdoc = html;
  f.onload = () => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 60_000);
  };
  document.body.appendChild(f);
}

/** Baixa uma cópia do relatório em .html. */
export function baixarHtml(html: string, nomeArquivo: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
