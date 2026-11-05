'use client';
import { useState } from 'react';
import { imprimirHtml, baixarHtml } from '@/lib/pdf-cliente';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, FlaskConical, Loader2, Printer } from 'lucide-react';

/** Lido no build: o painel só existe quando NEXT_PUBLIC_MODO_TESTE=true. */
const MODO_TESTE = process.env.NEXT_PUBLIC_MODO_TESTE === 'true';

const MENSAGENS: Record<number, string> = {
  401: 'Senha incorreta.',
  404: 'Rota de teste desativada: defina TESTE_SENHA no servidor.',
};

/** Painel de desenvolvimento: gera o PDF com dados de exemplo, sem pagamento. */
export default function PainelTeste() {
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ html: string; nomeArquivo: string } | null>(null);

  if (!MODO_TESTE) return null;

  const gerar = async () => {
    setCarregando(true);
    setErro('');
    setResultado(null);
    try {
      const r = await fetch('/api/pdf-teste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || typeof j?.html !== 'string') {
        setErro(MENSAGENS[r.status] ?? `Falha ao gerar (${j?.erro ?? r.status}).`);
        return;
      }
      setResultado({ html: j.html, nomeArquivo: j.nomeArquivo ?? 'Orcamento-TESTE.html' });
    } catch {
      setErro('Sem conexão com o servidor.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-4 pb-8">
      <Card className="border-dashed border-amber-400 bg-amber-50/60">
        <CardContent className="p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <FlaskConical className="w-4 h-4" /> Modo teste — PDF de exemplo sem pagamento
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="password"
              placeholder="Senha de teste (TESTE_SENHA)"
              value={senha}
              onChange={(e: any) => setSenha(e?.target?.value ?? '')}
              onKeyDown={(e: any) => { if (e.key === 'Enter' && senha && !carregando) gerar(); }}
            />
            <Button onClick={gerar} disabled={!senha || carregando}>
              {carregando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Gerar PDF de Teste
            </Button>
          </div>
          {erro && <p className="text-xs text-red-700">{erro}</p>}
          {resultado && (
            <div className="space-y-2">
              <p className="text-xs text-green-800">PDF de teste pronto: <strong>{resultado.nomeArquivo}</strong></p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => imprimirHtml(resultado.html)}><Printer className="w-4 h-4 mr-2" /> Imprimir como PDF</Button>
                <Button variant="outline" onClick={() => baixarHtml(resultado.html, resultado.nomeArquivo)}><Download className="w-4 h-4 mr-2" /> Baixar HTML</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
