'use client';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Caixa de confirmação simples. O botão seguro («voltar») é o principal e já vem focado;
 * Esc ou toque fora também voltam, sem confirmar nada.
 */
export default function DialogoConfirmar({
  titulo, children, rotuloVoltar, rotuloConfirmar, onVoltar, onConfirmar,
}: {
  titulo: string;
  children: ReactNode;
  rotuloVoltar: string;
  rotuloConfirmar: string;
  onVoltar: () => void;
  onConfirmar: () => void;
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onVoltar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onVoltar]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onVoltar(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-2 text-left">
            <h3 id="dialogo-titulo" className="text-base font-bold">{titulo}</h3>
            <div className="text-sm text-muted-foreground space-y-2">{children}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button autoFocus className="w-full sm:flex-1 whitespace-normal h-auto py-2" onClick={onVoltar}>{rotuloVoltar}</Button>
          <Button variant="outline" className="w-full sm:flex-1 whitespace-normal h-auto py-2" onClick={onConfirmar}>{rotuloConfirmar}</Button>
        </div>
      </div>
    </div>
  );
}
