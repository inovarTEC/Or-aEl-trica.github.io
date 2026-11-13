'use client';
import { useStore } from '@/lib/store-cliente';
import { ROOM_TEMPLATES, novoComodo } from '@/lib/templates';
import { semNegativo } from '@/lib/validacao';
import { Room } from '@/lib/types';
import { qtdTomadasAuto } from '@/lib/tomadas-auto';
import { perimetro } from '@/lib/nbr5410-regras';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Bed, Sofa, CookingPot, Bath, WashingMachine, Plus, Trash2, ChevronDown, ChevronUp, Ruler, MapPin, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const ICONS: Record<string, any> = { Bed, Sofa, CookingPot, Bath, WashingMachine, Plus };

export default function StepComodos() {
  const store = useStore();
  const rooms = store?.rooms ?? [];
  const [showTemplates, setShowTemplates] = useState(rooms.length === 0);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Detalhes avançados começam abertos em todos os cômodos (o usuário pode recolher).
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});

  const addFromTemplate = (tpl: typeof ROOM_TEMPLATES[0]) => {
    const room = novoComodo(tpl, rooms);
    store.addRoom(room);
    // O cômodo novo aparece primeiro e já aberto; os outros ficam fechados (só um aberto por vez).
    setExpanded(room.id);
    setShowTemplates(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success(`${room.nome} adicionado`);
  };

  const handleRemove = (r: Room) => {
    const nEquips = (store?.equips ?? []).filter((e) => e?.room === r?.id).length;
    const hasData = (r?.pontos?.length ?? 0) > 0 || (r?.luzes?.length ?? 0) > 0 || nEquips > 0;
    if (hasData) {
      const extra = nEquips > 0 ? ` e ${nEquips === 1 ? '1 equipamento' : `${nEquips} equipamentos`}` : '';
      if (!confirm(`Remover "${r?.nome || r?.base}"? Os pontos, luzes${extra} deste cômodo serão perdidos.`)) return;
    }
    store.removeRoom(r?.id ?? '');
    toast.success('Cômodo removido');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Cômodos</h2>
        <p className="text-muted-foreground mt-1">Adicione os cômodos e informe as medidas</p>
        <p className="text-xs text-muted-foreground mt-1">As tomadas dos modelos aumentam sozinhas se o cômodo for maior (NBR 5410, pelo perímetro).</p>
      </div>

      {/* Botão fixo no topo da lista: não precisa rolar a página para adicionar outro cômodo */}
      {rooms.length > 0 && (
        <Button variant={showTemplates ? 'secondary' : 'outline'} className="w-full" onClick={() => setShowTemplates((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" /> {showTemplates ? 'Fechar modelos' : 'Adicionar cômodo'}
        </Button>
      )}

      {/* Templates */}
      {(showTemplates || rooms.length === 0) && (
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm font-semibold mb-3">Escolha um modelo pronto ou comece do zero</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ROOM_TEMPLATES.map((tpl) => {
                const Ic = ICONS[tpl.icon] ?? Plus;
                return (
                  <button key={tpl.label} type="button" onClick={() => addFromTemplate(tpl)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-center">
                    <Ic className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">{tpl.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{tpl.desc}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista: o mais novo primeiro. Só na tela — a ordem guardada (abas, circuitos, PDF) não muda. */}
      <AnimatePresence mode="popLayout">
        {[...rooms].reverse().map((r: Room) => (
          <motion.div key={r?.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <Card className="shadow-sm">
              <CardContent className="pt-4 pb-4">
                <button type="button" onClick={() => setExpanded(expanded === r?.id ? null : r?.id ?? '')}
                  className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold">{r?.nome || r?.base || 'Cômodo'}</p>
                      <p className="text-xs text-muted-foreground">
                        {r?.c && r?.l ? `${r.c}m × ${r.l}m` : 'Medidas pendentes'}
                        {' · '}{plural(r?.pontos?.length ?? 0, 'tomada', 'tomadas')} · {plural(r?.luzes?.length ?? 0, 'luz', 'luzes')}
                      </p>
                    </div>
                  </div>
                  {expanded === r?.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {expanded === r?.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Nome</Label>
                        <Input value={r?.nome ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { nome: e?.target?.value ?? '' })} placeholder="Ex: Quarto principal" className="mt-1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs flex items-center gap-1"><Ruler className="w-3 h-3" /> Comprimento (m)</Label>
                        <Input type="number" step="0.1" min="0" value={r?.c ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { c: semNegativo(e?.target?.value) })} placeholder="0.0" className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs flex items-center gap-1"><Ruler className="w-3 h-3" /> Largura (m)</Label>
                        <Input type="number" step="0.1" min="0" value={r?.l ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { l: semNegativo(e?.target?.value) })} placeholder="0.0" className="mt-1" />
                      </div>
                    </div>

                    {qtdTomadasAuto(r) > 0 && (
                      <p className="text-xs rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
                        {plural(qtdTomadasAuto(r), 'tomada adicionada', 'tomadas adicionadas')} automaticamente pela NBR 5410
                        (perímetro de {perimetro(parseFloat(r?.c ?? '') || 0, parseFloat(r?.l ?? '') || 0).toFixed(1)} m).
                        Se diminuir o cômodo, elas saem sozinhas. Ajuste ou remova no passo Pontos.
                      </p>
                    )}

                    {/* Route to panel */}
                    <div>
                      <Label className="text-xs">De onde vem a fiação deste cômodo?</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button type="button" onClick={() => store.updateRoom(r?.id ?? '', { via: '' })}
                          className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${!r?.via ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                          Direto do quadro
                        </button>
                        <button type="button" onClick={() => {
                          const others = rooms.filter((x: Room) => x?.id !== r?.id);
                          if (others.length === 0) { toast.error('Adicione outro cômodo primeiro'); return; }
                          store.updateRoom(r?.id ?? '', { via: others[0]?.id ?? '' });
                        }}
                          className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${r?.via ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                          Pelo caminho de outro
                        </button>
                      </div>
                    </div>

                    {!r?.via ? (
                      <div>
                        <Label className="text-xs">Distância até o quadro elétrico (m)</Label>
                        <Input type="number" step="0.1" min="0" value={r?.dq ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { dq: semNegativo(e?.target?.value) })} placeholder="Estimativa em metros" className="mt-1" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Segue o caminho de qual cômodo?</Label>
                          <select value={r?.via ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { via: e?.target?.value ?? '' })}
                            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                            {rooms.filter((x: Room) => x?.id !== r?.id).map((x: Room) => (
                              <option key={x?.id} value={x?.id ?? ''}>{x?.nome || x?.base || 'Cômodo'}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Trecho compartilhado (m)</Label>
                            <Input type="number" step="0.1" min="0" value={r?.dd ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { dd: semNegativo(e?.target?.value) })} placeholder="0.0" className="mt-1" />
                          </div>
                          <div>
                            <Label className="text-xs">Desvio até aqui (m)</Label>
                            <Input type="number" step="0.1" min="0" value={r?.dr ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { dr: semNegativo(e?.target?.value) })} placeholder="0.0" className="mt-1" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Advanced */}
                    <Collapsible open={advancedOpen[r?.id ?? ''] ?? true} onOpenChange={(o: boolean) => setAdvancedOpen((p) => ({ ...p, [r?.id ?? '']: o }))}>
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline transition-colors">
                          <Settings2 className="w-3 h-3" /> Detalhes avançados
                          {(advancedOpen[r?.id ?? ''] ?? true) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-3">
                        <div>
                          <Label className="text-xs">Tipo de instalação</Label>
                          <select value={r?.inst ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { inst: e?.target?.value as any })}
                            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                            <option value="">Selecione...</option>
                            <option value="Embutida na parede">Embutida na parede</option>
                            <option value="Aparente">Aparente (sobrepor)</option>
                            <option value="Pela laje">Pela laje / forro</option>
                          </select>
                        </div>
                        {r?.inst === 'Aparente' && (
                          <div>
                            <Label className="text-xs">Material aparente</Label>
                            <select value={r?.materialAparente ?? 'canaleta'} onChange={(e: any) => store.updateRoom(r?.id ?? '', { materialAparente: e?.target?.value as any })}
                              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                              <option value="canaleta">Canaleta (peças de 2 m)</option>
                              <option value="eletroduto_metro">Eletroduto rígido (em metros)</option>
                              <option value="eletroduto_peca3m">Eletroduto rígido (peças de 3 m)</option>
                            </select>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Pé-direito (m)</Label>
                            <Input type="number" step="0.1" min="0" value={r?.pe ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { pe: semNegativo(e?.target?.value) })} className="mt-1" />
                          </div>
                          <div>
                            <Label className="text-xs">Distância padrão entre pontos (m)</Label>
                            <Input type="number" step="0.1" min="0" value={r?.dpad ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { dpad: semNegativo(e?.target?.value) })} className="mt-1" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Observações</Label>
                          <Input value={r?.obs ?? ''} onChange={(e: any) => store.updateRoom(r?.id ?? '', { obs: e?.target?.value ?? '' })} placeholder="Notas adicionais..." className="mt-1" />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <div className="flex justify-end">
                      <Button variant="destructive" size="sm" onClick={() => handleRemove(r)}>
                        <Trash2 className="w-3 h-3 mr-1" /> Remover
                      </Button>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

    </motion.div>
  );
}
