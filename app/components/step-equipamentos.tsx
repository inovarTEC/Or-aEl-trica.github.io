'use client';
import { useStore } from '@/lib/store-cliente';
import { uid } from '@/lib/templates';
import { semNegativo } from '@/lib/validacao';
import { POTENCIAS_TIPICAS, AC_BTU_OPTIONS, BOMBA_CV_OPTIONS, btuParaWatts, cvParaWatts } from '@/lib/nbr5410-regras';
import { Equip, Room, TipoEquip, Tensao } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Zap, Cpu, AlertTriangle, ClipboardList, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { infoUf } from '@/lib/tensao-por-uf';
import { PONTO_LABEL, PontoEquip, pontoSugerido, distanciaEquip, resumoPonto, correnteEquip, avisoCorrente, faltasEquip, resumoLinhaEquip } from '@/lib/ponto-equip';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CircuitosCard from './circuitos-card';
import { toast } from 'sonner';

const EQUIP_TIPOS: { value: TipoEquip; label: string }[] = [
  { value: 'Chuveiro elétrico', label: 'Chuveiro elétrico' },
  { value: 'Torneira elétrica', label: 'Torneira elétrica' },
  { value: 'Ar-condicionado', label: 'Ar-condicionado' },
  { value: 'Forno elétrico', label: 'Forno elétrico' },
  { value: 'Cooktop elétrico', label: 'Cooktop elétrico' },
  { value: 'Máquina de lavar', label: 'Máquina de lavar' },
  { value: 'Secadora', label: 'Secadora' },
  { value: 'Aquecedor', label: 'Aquecedor' },
  { value: 'Bomba', label: 'Bomba d\'água' },
  { value: 'Carregador de veículo elétrico', label: 'Carregador de veículo elétrico' },
  { value: 'Outro', label: 'Outro equipamento' },
];

