'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { EdicaoAtiva } from '@/lib/types';
import { baixarHtml, imprimirHtml } from '@/lib/pdf-cliente';
import { formatarData, guardarSalvo } from '@/lib/meus-orcamentos';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, CheckCircle2, Loader2, Download, Printer, AlertTriangle, FileText } from 'lucide-react';
import { dadosDoOrcamento } from './step-previa';

type Fase = 'confirmar' | 'gerando' | 'pronto' | 'encerrado' | 'erro';

const plural = (n: number) => `${n} ${n === 1 ? 'edição gratuita' : 'edições gratuitas'}`;

export default function EdicaoModal({ edicao, onClose }: { edicao: EdicaoAtiva; onClose: () => void }) {
  const [fase, setFase] = useState<Fase>('confirmar');
  const [html, setHtml] = useState('');
  const [restantes, setRestantes] = useState(edicao.restantes);
  const [mensagem, setMensagem] = useState('');

  const gerar = async () => {
    setFase('gerando');
    try {
      const r = await fetch('/api/reemitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: edicao.codigo, email: edicao.email, dados: dadosDoOrcamento(useStore.getState()) }),
      });
      if (r.status === 410) {
        useStore.getState().atualizarEdicao(null);
        setFase('encerrado');
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setMensagem(
          j?.erro === 'pagamento_nao_aprovado' ? 'O pagamento deste orçamento não está mais aprovado.'
          : j?.erro === 'calculo_falhou' || j?.erro === 'dados_invalidos' ? 'Não foi possível calcular com os dados atuais. Confira as telas e tente de novo.'
          : j?.erro === 'muitas_tentativas' ? 'Muitas tentativas. Aguarde alguns minutos.'
          : 'Não foi possível gerar agora. Nenhuma edição foi usada. Tente novamente.',
        );
        setFase('erro');
        return;
      }
      const j = await r.json();
      setHtml(j.html);
      setRestantes(j.restantes);
      useStore.getState().atualizarEdicao({ ...edicao, restantes: j.restantes, expiraEm: j.expiraEm });
      guardarSalvo({ codigo: edicao.codigo, email: edicao.email, expiraEm: j.expiraEm });
      setFase('pronto');
    } catch {
      setMensagem('Erro de conexão. Tente novamente.');
      setFase('erro');
    }
  };

  const nomeArquivo = `orcamento-atualizado-${edicao.codigo}.html`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget && fase !== 'gerando') onClose(); }}>
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardContent className="pt-5 pb-5 relative">
            {fase !== 'gerando' && (
              <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            )}

            {fase === 'confirmar' && (
              <div className="space-y-4 text-center">
                <FileText className="w-12 h-12 text-green-600 mx-auto" />
                <h3 className="text-lg font-bold">Gerar PDF atualizado</h3>
                <p className="text-sm text-muted-foreground">
                  Isso usa <strong>1</strong> das suas {plural(edicao.restantes)}, válidas até {formatarData(edicao.expiraEm)}. Antes de continuar, confira os dados nas telas.
                </p>
                <Button className="w-full" onClick={gerar}>Gerar PDF atualizado (sem custo)</Button>
                <Button variant="outline" className="w-full" onClick={onClose}>Cancelar</Button>
              </div>
            )}

            {fase === 'gerando' && (
              <div className="space-y-4 text-center py-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Gerando o PDF atualizado...</p>
              </div>
            )}

            {fase === 'pronto' && (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <h3 className="text-lg font-bold">PDF atualizado pronto!</h3>
                <p className="text-sm text-muted-foreground">
                  Clique em salvar e escolha <strong>“Salvar como PDF”</strong> na janela de impressão.
                </p>
                <Button className="w-full" onClick={() => imprimirHtml(html)}><Printer className="w-4 h-4 mr-2" /> Salvar como PDF</Button>
                <Button variant="outline" className="w-full" onClick={() => baixarHtml(html, nomeArquivo)}><Download className="w-4 h-4 mr-2" /> Baixar cópia (.html)</Button>
                <p className="text-[11px] text-green-800 bg-green-50 rounded px-2 py-1">
                  {restantes > 0 ? `Ainda restam ${plural(restantes)} até ${formatarData(edicao.expiraEm)}.` : 'Suas edições gratuitas acabaram. Para gerar outro PDF, será necessário um novo pagamento.'}
                </p>
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">Salve agora: gerar de novo usa mais uma edição.</p>
              </div>
            )}

            {fase === 'encerrado' && (
              <div className="space-y-4 text-center py-2">
                <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">Edição gratuita encerrada</h3>
                <p className="text-sm text-muted-foreground">O prazo ou o limite de edições gratuitas acabou. Para gerar o PDF deste orçamento, o pagamento é cobrado normalmente.</p>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}

            {fase === 'erro' && (
              <div className="space-y-4 text-center py-2">
                <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">Algo deu errado</h3>
                <p className="text-sm text-muted-foreground">{mensagem}</p>
                <Button className="w-full" onClick={() => setFase('confirmar')}>Tentar de novo</Button>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
