'use client';
import { motion } from 'framer-motion';
import { AlertTriangle, Info, Lock, Package, ShieldCheck } from 'lucide-react';
import { useStore } from '@/lib/store-cliente';
import { semNegativo } from '@/lib/validacao';
import { aterramentoPadrao, avisosAterramento, caixasDasHastes, materiaisAterramento } from '@/lib/aterramento-calc';
import type { AterramentoPrincipal } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const selCls = 'mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm';
/** Campo inteiro ≥ 0 (vazio ou inválido vira 0). */
const inteiro = (v: string) => Math.max(0, Math.floor(Number(semNegativo(v)) || 0));

export default function StepAterramento() {
  const store = useStore();
  const a: AterramentoPrincipal = { ...aterramentoPadrao(), ...(store?.aterramento ?? {}) };
  const up = (patch: Partial<AterramentoPrincipal>) => store.updateAterramento(patch);

  const materiais = materiaisAterramento(a).filter((m) => m.mostrarNaPrevia);
  const avisos = avisosAterramento(a);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Aterramento principal</h2>
        <p className="text-muted-foreground mt-1">Hastes, caixas de inspeção e cabo do quadro até o aterramento</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Dados do aterramento</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Número de hastes</Label>
              <Input type="number" min="0" step="1" value={a.nHastes} className="mt-1"
                onChange={(ev) => {
                  const n = inteiro(ev.target.value);
                  up({ nHastes: n, nConectores: n, nCaixasInspecao: caixasDasHastes(n) }); // conectores e caixas acompanham as hastes (ainda editáveis)
                }} />
              <p className="mt-1 text-[11px] text-muted-foreground">Proposta inicial: 3 hastes de 2,40 m</p>
            </div>
            <div>
              <Label className="text-xs">Comprimento da haste</Label>
              <p className="mt-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">2,40 m</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Número de conectores de haste</Label>
              <Input type="number" min="0" step="1" value={a.nConectores ?? a.nHastes} className="mt-1"
                onChange={(ev) => up({ nConectores: inteiro(ev.target.value) })} />
              <p className="mt-1 text-[11px] text-muted-foreground">Padrão: 1 por haste</p>
            </div>
            <div>
              <Label className="text-xs">Número de caixas de inspeção</Label>
              <Input type="number" min="0" step="1" value={a.nCaixasInspecao} className="mt-1"
                onChange={(ev) => up({ nCaixasInspecao: inteiro(ev.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Bitola do cabo</Label>
              <select value={a.bitolaCabo} className={selCls} onChange={(ev) => up({ bitolaCabo: ev.target.value as '6' | '10' })}>
                <option value="6">6 mm²</option>
                <option value="10">10 mm²</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Distância até o ponto de aterramento (m)</Label>
            <Input type="number" step="0.1" min="0" value={a.distancia} placeholder="Ex: 8" className="mt-1"
              onChange={(ev) => up({ distancia: semNegativo(ev.target.value) })} />
            <p className="mt-1 text-[11px] text-muted-foreground">Do quadro até as hastes</p>
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <textarea value={a.obs} maxLength={500} rows={3} className={selCls}
              onChange={(ev) => up({ obs: ev.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={a.incluirNoPdf !== false}
              onChange={(ev) => up({ incluirNoPdf: ev.target.checked })} />
            Incluir materiais do aterramento no orçamento (PDF)
          </label>
        </CardContent>
      </Card>

      {avisos.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" /> Avisos ({avisos.length})
            </p>
            <ul className="space-y-1">
              {avisos.map((av, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  {av.tipo === 'info'
                    ? <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />}
                  {av.msg}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" /> Prévia dos materiais
          </p>
          <div className="space-y-1">
            {materiais.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0 text-sm">
                <span>{m.descricao}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">{m.qtd} {m.unidade}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-dashed flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" /> Bitola do cabo e detalhamento completo inclusos no PDF
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
