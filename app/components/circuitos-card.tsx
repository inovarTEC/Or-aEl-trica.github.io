'use client';
import { useEffect, useMemo, useState } from 'react';
import { CircuitBoard, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useStore } from '@/lib/store-cliente';
import { aceitaMisto, classeCircuito, configPadrao, tomadasCompativeis } from '@/lib/circuitos-config';
import { semNegativo } from '@/lib/validacao';
import { uid } from '@/lib/templates';
import type { CircuitoManual, ConfigCircuitos, ModoCircuitos, Room } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import LocalObra from './local-obra';

interface Resumo { circuitos: number; disjuntores: number; metrosCabo: number; avisos: string[] }
interface Detalhe { nome: string; tipo: string; potenciaW: number; correnteA: number; disjuntorA: number; bitolaMM2: number; comprimentoM: number; dr: boolean }
interface AvaliacaoEquip { id: string; tipo: string; room: string; pot: number; divide: boolean; alvo: number | null; podeDividir: boolean; motivo: string }
interface Comparacao {
  nTUE: number;
  tomadasV?: number | null;
  equipamentos?: AvaliacaoEquip[];
  modos: Record<'norma' | 'economico' | 'maximo', Resumo>;
  atual: Resumo & { modo: ModoCircuitos };
  lista: CircuitoManual[];
  cargas: Record<string, { luz: number; tomadas: number }>;
  limiteVA: number;
  detalhes?: Detalhe[];
}

const OPCOES: { modo: 'economico' | 'maximo'; titulo: string; texto: string }[] = [
  { modo: 'economico', titulo: 'Econômico', texto: 'Um disjuntor por cômodo: luz e tomadas juntas onde a norma permite (inclui banheiro). Cozinha e área de serviço ficam separadas.' },
  { modo: 'maximo', titulo: 'Mais econômico', texto: 'Também junta cômodos vizinhos (os que seguem o mesmo caminho do quadro).' },
];

