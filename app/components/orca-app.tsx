'use client';
import { useEffect } from 'react';
import { useStore, CHAVE_PEDIDO } from '@/lib/store-cliente';
import { edicaoVigente, formatarData } from '@/lib/meus-orcamentos';
import { errosEtapa, primeiraEtapaInvalida } from '@/lib/validacao';
import { toast } from 'sonner';
import ProgressBar from './progress-bar';
import PainelTeste from './painel-teste';
import StepImovel from './step-imovel';
import StepComodos from './step-comodos';
import StepPontos from './step-pontos';
import StepEquipamentos from './step-equipamentos';
import StepPrevia from './step-previa';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';

export default function OrcaApp() {
  const store = useStore();
  const step = store?.step ?? 0;

  useEffect(() => {
    store.hydrateFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Avança só se a etapa atual estiver completa; mostra o que falta. */
  const avancar = () => {
    const erros = errosEtapa(store, step);
    if (erros.length > 0) {
      toast.error(erros[0], { description: erros.length > 1 ? `e mais ${erros.length - 1} pendência(s) nesta etapa` : undefined });
      return;
    }
    store.setStep(Math.min(4, step + 1));
  };

  /** Pela barra de progresso: voltar é livre; pular para frente só até a primeira etapa incompleta. */
  const irPara = (s: number) => {
    if (s <= step) return store.setStep(s);
    const limite = primeiraEtapaInvalida(store);
    if (s > limite) {
      toast.error(errosEtapa(store, limite)[0] ?? 'Complete as etapas anteriores primeiro');
      return store.setStep(Math.max(step, Math.min(limite, s)));
    }
    store.setStep(s);
  };

  const steps = [StepImovel, StepComodos, StepPontos, StepEquipamentos, StepPrevia];
  const CurrentStep = steps[step] ?? StepImovel;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">OrçaElétrica</span>
          </div>
          <button type="button" onClick={() => {
            // Se o PDF já foi entregue nesta sessão, avisa que ele será apagado da tela.
            let pdfNaTela = false;
            try {
              pdfNaTela = !!JSON.parse(sessionStorage.getItem(CHAVE_PEDIDO) ?? 'null')?.h;
            } catch { /* sem acesso ao armazenamento: usa o aviso padrão */ }
            const aviso = pdfNaTela
              ? 'Você já pagou e o PDF deste orçamento ainda está nesta tela. Se continuar, ele será apagado e não poderá ser baixado de novo. Já salvou o PDF?'
              : 'Tem certeza que deseja começar um novo orçamento? Os dados atuais serão perdidos.';
            if (confirm(aviso)) {
              store.resetState();
            }
          }} className="rounded-md border border-green-300 bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-200 transition-colors">
            Novo orçamento
          </button>
        </div>
      </header>

      {edicaoVigente(store.edicao) && (
        <div className="border-b border-green-200 bg-green-50 px-4 py-2 text-center text-xs text-green-900">
          Você está editando um orçamento já pago · {store.edicao.restantes} {store.edicao.restantes === 1 ? 'edição gratuita' : 'edições gratuitas'} até {formatarData(store.edicao.expiraEm)}
        </div>
      )}

      {/* Progress */}
      <ProgressBar step={step} onStepClick={irPara} />

      {/* Content */}
      <main className="flex-1 px-4 pb-4 pt-2">
        <CurrentStep />
      </main>

      {/* Navegação: fica no fim da página (não fixa), com folga embaixo para o selo do Netlify não cobrir o botão */}
      <div className="border-t border-border">
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-32 flex items-center justify-between">
          <Button variant="outline" onClick={() => store.setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          {step < 4 ? (
            <Button onClick={avancar}>
              Avançar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Só aparece com NEXT_PUBLIC_MODO_TESTE=true */}
      <PainelTeste />
    </div>
  );
}
