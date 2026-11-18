'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-cliente';
import { errosEtapa, primeiraEtapaInvalida } from '@/lib/validacao';
import { STEP_ATERRAMENTO, STEP_COMODOS, STEP_PREVIA } from '@/lib/navegacao';
import { toast } from 'sonner';
import ProgressBar from './progress-bar';
import StepImovel from './step-imovel';
import StepComodos from './step-comodos';
import StepPontos from './step-pontos';
import StepEquipamentos from './step-equipamentos';
import StepEntrada from './step-entrada';
import StepAterramento from './step-aterramento';
import StepPrevia from './step-previa';
import { Button } from '@/components/ui/button';
import DialogoConfirmar from './dialogo-confirmar';
import { carregarEstado, edicoesRestantes, estadoExpirado, formatarData, type EstadoLocal } from '@/lib/storage-local';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';

export default function OrcaApp() {
  const store = useStore();
  const step = store?.step ?? 0;
  /** Estado salvo lido no momento do clique em «Novo orçamento» (null = caixa fechada). */
  const [confirmarNovo, setConfirmarNovo] = useState<{ salvo: EstadoLocal | null } | null>(null);

  useEffect(() => {
    store.hydrateFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** «Novo orçamento»: sem nada preenchido recomeça direto; senão pergunta antes de apagar. */
  const pedirNovoOrcamento = () => {
    const salvo = carregarEstado();
    const temDados = (store.rooms?.length ?? 0) > 0 || (store.equips?.length ?? 0) > 0 || !!salvo?.pagamento;
    if (!temDados) return store.resetState();
    setConfirmarNovo({ salvo });
  };

  /** Avança só se a etapa atual estiver completa; mostra o que falta. */
  const avancar = () => {
    const erros = errosEtapa(store, step);
    // Passo 4: cômodo do equipamento é recomendado (só aviso — não bloqueia; validacao.ts não muda nesta etapa).
    if (step === 3 && erros.length === 0) {
      const semComodo = (store.equips ?? []).filter((e) => !e?.room).length;
      if (semComodo > 0) toast.warning(`${semComodo} equipamento(s) sem cômodo definido`, { description: 'Você pode voltar e informar o cômodo para um orçamento mais preciso.' });
    }
    if (erros.length > 0) {
      toast.error(erros[0], { description: erros.length > 1 ? `e mais ${erros.length - 1} pendência(s) nesta etapa` : undefined });
      return;
    }
    store.setStep(Math.min(STEP_PREVIA, step + 1));
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

  const steps = [StepImovel, StepComodos, StepPontos, StepEquipamentos, StepEntrada, StepAterramento, StepPrevia];
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
          {/* Apaga tudo do navegador (dados, Pix e PDF) e volta ao início — só depois de confirmar. */}
          <button type="button" onClick={pedirNovoOrcamento} className="rounded-md border border-green-300 bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-200 transition-colors">
            Novo orçamento
          </button>
        </div>
      </header>

      {/* Progress */}
      <ProgressBar step={step} onStepClick={irPara} />

      {/* Content */}
      <main className="flex-1 px-4 pb-4 pt-2">
        {store.veioDaPrevia && step >= STEP_COMODOS && step <= STEP_ATERRAMENTO && (
          <div className="max-w-2xl mx-auto mb-2">
            <button type="button" onClick={() => { store.setVeioDaPrevia(false); store.setStep(STEP_PREVIA); }}
              className="text-sm text-primary hover:underline">
              ← Voltar à prévia
            </button>
          </div>
        )}
        <CurrentStep />
      </main>

      {/* Navegação: fica no fim da página (não fixa), com folga embaixo para o selo do Netlify não cobrir o botão */}
      <div className="border-t border-border">
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-32 flex items-center justify-between">
          <Button variant="outline" onClick={() => store.setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          {step < STEP_PREVIA ? (
            <Button onClick={avancar}>
              Avançar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : null}
        </div>
      </div>

      {confirmarNovo && (
        <NovoOrcamentoDialogo
          salvo={confirmarNovo.salvo}
          onVoltar={() => setConfirmarNovo(null)}
          onConfirmar={() => { setConfirmarNovo(null); store.resetState(); }}
        />
      )}
    </div>
  );
}

/** Texto da confirmação conforme a situação do orçamento (pago com edições, pago sem edições, Pix em aberto, sem pagamento). */
function NovoOrcamentoDialogo({ salvo, onVoltar, onConfirmar }: { salvo: EstadoLocal | null; onVoltar: () => void; onConfirmar: () => void }) {
  const entregue = !!salvo?.entrega && !estadoExpirado(salvo);
  const restantes = salvo && entregue ? edicoesRestantes(salvo) : 0;
  const ate = salvo ? formatarData(salvo.expiraEm) : '';

  if (entregue && restantes > 0) {
    return (
      <DialogoConfirmar
        titulo="Começar um novo orçamento?"
        rotuloVoltar="Voltar e usar minhas edições"
        rotuloConfirmar="Apagar e começar novo"
        onVoltar={onVoltar}
        onConfirmar={onConfirmar}
      >
        <p>
          Este orçamento já foi pago e você ainda tem{' '}
          <strong>{restantes === 1 ? '1 edição gratuita' : `${restantes} edições gratuitas`}</strong> até {ate}.
        </p>
        <p>Se continuar, o orçamento e o PDF serão apagados deste navegador, e um novo orçamento precisará de um novo pagamento.</p>
      </DialogoConfirmar>
    );
  }
  if (entregue) {
    return (
      <DialogoConfirmar
        titulo="Começar um novo orçamento?"
        rotuloVoltar="Voltar"
        rotuloConfirmar="Apagar e começar novo"
        onVoltar={onVoltar}
        onConfirmar={onConfirmar}
      >
        <p>Suas edições gratuitas deste orçamento já foram usadas.</p>
        <p>Se continuar, o PDF guardado neste navegador será apagado. Baixe uma cópia antes, se ainda precisar dele.</p>
      </DialogoConfirmar>
    );
  }
  if (salvo?.pagamento) {
    return (
      <DialogoConfirmar
        titulo="Há um pagamento em andamento"
        rotuloVoltar="Voltar ao orçamento"
        rotuloConfirmar="Apagar e começar novo"
        onVoltar={onVoltar}
        onConfirmar={onConfirmar}
      >
        <p>Você gerou um Pix para este orçamento. Se pagou, ou ainda vai pagar, o PDF só pode ser liberado aqui neste navegador.</p>
        <p>Se continuar, o orçamento e o Pix serão apagados e você poderá perder o PDF pago.</p>
      </DialogoConfirmar>
    );
  }
  return (
    <DialogoConfirmar
      titulo="Começar um novo orçamento?"
      rotuloVoltar="Voltar ao orçamento"
      rotuloConfirmar="Apagar e começar novo"
      onVoltar={onVoltar}
      onConfirmar={onConfirmar}
    >
      <p>Os dados preenchidos neste orçamento serão apagados.</p>
    </DialogoConfirmar>
  );
}