export default function StepEquipamentos() {
  const store = useStore();
  const equips = store?.equips ?? [];
  const rooms = store?.rooms ?? [];
  // Rede 220/127 V (escolhida na entrada ou pela UF; sem informação adota 220/127): 380 V não existe.
  const ent = store?.entrada;
  const rede380 = ent?.sistemaTensao === '380/220' || (ent?.sistemaTensao !== '220/127' && infoUf(ent?.uf)?.tensao === '380/220');
  useEffect(() => {
    if (rede380) return;
    for (const q of equips) if (q?.tens === '380V') store.updateEquip(q.id, { tens: '220V' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rede380, equips]);

  // Só um cartão aberto por vez; os demais ficam numa linha-resumo.
  const [aberto, setAberto] = useState<string | null>(null);

  const addEquip = () => {
    const id = uid();
    store.addEquip({
      id, tipo: '', room: '', pot: '', tens: '', dint: '', dist: '', alim: '', cx: '4x2',
    });
    setAberto(id); // o novo abre (aparece no topo) e os anteriores recolhem sozinhos
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success('Equipamento adicionado');
  };

  // Orçamentos antigos: equipamento sem caixa recebe 4x2 (padrão), para a tela e a prévia contarem igual.
  useEffect(() => {
    for (const e of equips) if (!e?.cx) store.updateEquip(e.id, { cx: '4x2' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equips.length]);

  // Vindo de uma pendência da prévia: rola até o equipamento indicado e limpa a marcação.
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    const id = store.activeEquipId;
    if (!id) return;
    setAberto(id); // a pendência da prévia abre o cartão certo
    const t = setTimeout(() => {
      refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      store.setActiveEquipId('');
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selCls = 'mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Equipamentos especiais</h2>
        <p className="text-muted-foreground mt-1">Aparelhos que precisam de circuito próprio (chuveiro, ar-condicionado, etc.)</p>
      </div>

      {/* Botão no topo: o equipamento novo entra primeiro, já aberto */}
      <Button variant="outline" className="w-full" onClick={addEquip}>
        <Plus className="w-4 h-4 mr-2" /> Adicionar equipamento
      </Button>

      <AnimatePresence mode="popLayout">
        {equips.map((e: Equip, idx: number) => ({ e, idx })).reverse().map(({ e, idx }: { e: Equip; idx: number }) => (
          <motion.div key={e?.id} ref={(el: HTMLDivElement | null) => { refs.current[e?.id] = el; }} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <Card className="shadow-sm">
              <CardContent className="pt-4 pb-4 space-y-3">
                {(() => {
                  const faltas = faltasEquip(e);
                  const aberta = aberto === e?.id;
                  return (
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setAberto(aberta ? null : (e?.id ?? null))} aria-expanded={aberta}
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left">
                        <div className="flex items-center gap-2 min-w-0">
                          <Cpu className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">Equipamento {idx + 1}</p>
                            {!aberta && (
                              <p className="text-xs text-muted-foreground truncate">{resumoLinhaEquip(e, rooms)}</p>
                            )}
                            {!aberta && faltas.length > 0 && (
                              <p className="flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle className="w-3 h-3" /> Incompleto: falta {faltas.join(', ')}</p>
                            )}
                          </div>
                        </div>
                        {aberta ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </button>
                      <button type="button" aria-label="Remover equipamento" onClick={() => {
                        store.removeEquip(e?.id ?? '');
                        if (aberto === e?.id) setAberto(null);
                        toast.success('Equipamento removido');
                      }}
                        className="text-destructive hover:text-destructive/80 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })()}

                {aberto === e?.id && (<>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <select value={e?.tipo ?? ''} onChange={(ev: any) => {
                      const tipo = ev?.target?.value as TipoEquip;
                      // Pré-preenche potência/tensão típicas só nos campos que o usuário ainda não preencheu
                      const tip = POTENCIAS_TIPICAS[tipo];
                      store.updateEquip(e?.id ?? '', {
                        tipo,
                        ...(tip && !e?.pot ? { pot: String(tip.pot) } : {}),
                        ...(tip && !e?.tens ? { tens: `${tip.tens}V` as Tensao } : {}),
                      });
                    }}
                      className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                      <option value="">Selecione...</option>
                      {EQUIP_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Cômodo <span className="text-destructive">*</span></Label>
                    <select value={e?.room ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { room: ev?.target?.value ?? '' })}
                      className={`${selCls} ${!e?.room ? 'border-destructive' : ''}`}>
                      <option value="">Selecione o cômodo</option>
                      {rooms.map((rm: Room) => <option key={rm?.id} value={rm?.id ?? ''}>{rm?.nome || rm?.base || 'Cômodo'}</option>)}
                    </select>
                    {!e?.room && <p className="mt-1 text-[11px] text-destructive">Informe o cômodo do equipamento</p>}
                  </div>
                </div>

                {(e?.tipo === 'Ar-condicionado' || e?.tipo === 'Bomba') && (
                  <div>
                    <Label className="text-xs">{e?.tipo === 'Bomba' ? 'Potência da bomba (CV)' : 'Capacidade (BTU/h)'}</Label>
                    <select defaultValue="" className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                      onChange={(ev: any) => {
                        const v = parseFloat(ev?.target?.value);
                        if (!v) return;
                        const w = e?.tipo === 'Bomba' ? cvParaWatts(v) : btuParaWatts(v);
                        store.updateEquip(e?.id ?? '', { pot: String(w) });
                      }}>
                      <option value="">Selecione para preencher a potência…</option>
                      {(e?.tipo === 'Bomba' ? BOMBA_CV_OPTIONS : AC_BTU_OPTIONS).map((v) => (
                        <option key={v} value={v}>
                          {e?.tipo === 'Bomba' ? `${String(v).replace('.', ',')} CV (≈ ${cvParaWatts(v)} W)` : `${v.toLocaleString('pt-BR')} BTU/h (≈ ${btuParaWatts(v)} W)`}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-muted-foreground">Preenche a potência em watts; você pode ajustar o valor abaixo.</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Potência (W)</Label>
                    <Input type="number" min="0" value={e?.pot ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { pot: semNegativo(ev?.target?.value) })} placeholder="Ex: 5500" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Tensão</Label>
                    <select value={e?.tens ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { tens: ev?.target?.value as Tensao })}
                      className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                      <option value="">Selecione</option>
                      <option value="127V">127V</option>
                      <option value="220V">220V</option>
                      <option value="380V" disabled={!rede380}>380V (só rede 380/220)</option>
                    </select>
                    {!rede380 && <p className="mt-1 text-[11px] text-muted-foreground">Rede 220/127 V — 380 V não disponível</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Distância ao quadro (m)</Label>
                    <Input type="number" step="0.1" min="0" value={e?.dist ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { dist: semNegativo(ev?.target?.value) })} placeholder="0.0" className="mt-1" />
                  </div>
                </div>
                {(() => {
                  const I = correnteEquip(e?.pot, e?.tens, e?.tipo);
                  if (I === null) return null;
                  const av = avisoCorrente(I);
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground">Corrente estimada: {I.toFixed(1).replace('.', ',')} A</span>
                      {av === 'prefira20A' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Prefira tomada 20A ou ligação direta</span>
                      )}
                      {av === 'ligacaoDireta' && (
                        <>
                          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">Recomendado: ligação direta (Wago/emenda)</span>
                          {e?.ponto !== 'emenda' && e?.ponto !== 'borne' && (
                            <button type="button" onClick={() => store.updateEquip(e?.id ?? '', { ponto: 'emenda', cx: '4x2' })}
                              className="text-primary hover:underline">usar sugestão</button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <Label className="text-xs" title="Percurso do ponto de chegada no cômodo até onde o equipamento está instalado">Distância dentro do cômodo (m)</Label>
                    <Input type="number" step="0.1" min="0" value={e?.dint ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { dint: semNegativo(ev?.target?.value) })} placeholder="0" className="mt-1" />
                  </div>
                  <p className="col-span-2 self-end pb-2 text-[11px] text-muted-foreground">
                    Percurso do ponto de chegada no cômodo até onde o equipamento está instalado.
                  </p>
                </div>
                {(() => {
                  const dst = distanciaEquip(e, rooms);
                  return dst.origem === 'nenhuma' ? (
                    <p className="flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle className="w-3 h-3" /> Informe o cômodo ou a distância ao quadro</p>
                  ) : dst.origem === 'comodo' ? (
                    <p className="text-[11px] text-muted-foreground">Distância considerada: {dst.metros} m (trajeto do cômodo + distância dentro do cômodo)</p>
                  ) : null;
                })()}

                <div>
                  <p className="text-xs font-semibold mb-1">Configuração do ponto</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Caixa</Label>
                      <select value={e?.cx ?? '4x2'} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { cx: ev?.target?.value as '4x2' | '4x4' })} className={selCls}>
                        <option value="4x2">4x2</option>
                        <option value="4x4">4x4</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Ponto</Label>
                      <select value={e?.ponto ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { ponto: (ev?.target?.value || undefined) as PontoEquip | undefined })} className={selCls}>
                        <option value="">Selecione</option>
                        {(Object.keys(PONTO_LABEL) as PontoEquip[]).map((k) => <option key={k} value={k}>{PONTO_LABEL[k]}</option>)}
                      </select>
                      {(() => {
                        const sug = pontoSugerido(e?.tipo ?? '', e?.pot, e?.tens);
                        return sug && e?.ponto !== sug ? (
                          <button type="button" onClick={() => store.updateEquip(e?.id ?? '', { ponto: sug })}
                            className="mt-1 text-[11px] text-primary hover:underline">Sugestão: {PONTO_LABEL[sug]} (usar)</button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>

                {e?.tipo === 'Ar-condicionado' && (
                  <div>
                    <Label className="text-xs">Alimentação</Label>
                    <div className="flex gap-2 mt-1">
                      {(['Unidade externa', 'Unidade interna'] as const).map((v) => (
                        <button key={v} type="button" onClick={() => store.updateEquip(e?.id ?? '', { alim: v })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${e?.alim === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  const rp = resumoPonto(e);
                  return (
                    <div className="rounded-md bg-muted/40 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-xs font-semibold mb-1"><ClipboardList className="w-3.5 h-3.5 text-primary" /> Resumo do ponto</p>
                      <ul className="text-[11px] text-muted-foreground space-y-0.5">
                        <li>Caixa: {rp.caixa}</li>
                        <li>Ponto: {rp.ponto}</li>
                        <li>{rp.caixas} caixa</li>
                      </ul>
                    </div>
                  );
                })()}

                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setAberto(null)}><Check className="w-3.5 h-3.5 mr-1" /> Concluir</Button>
                </div>
                </>)}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {equips.length === 0 && (
        <div className="text-center py-8">
          <Zap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum equipamento especial adicionado</p>
          <p className="text-xs text-muted-foreground mt-1">Se não tiver chuveiro, ar-condicionado etc., pode pular esta etapa</p>
        </div>
      )}

      <CircuitosCard />
    </motion.div>
  );
}