const TIPO_TXT: Record<CircuitoManual['tipo'], string> = { luz: 'Iluminação', tomadas: 'Tomadas', misto: 'Luz e tomadas' };
const nome = (r?: Room) => r?.nome || r?.base || 'Cômodo';
const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** "Circuitos do quadro": dois modelos prontos + a lista de circuitos, que a pessoa pode ajustar (mover cômodos, separar, juntar). */
export default function CircuitosCard() {
  const store = useStore();
  const rooms = store?.rooms ?? [];
  const cfg: ConfigCircuitos = store?.circuitos ?? configPadrao();
  const [cmp, setCmp] = useState<Comparacao | null>(null);

  const dados = useMemo(() => JSON.stringify({
    imovel: store.imovel, obra: store.obra, cobertura: store.cobertura, rede: store.rede,
    rooms: store.rooms, equips: store.equips, circuitos: store.circuitos, entrada: store.entrada,
  }), [store.imovel, store.obra, store.cobertura, store.rede, store.rooms, store.equips, store.circuitos, store.entrada]);

  useEffect(() => {
    if (rooms.length === 0) { setCmp(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch('/api/circuitos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados: JSON.parse(dados) }), signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falha'))))
        .then((j) => setCmp(j))
        .catch(() => { /* sem resposta: a tela continua usável, só sem os números */ });
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [dados, rooms.length]);

  // Orçamento salvo com o "ajuste manual" antigo: vira a lista de circuitos equivalente (mesmos circuitos).
  useEffect(() => {
    if (cfg.modo === 'manual' && cmp?.lista?.length) store.setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista: cmp.lista });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.modo, cmp?.lista]);

  if (rooms.length === 0) return null;

  const porId = new Map(rooms.map((r) => [r.id, r]));
  const lista = cmp?.lista ?? [];
  const base = cmp?.modos?.norma;
  const personalizado = cfg.modo === 'personalizado';
  const avaliacoes = cmp?.equipamentos ?? [];

  /** Primeiro cômodo que realmente usa o circuito: é dele o trajeto até o quadro. */
  const primeiroQueUsa = (c: CircuitoManual): string => {
    const usa = (id: string) => {
      const x = cmp?.cargas?.[id];
      if (!x) return true;
      return c.tipo === 'luz' ? x.luz > 0 : c.tipo === 'tomadas' ? x.tomadas > 0 : x.luz > 0 || x.tomadas > 0;
    };
    return c.rooms.find(usa) ?? c.rooms[0];
  };
  const dividir = (equipId: string, sim: boolean) => store.updateEquip(equipId, { circuito: sim ? 'comodo' : 'proprio' });

  const escolher = (modo: 'economico' | 'maximo') => store.setCircuitos({ modo, unico: [], grupos: [] });
  const aplicar = (nova: CircuitoManual[]) => store.setCircuitos({ modo: 'personalizado', unico: [], grupos: [], lista: nova.filter((c) => c.rooms.length > 0) });
  const copia = () => lista.map((c) => ({ ...c, rooms: [...c.rooms], dists: [...c.dists] }));

  /** Tira o cômodo do circuito i e coloca no circuito `destino` (ou num circuito novo do mesmo tipo). */
  const mover = (i: number, roomId: string, destino: number | 'novo') => {
    const nova = copia();
    const src = nova[i];
    const idx = src.rooms.indexOf(roomId);
    if (idx < 0) return;
    src.rooms.splice(idx, 1); src.dists.splice(idx, 1);
    if (idx === 0 && src.dists.length) src.dists[0] = '';
    if (destino === 'novo') nova.push({ id: uid(), tipo: src.tipo, rooms: [roomId], dists: [''] });
    else { nova[destino].rooms.push(roomId); nova[destino].dists.push(''); }
    aplicar(nova);
  };
  const setDist = (i: number, j: number, v: string) => {
    const nova = copia();
    nova[i].dists[j] = v;
    aplicar(nova);
  };
  const separar = (i: number) => {
    const nova = copia();
    const c = nova[i];
    nova.splice(i, 1, { ...c, id: uid(), tipo: 'luz' }, { ...c, id: uid(), tipo: 'tomadas', rooms: [...c.rooms], dists: [...c.dists] });
    aplicar(nova);
  };
  const juntar = (i: number, k: number) => {
    const nova = copia();
    const luz = nova[i];
    nova[i] = { ...luz, tipo: 'misto' };
    nova.splice(k, 1);
    aplicar(nova);
  };

  /** Por que o cômodo não pode ir para o circuito k (vazio = pode). */
  const bloqueio = (origem: CircuitoManual, roomId: string, k: number): string => {
    const dest = lista[k];
    const r = porId.get(roomId);
    if (!dest || !r) return 'indisponível';
    const carga = cmp?.cargas?.[roomId];
    if (dest.tipo !== 'luz' && dest.rooms.some((id) => { const o = porId.get(id); return o && tomadasCompativeis(classeCircuito(o), classeCircuito(r)) === 'nao'; })) {
      return 'tomadas de cozinha/serviço não dividem com os outros cômodos';
    }
    if (dest.tipo === 'misto' && ![r, ...dest.rooms.map((id) => porId.get(id)).filter(Boolean) as Room[]].every((x) => aceitaMisto(classeCircuito(x)))) {
      return 'luz e tomadas juntas só em cômodo comum ou banheiro';
    }
    if (carga && cmp?.detalhes?.[k]) {
      const soma = cmp.detalhes[k].potenciaW + (origem.tipo === 'luz' ? carga.luz : origem.tipo === 'tomadas' ? carga.tomadas : carga.luz + carga.tomadas);
      if (soma > (cmp.limiteVA ?? 2500)) return `passaria de ${(cmp.limiteVA ?? 2500).toLocaleString('pt-BR')} VA`;
    }
    return '';
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><CircuitBoard className="w-4 h-4 text-primary" /> Circuitos do quadro</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cada circuito é um disjuntor no quadro. Menos circuitos = menos disjuntores e menos fio. Escolha um modelo e, se quiser, ajuste a lista abaixo.
            A iluminação pode dividir circuito com qualquer cômodo. As tomadas de cozinha e área de serviço só dividem entre si;
            banheiro pode dividir com quartos e sala (o circuito leva DR); área externa divide só com aviso.
          </p>
        </div>

        {!store.entrada?.uf ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
            <p className="text-xs text-amber-900">
              Escolha o estado do imóvel: ele define a tensão das tomadas (127 V ou 220 V), que decide se um equipamento pode dividir o circuito do cômodo.
            </p>
            <LocalObra />
          </div>
        ) : cmp?.tomadasV ? (
          <p className="text-xs text-muted-foreground">
            Tomadas deste imóvel: <strong className="text-foreground">{cmp.tomadasV} V</strong> (rede {store.entrada?.sistemaTensao === '380/220' ? '380/220' : '220/127'} V · {store.entrada?.uf}).
            Aparelho de tensão diferente fica em circuito próprio.
          </p>
        ) : null}

        <div className="grid sm:grid-cols-2 gap-2">
          {OPCOES.map((o) => {
            const r = cmp?.modos?.[o.modo];
            const ativo = cfg.modo === o.modo;
            const menos = base && r ? base.disjuntores - r.disjuntores : 0;
            return (
              <button key={o.modo} type="button" onClick={() => escolher(o.modo)}
                className={`text-left rounded-lg border p-3 transition-all ${ativo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                <span className="block text-sm font-semibold">{o.titulo}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight mt-1">{o.texto}</span>
                {r && (
                  <span className="block text-xs mt-2">
                    <strong>{r.disjuntores}</strong> {r.disjuntores === 1 ? 'disjuntor' : 'disjuntores'} · <strong>{r.metrosCabo}</strong> m de cabo
                    {menos > 0 && <span className="block text-green-700 font-medium">−{menos} {menos === 1 ? 'disjuntor' : 'disjuntores'} que com tudo separado</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {personalizado && (
          <p className="text-[11px] text-primary">
            Você personalizou os circuitos. Para refazer a lista, escolha de novo um dos modelos acima.
          </p>
        )}

        {cmp && (
          <p className="text-xs">
            <strong>{cmp.atual.disjuntores}</strong> {cmp.atual.disjuntores === 1 ? 'disjuntor' : 'disjuntores'} no total · <strong>{cmp.atual.metrosCabo}</strong> m de cabo
            <span className="text-muted-foreground"> (luz e tomadas + {cmp.nTUE} {cmp.nTUE === 1 ? 'circuito' : 'circuitos'} próprio{cmp.nTUE === 1 ? '' : 's'} de equipamentos)</span>
          </p>
        )}

        {cmp?.atual?.avisos?.length ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
            {cmp.atual.avisos.map((a, i) => (
              <p key={i} className="flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{a}</span></p>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          {lista.map((c, i) => {
            const det = cmp?.detalhes?.[i];
            const extra = det?.nome.match(/\(\+ (.*)\)$/)?.[1];
            const luzIrma = c.tipo === 'luz' ? lista.findIndex((o, k) => k !== i && o.tipo === 'tomadas' && mesmoConjunto(o.rooms, c.rooms)) : -1;
            const podeJuntar = luzIrma >= 0 && c.rooms.every((id) => { const r = porId.get(id); return !!r && aceitaMisto(classeCircuito(r)); });
            const destinos = lista.map((o, k) => ({ o, k })).filter(({ o, k }) => k !== i && o.tipo === c.tipo);
            return (
              <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Circuito {i + 1} · {TIPO_TXT[c.tipo]}</p>
                    {extra && <p className="text-[11px] text-muted-foreground">Inclui o aparelho: {extra}</p>}
                  </div>
                  {det && (
                    <p className="text-[11px] text-right text-muted-foreground leading-tight">
                      <strong className="text-foreground">{det.disjuntorA} A</strong> · {det.bitolaMM2} mm² · {det.comprimentoM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m
                      {det.dr && <span className="flex items-center justify-end gap-1 text-amber-700"><ShieldAlert className="w-3 h-3" /> com DR</span>}
                    </p>
                  )}
                </div>

                {(() => {
                  const r = porId.get(primeiroQueUsa(c));
                  if (!r) return null;
                  return r.via ? (
                    <p className="text-[11px] text-muted-foreground">Do quadro até {nome(r)}: pelo caminho de outro cômodo (ajuste na etapa Cômodos).</p>
                  ) : (
                    <label className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      Do quadro até {nome(r)} (m)
                      <Input type="number" min="0" step="0.5" value={r.dq ?? ''} placeholder="0"
                        className={`h-7 w-20 text-xs ${!(parseFloat(r.dq) > 0) ? 'border-amber-400' : ''}`}
                        onChange={(ev) => store.updateRoom(r.id, { dq: semNegativo(ev.target.value) })} />
                      <span>(vale para todos os circuitos deste cômodo)</span>
                    </label>
                  );
                })()}

                {c.rooms.map((id, j) => {
                  const r = porId.get(id);
                  return (
                    <div key={id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium min-w-[7rem]">{nome(r)}</span>
                      {j > 0 && (
                        <label className="flex items-center gap-1 text-muted-foreground">
                          + cabo (m)
                          <Input type="number" min="0" step="0.5" value={c.dists[j] ?? ''} placeholder="0"
                            className={`h-7 w-16 text-xs ${!(parseFloat(c.dists[j]) > 0) ? 'border-amber-400' : ''}`}
                            onChange={(ev) => setDist(i, j, semNegativo(ev.target.value))} />
                        </label>
                      )}
                      <select value="" aria-label={`Mover ${nome(r)} para outro circuito`}
                        className="ml-auto rounded-md border border-input bg-card px-2 py-1 text-xs"
                        onChange={(ev) => {
                          const v = ev.target.value;
                          if (v === 'novo') mover(i, id, 'novo');
                          else if (v !== '') mover(i, id, parseInt(v, 10));
                        }}>
                        <option value="">Mover para…</option>
                        {c.rooms.length > 1 && <option value="novo">Novo circuito só para {nome(r)}</option>}
                        {destinos.map(({ o, k }) => {
                          const motivo = bloqueio(c, id, k);
                          return (
                            <option key={o.id} value={k} disabled={!!motivo}>
                              Circuito {k + 1} · {o.rooms.map((x) => nome(porId.get(x))).join(' + ')}{motivo ? ` — ${motivo}` : ''}
                            </option>
                          );
                        })}
                      </select>
                      {c.tipo !== 'luz' && avaliacoes.filter((e) => e.room === id).map((e) => (
                        <label key={e.id} className="basis-full flex items-start gap-2 pl-3 text-[11px]">
                          <input type="checkbox" className="mt-0.5" checked={e.divide} disabled={!e.podeDividir}
                            onChange={(ev) => dividir(e.id, ev.target.checked)} />
                          <span>
                            Dividir este circuito com: <strong>{e.tipo}</strong> ({e.pot.toLocaleString('pt-BR')} W)
                            {!e.podeDividir && e.motivo ? <span className="text-muted-foreground"> — {e.motivo}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}

                {(c.tipo === 'misto' || podeJuntar) && (
                  <div className="flex gap-2 pt-1">
                    {c.tipo === 'misto' && <Button type="button" variant="outline" size="sm" onClick={() => separar(i)}>Separar luz e tomadas</Button>}
                    {podeJuntar && <Button type="button" variant="outline" size="sm" onClick={() => juntar(i, luzIrma)}>Juntar com as tomadas no mesmo disjuntor</Button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(() => {
          const proprios = avaliacoes.filter((e) => !e.divide);
          if (proprios.length === 0) return null;
          const detProprios = cmp?.detalhes?.slice(lista.length) ?? [];
          return (
            <div className="space-y-3">
              <p className="text-xs font-semibold">Circuitos próprios dos equipamentos</p>
              {proprios.map((e, j) => {
                const det = detProprios[j];
                const eq = (store.equips ?? []).find((x) => x.id === e.id);
                const r = porId.get(e.room);
                return (
                  <div key={e.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">Circuito {lista.length + j + 1} · Equipamento: {e.tipo}{r ? ` — ${nome(r)}` : ''}</p>
                      {det && (
                        <p className="text-[11px] text-right text-muted-foreground leading-tight">
                          <strong className="text-foreground">{det.disjuntorA} A</strong> · {det.bitolaMM2} mm² · {det.comprimentoM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m
                          {det.dr && <span className="flex items-center justify-end gap-1 text-amber-700"><ShieldAlert className="w-3 h-3" /> com DR</span>}
                        </p>
                      )}
                    </div>
                    <label className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      Do quadro até o aparelho (m)
                      <Input type="number" min="0" step="0.5" value={eq?.dist ?? ''} placeholder={det ? String(Math.round(det.comprimentoM * 10) / 10) : '0'}
                        className="h-7 w-20 text-xs" onChange={(ev) => store.updateEquip(e.id, { dist: semNegativo(ev.target.value) })} />
                      <span>(vazio = distância do cômodo + dentro do cômodo)</span>
                    </label>
                    {e.podeDividir ? (
                      <label className="flex items-start gap-2 text-[11px]">
                        <input type="checkbox" className="mt-0.5" checked={false} onChange={() => dividir(e.id, true)} />
                        <span>Dividir o circuito de tomadas de {r ? nome(r) : 'o cômodo'} (aparelho pequeno)</span>
                      </label>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Circuito próprio{e.motivo ? `: ${e.motivo}` : '.'}</p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        <p className="text-[11px] text-muted-foreground">
          Cada cômodo fica em um circuito por tipo. Para juntar cômodos vizinhos, mova um cômodo para o circuito do outro e informe quantos metros de cabo a mais levam de um ao outro.
          Cozinha, banheiros e áreas externas seguem as regras de segurança acima.
        </p>
      </CardContent>
    </Card>
  );
}
