'use client';
import { useStore } from '@/lib/store-cliente';
import { uid, tomadaPadrao, ROOM_TEMPLATES, novoComodo, nomeUnico } from '@/lib/templates';
import { luzCount } from '@/lib/luz';
import { Room, Ponto, Luz, Comando, Sw, TipoComando, TipoModulo } from '@/lib/types';
import { resumoComodo, modulosDe, modulosSw, caixaPorModulos } from '@/lib/resumo-comodo';
import { tomadasNbr, semNegativo } from '@/lib/validacao';
import { gruposTeclas } from '@/lib/nbr5410-regras';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plug, Lightbulb, ToggleLeft, Plus, Trash2, MapPin, AlertTriangle, ClipboardList } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';

const TIPOS_TOMADA: { v: TipoModulo; label: string }[] = [
  { v: 'T10', label: 'Simples 10A' }, { v: 'T10D', label: 'Dupla 10A' }, { v: 'T10T', label: 'Tripla 10A' },
  { v: 'T20', label: 'Simples 20A' }, { v: 'T20D', label: 'Dupla 20A' }, { v: 'T20T', label: 'Tripla 20A' },
  { v: 'USB', label: 'USB' },
];
const TOMADA_JUNTO: { v: TipoModulo | ''; label: string }[] = [
  { v: '', label: 'Sem tomada junto' }, { v: 'T10', label: '+ 10A simples' }, { v: 'T10D', label: '+ 10A dupla' },
  { v: 'T20', label: '+ 20A simples' }, { v: 'T20D', label: '+ 20A dupla' },
];
const NOME_CMD: Record<TipoComando, string> = { IS: 'Simples', IP: 'Paralelo', II: 'Intermediário' };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default function StepPontos() {
  const store = useStore();
  const rooms = store?.rooms ?? [];
  // Cômodo ativo fica no store: a prévia pode abrir este passo já no cômodo certo.
  const activeRoom = rooms.some((x: Room) => x?.id === store.activeRoomId) ? store.activeRoomId : (rooms?.[0]?.id ?? '');
  const setActiveRoom = (id: string) => store.setActiveRoomId(id);

  const r = rooms.find((x: Room) => x?.id === activeRoom) ?? rooms?.[0];
  const nbr = r ? tomadasNbr(r) : null;

  const novoSw = (d = ''): Sw => ({ id: uid(), h: 'media', d, tom: '', cx: '4x2' });
  const sugestaoParalelo = (rm: Room) => Math.round((parseFloat(rm?.pe ?? '') || 2.8) * 2 * 10) / 10;

  const addTomada = () => {
    if (!r) return;
    const t = tomadaPadrao(`${r.base ?? ''} ${r.nome ?? ''}`);
    store.addPonto(r.id, { id: uid(), h: 'baixa', d: '', cx: caixaPorModulos(modulosDe(t)), mods: [{ id: uid(), t }] });
    toast.success('Tomada adicionada');
  };
  const novoComandoIS = (): Comando => ({ id: uid(), t: 'IS', luzes: [], sws: [novoSw()] });
  /** Nova luz já vinculada: sem interruptor cria um simples; com 1 ou mais, liga ao último. */
  const addLuz = () => {
    if (!r) return;
    store.addLuzVinculada(r.id, { id: uid(), d: '', cx: 'Redonda' }, novoComandoIS);
  };
  /** Select "Interruptor:" da luz — '__novo__' cria um interruptor simples e liga a luz a ele. */
  const trocarInterruptorDaLuz = (luzId: string, valor: string) => {
    if (!r) return;
    if (valor === '__novo__') {
      const cmd = novoComandoIS();
      store.addComando(r.id, cmd);
      store.vincularLuzComando(r.id, luzId, cmd.id);
      toast.success('Interruptor adicionado');
      return;
    }
    store.vincularLuzComando(r.id, luzId, valor);
  };
  /** Checkbox "Com tomada na mesma placa": grava comTomada e põe/tira a tomada 10A na 1ª caixa. */
  const setComTomada = (cmd: Comando, marcado: boolean) => {
    if (!r) return;
    store.updateComando(r.id, cmd.id, { comTomada: marcado });
    const sw = cmd.sws?.[0];
    if (!sw) return;
    if (marcado && !sw.tom) store.updateSw(r.id, cmd.id, sw.id, { tom: 'T10', cx: caixaPorModulos(modulosSw('T10')) });
    if (!marcado && sw.tom) store.updateSw(r.id, cmd.id, sw.id, { tom: '', cx: caixaPorModulos(modulosSw('')) });
  };
  const addInterruptor = () => {
    if (!r) return;
    store.addComando(r.id, { id: uid(), t: 'IS', luzes: [], sws: [novoSw()] });
    toast.success('Interruptor adicionado');
  };
  const mudarTipo = (cmd: Comando, t: TipoComando) => {
    if (!r) return;
    const d = t === 'IP' ? String(sugestaoParalelo(r)) : '';
    store.setTipoComando(r.id, cmd.id, t, () => novoSw(d));
    // Paralelo: se a 2ª caixa já existia sem distância, grava a sugestão (editável)
    if (t === 'IP') {
      const atual = useStore.getState().rooms.find((x) => x.id === r.id)?.comandos.find((c) => c.id === cmd.id);
      const sw2 = atual?.sws?.[1];
      if (sw2 && !sw2.d) store.updateSw(r.id, cmd.id, sw2.id, { d });
    }
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

  // "+ Cômodo": cria um cômodo novo sem sair desta etapa (com medidas, para as tomadas da NBR 5410).
  const [novoAberto, setNovoAberto] = useState(false);
  const [novoModelo, setNovoModelo] = useState(0);
  const [novoNome, setNovoNome] = useState('');
  const [novoC, setNovoC] = useState('');
  const [novoL, setNovoL] = useState('');
  const abrirNovo = () => {
    setNovoModelo(0); setNovoNome(nomeUnico(ROOM_TEMPLATES[0].create().nome, rooms)); setNovoC(''); setNovoL('');
    setNovoAberto(true);
  };
  const trocarModelo = (i: number) => {
    setNovoModelo(i);
    setNovoNome(nomeUnico(ROOM_TEMPLATES[i].create().nome, rooms));
  };
  const medidasOk = (parseFloat(novoC) || 0) > 0 && (parseFloat(novoL) || 0) > 0;
  const criarComodo = () => {
    if (!medidasOk) { toast.error('Informe comprimento e largura maiores que zero'); return; }
    const room = novoComodo(ROOM_TEMPLATES[novoModelo] ?? ROOM_TEMPLATES[0], rooms, { nome: novoNome, c: novoC, l: novoL });
    store.addRoom(room);
    setActiveRoom(room.id); // a aba do cômodo novo já abre
    setNovoAberto(false);
    toast.success(`${room.nome} adicionado`);
  };

  const cmdDaLuz = (luzId: string) => (r?.comandos ?? []).find((c: Comando) => (c?.luzes ?? []).includes(luzId));
  const resumo = r ? resumoComodo(r) : null;
  const selCls = 'rounded-md border border-input bg-card px-2 py-1 text-xs';

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
        <button type="button" onClick={() => (novoAberto ? setNovoAberto(false) : abrirNovo())} aria-label="Adicionar cômodo"
          className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border border-dashed transition-all ${novoAberto ? 'border-primary text-primary bg-primary/5' : 'border-primary/50 text-primary hover:bg-primary/5'}`}>
          <Plus className="w-3 h-3" /> Cômodo
        </button>
      </div>

      {novoAberto && (
        <Card className="shadow-sm border-primary/40">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-semibold">Novo cômodo</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Modelo</Label>
                <select value={novoModelo} onChange={(ev: any) => trocarModelo(parseInt(ev?.target?.value, 10) || 0)}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                  {ROOM_TEMPLATES.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={novoNome} onChange={(ev: any) => setNovoNome(ev?.target?.value ?? '')} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Comprimento (m)</Label>
                <Input type="number" step="0.1" min="0" value={novoC} onChange={(ev: any) => setNovoC(semNegativo(ev?.target?.value))} placeholder="0.0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Largura (m)</Label>
                <Input type="number" step="0.1" min="0" value={novoL} onChange={(ev: any) => setNovoL(semNegativo(ev?.target?.value))} placeholder="0.0" className="mt-1" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">As medidas são necessárias para calcular as tomadas pela NBR 5410.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNovoAberto(false)}>Cancelar</Button>
              <Button size="sm" onClick={criarComodo} disabled={!medidasOk}>Criar cômodo</Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                    const t = (e?.target?.value ?? 'T10') as TipoModulo;
                    const newMods = [{ id: p?.mods?.[0]?.id ?? uid(), t }];
                    store.updatePonto(r.id, p?.id ?? '', { mods: newMods, cx: caixaPorModulos(modulosDe(t)) });
                  }} className={selCls}>
                    {TIPOS_TOMADA.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <select value={p?.h ?? 'baixa'} onChange={(e: any) => store.updatePonto(r.id, p?.id ?? '', { h: e?.target?.value as any })}
                    className="rounded-md border border-input bg-card px-2 py-1 text-xs">
                    <option value="baixa">Baixa (30cm)</option>
                    <option value="media">Média (110cm)</option>
                    <option value="alta">Alta (210cm)</option>
                  </select>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {plural((p?.mods ?? []).reduce((a, m) => a + modulosDe(m?.t), 0), 'módulo', 'módulos')} · cx {p?.cx ?? '4x2'}
                  </span>
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
              {(r?.luzes ?? []).map((luz: Luz, idx: number) => {
                const cmd = cmdDaLuz(luz?.id ?? '');
                const cmdIdx = cmd ? (r?.comandos ?? []).indexOf(cmd) : -1;
                return (
                  <div key={luz?.id} className="py-2 border-t border-border/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                      <select value={luz?.cx ?? 'Redonda'} onChange={(e: any) => store.updateLuz(r.id, luz?.id ?? '', { cx: e?.target?.value as any })}
                        className={selCls}>
                        <option value="Redonda">Caixa redonda</option>
                        <option value="4x4">Caixa 4×4</option>
                        <option value="4x2">Caixa 4×2</option>
                      </select>
                      <span className="text-xs text-muted-foreground">Interruptor:</span>
                      <select value={cmd?.id ?? ''} onChange={(e: any) => trocarInterruptorDaLuz(luz?.id ?? '', e?.target?.value ?? '')}
                        className={selCls}>
                        {!cmd && <option value="">Nenhum</option>}
                        {(r?.comandos ?? []).map((c: Comando, i: number) => (
                          <option key={c?.id} value={c?.id}>Interruptor {i + 1} ({NOME_CMD[c?.t ?? 'IS']})</option>
                        ))}
                        <option value="__novo__">Novo interruptor</option>
                      </select>
                      <button type="button" onClick={() => {
                        if (luz?.id) {
                          const cmdDaLuz = (r?.comandos ?? []).find((c: Comando) => (c?.luzes ?? []).includes(luz.id));
                          const someInterruptor = !!cmdDaLuz && cmdDaLuz.luzes.length === 1 && !cmdDaLuz.comTomada && !(cmdDaLuz.sws ?? []).some((sw: Sw) => sw?.tom);
                          store.removeLuz(r.id, luz.id);
                          toast.success(someInterruptor ? 'Luz e interruptor sem uso removidos' : 'Luz removida');
                        }
                      }} className="text-destructive hover:text-destructive/80 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    {cmdIdx < 0 && (
                      <p className="mt-1 ml-8 flex items-center gap-1 text-[11px] text-amber-700">
                        <AlertTriangle className="w-3 h-3" /> Esta luz ainda não tem interruptor
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Interruptores */}
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ToggleLeft className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Interruptores ({r?.comandos?.length ?? 0})</span>
                </div>
                <Button size="sm" variant="outline" onClick={addInterruptor}><Plus className="w-3 h-3 mr-1" /> Interruptor</Button>
              </div>
              {(r?.comandos ?? []).map((cmd: Comando, idx: number) => (
                <div key={cmd?.id} className="py-2 border-t border-border/50 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                    <select value={cmd?.t ?? 'IS'} onChange={(e: any) => mudarTipo(cmd, e?.target?.value as TipoComando)}
                      className={selCls}>
                      <option value="IS">Simples</option>
                      <option value="IP">Paralelo (liga de 2 pontos)</option>
                      <option value="II">Intermediário (liga de 3+ pontos)</option>
                    </select>
                    <span className="text-xs text-muted-foreground">→ {plural(cmd?.luzes?.length ?? 0, 'luz', 'luzes')}</span>
                    <span className="text-[11px] text-muted-foreground">
                      · placa {gruposTeclas(cmd?.luzes?.length ?? 0).map((n) => `${n} ${n === 1 ? 'tecla' : 'teclas'}`).join(' + ')}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" className="accent-primary" checked={!!cmd?.comTomada || !!cmd?.sws?.[0]?.tom}
                        onChange={(e: any) => setComTomada(cmd, !!e?.target?.checked)} />
                      Com tomada na mesma placa
                    </label>
                    <button type="button" onClick={() => { store.removeComando(r.id, cmd?.id ?? ''); toast.success('Interruptor removido'); }}
                      className="text-destructive hover:text-destructive/80 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>

                  <div className="ml-8">
                    <p className="text-[11px] text-muted-foreground mb-1">Luzes que este interruptor comanda:</p>
                    {(r?.luzes?.length ?? 0) === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">Adicione pontos de luz acima para vincular.</p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {(r?.luzes ?? []).map((luz: Luz, li: number) => {
                          const marcada = (cmd?.luzes ?? []).includes(luz?.id ?? '');
                          return (
                            <label key={luz?.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="checkbox" className="accent-primary" checked={marcada}
                                onChange={() => store.vincularLuzComando(r.id, luz?.id ?? '', marcada ? '' : (cmd?.id ?? ''))} />
                              Luz {li + 1}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {(cmd?.luzes?.length ?? 0) === 0 && (r?.luzes?.length ?? 0) > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                        <AlertTriangle className="w-3 h-3" /> Nenhuma luz vinculada
                      </p>
                    )}
                  </div>

                  {cmd?.t === 'IP' && cmd?.sws?.[1] && (
                    <div className="ml-8 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Distância entre os interruptores (m):</span>
                      <Input type="number" step="0.1" min="0" value={cmd.sws[1].d ?? ''} placeholder={String(sugestaoParalelo(r))}
                        onChange={(e: any) => store.updateSw(r.id, cmd.id, cmd.sws[1].id, { d: semNegativo(e?.target?.value) })}
                        className="h-7 w-24 text-xs" />
                      <span className="text-[11px] text-muted-foreground">sugestão: {sugestaoParalelo(r)} m (pé-direito × 2, subida + descida)</span>
                    </div>
                  )}

                  <div className="ml-8 space-y-1">
                    {(cmd?.sws ?? []).map((sw: Sw, si: number) => {
                      const mods = modulosSw(sw?.tom);
                      return (
                        <div key={sw?.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs w-12">Sw {si + 1}</span>
                          <select value={sw?.tom ?? ''} onChange={(e: any) => {
                            const tom = (e?.target?.value ?? '') as TipoModulo | '';
                            store.updateSw(r.id, cmd.id, sw.id, { tom, cx: caixaPorModulos(modulosSw(tom)) });
                          }} className={selCls}>
                            {TOMADA_JUNTO.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                          </select>
                          <span className="text-[11px] text-muted-foreground">{plural(mods, 'módulo', 'módulos')} · cx {sw?.cx ?? '4x2'}</span>
                          {cmd?.t === 'II' && si >= 3 && (
                            <button type="button" onClick={() => store.removeSw(r.id, cmd.id, sw.id)}
                              className="text-destructive hover:text-destructive/80"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      );
                    })}
                    {cmd?.t === 'II' && (
                      <button type="button" onClick={() => store.addSw(r.id, cmd.id, novoSw())}
                        className="text-[11px] text-primary hover:underline">+ ponto intermediário</button>
                    )}
                  </div>
                </div>
              ))}
              {(r?.comandos?.length ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground">Nenhum interruptor. Clique em “+ Interruptor” e escolha as luzes que ele comanda.</p>
              )}
            </CardContent>
          </Card>

          {/* Resumo gratuito do cômodo (dados locais) */}
          {resumo && (
            <Card className="shadow-sm bg-muted/30">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Resumo do cômodo</span>
                </div>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>{plural(r?.pontos?.length ?? 0, 'ponto de tomada', 'pontos de tomada')} ({plural(resumo.nModulos, 'módulo', 'módulos')}, {plural(resumo.nTomadas, 'tomada', 'tomadas')} no total)</li>
                  <li>{plural(resumo.nLuzes, 'ponto de luz', 'pontos de luz')}</li>
                  <li>{plural(resumo.nInterruptores, 'interruptor', 'interruptores')}: {resumo.nIS} simples, {resumo.nIP} paralelo, {resumo.nII} intermediário</li>
                  <li>{plural(resumo.nCaixas4x2, 'caixa 4x2', 'caixas 4x2')}, {plural(resumo.nCaixas4x4, 'caixa 4x4', 'caixas 4x4')}</li>
                </ul>
                {resumo.pendencias.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {resumo.pendencias.map((p, i) => (
                      <li key={i} className="flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle className="w-3 h-3" /> {p}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </motion.div>
  );
}
