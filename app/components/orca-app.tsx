'use client';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import ProgressBar from './progress-bar';
import StepImovel from './step-imovel';
import StepComodos from './step-comodos';
import StepPontos from './step-pontos';
import StepEquipamentos from './step-equipamentos';
import StepPrevia from './step-previa';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OrcaApp() {
  const store = useStore();
  const step = store?.step ?? 0;

  useEffect(() => {
    store.hydrateFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            if (confirm('Tem certeza que deseja começar um novo orçamento? Os dados atuais serão perdidos.')) {
              store.resetState();
            }
          }} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
            Novo orçamento
          </button>
        </div>
      </header>

      {/* Progress */}
      <ProgressBar step={step} onStepClick={(s: number) => store.setStep(s)} />

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
            <Button onClick={() => store.setStep(Math.min(4, step + 1))}>
              Avançar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
