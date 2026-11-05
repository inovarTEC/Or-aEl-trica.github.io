'use client';
import { useStore } from '@/lib/store-cliente';
import { uid } from '@/lib/templates';
import { luzCount } from '@/lib/luz';
import { Room, Ponto, Luz, Comando } from '@/lib/types';
import { tomadasNbr } from '@/lib/validacao';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plug, Lightbulb, ToggleLeft, Plus, Trash2, MapPin, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';

export default function StepPontos() {
  const store = useStore();
  const rooms = store?.rooms ?? [];
  const [activeRoom, setActiveRoom] = useState<string>(rooms?.[0]?.id ?? '');

  const r = rooms.find((x: Room) => x?.id === activeRoom) ?? rooms?.[0];
  const nbr = r ? tomadasNbr(r) : null;

  const addTomada = () => {
    if (!r) return;
    store.addPonto(r.id, { id: uid(), h: 'baixa', d: '', cx: '4x2', mods: [{ id: uid(), t: 'T10' }] });
    toast.success('Tomada adicionada');
  };
  const addLuz = () => {
    if (!r) return;
    const luz: Luz = { id: uid(), d: '', cx: 'Redonda' };
    store.addLuz(r.id, luz);
    // auto-create simple switch
    store.addComando(r.id, { id: uid(), t: 'IS', luzes: [luz.id], sws: [{ id: uid(), h: 'media', d: '', tom: '', cx: '4x2' }] });
    toast.success('Ponto de luz adicionado');
  };

  const suggestLuzes = () => {
    if (!r) return;
    const c = parseFloat(r?.c ?? '0') || 0;
    const l = parseFloat(r?.l ?? '0') || 0;
    const ideal = luzCount(c, l);
    const current = r?.luzes?.length ?? 0;
    if (current >= ideal) { toast.info(`Este cômodo já tem ${current} luz(es), o mínimo recomendado é ${ideal}`); return; }
    const diff = ideal - current;
    for (let i = 0; i < diff; i++) addLuz();
    toast.success(`${diff} ponto(s) de luz sugerido(s)`);
  };

  if (rooms.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
        <Plug className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Adicione cômodos na etapa anterior primeiro</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Pontos elétricos</h2>
        <p className="text-muted-foreground mt-1">Adicione tomadas, luzes e interruptores em cada cômodo</p>
      </div>

      {/* Room tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {rooms.map((rm: Room) => (
          <button key={rm?.id} type="button" onClick={() => setActiveRoom(rm?.id ?? '')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-all ${
              activeRoom === rm?.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50 bg-card'
            }`}>
            <MapPin className="w-3 h-3" /> {rm?.nome || rm?.base || 'Cômodo'}
          </button>
        ))}
      </div>

      {r && (
        <div className="space-y-4">
          {/* Tomadas */}
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Plug className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Tomadas ({r?.pontos?.length ?? 0})</span>
                </div>
                <Button size="sm" variant="outline" onClick={addTomada}><Plus className="w-3 h-3 mr-1" /> Tomada</Button>
              </div>
              {(r?.pontos ?? []).map((p: Ponto, idx: number) => (
                <div key={p?.id} className="flex items-center gap-2 py-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                  <select value={(p?.mods?.[0]?.t ?? 'T10')} onChange={(e: any) => {
                    const newMods = [{ id: p?.mods?.[0]?.id ?? uid(), t: e?.target?.value ?? 'T10' }];
                    store.updatePonto(r.id, p?.id ?? '', { mods: newMods as any });
                  }} className="rounded-md border border-input bg-card px-2 py-1 text-xs">
                    <option value="T10">10A padrão</option>
                    <option value="T10D">10A dupla</option>
                    <option value="T20">20A padrão</option>
                    <option value="T20D">20A dupla</option>
                    <option value="USB">USB</option>
                  </select>
                  <select value={p?.h ?? 'baixa'} onChange={(e: any) => store.updatePonto(r.id, p?.id ?? '', { h: e?.target?.value as any })}
                    className="rounded-md border border-input bg-card px-2 py-1 text-xs">
                    <option value="baixa">Baixa (30cm)</option>
                    <option value="media">Média (110cm)</option>
                    <option value="alta">Alta (210cm)</option>
                  </select>
                  <button type="button" onClick={() => { store.removePonto(r.id, p?.id ?? ''); toast.success('Tomada removida'); }}
                    className="text-destructive hover:text-destructive/80 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {nbr && nbr.atual < nbr.minimo && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    A NBR 5410 pede no mínimo <strong>{nbr.minimo}</strong> {nbr.minimo === 1 ? 'tomada' : 'tomadas'} para este cômodo
                    (pelo tamanho e tipo). Faltam {nbr.minimo - nbr.atual}.
                  </span>
                </div>
              )}
              {!nbr && (
                <p className="mt-3 text-[11px] text-muted-foreground">Informe as medidas do cômodo para conferir o mínimo de tomadas da NBR 5410.</p>
              )}
            </CardContent>
          </Card>

          {/* Luzes */}
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-semibold">Pontos de luz ({r?.luzes?.length ?? 0})</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={suggestLuzes} className="text-xs">Sugerir</Button>
                  <Button size="sm" variant="outline" onClick={addLuz}><Plus className="w-3 h-3 mr-1" /> Luz</Button>
                </div>
              </div>
              {(r?.luzes ?? []).map((luz: Luz, idx: number) => (
                <div key={luz?.id} className="flex items-center gap-2 py-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                  <select value={luz?.cx ?? 'Redonda'} onChange={(e: any) => store.updateLuz(r.id, luz?.id ?? '', { cx: e?.target?.value as any })}
                    className="rounded-md border border-input bg-card px-2 py-1 text-xs">
                    <option value="Redonda">Caixa redonda</option>
                    <option value="4x4">Caixa 4×4</option>
                    <option value="4x2">Caixa 4×2</option>
                  </select>
                  <button type="button" onClick={() => {
                    if (luz?.id) { store.removeLuz(r.id, luz.id); toast.success('Luz removida'); }
                  }} className="text-destructive hover:text-destructive/80 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Interruptores */}
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <ToggleLeft className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Interruptores ({r?.comandos?.length ?? 0})</span>
              </div>
              {(r?.comandos ?? []).map((cmd: Comando, idx: number) => (
                <div key={cmd?.id} className="py-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                    <select value={cmd?.t ?? 'IS'} onChange={(e: any) => store.updateComando(r.id, cmd?.id ?? '', { t: e?.target?.value as any })}
                      className="rounded-md border border-input bg-card px-2 py-1 text-xs">
                      <option value="IS">Simples</option>
                      <option value="IP">Paralelo (liga de 2 pontos)</option>
                      <option value="II">Intermediário (liga de 3+ pontos)</option>
                    </select>
                    <span className="text-xs text-muted-foreground">→ {(cmd?.luzes?.length ?? 0)} luz(es)</span>
                    <button type="button" onClick={() => { store.removeComando(r.id, cmd?.id ?? ''); toast.success('Interruptor removido'); }}
                      className="text-destructive hover:text-destructive/80 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
}
