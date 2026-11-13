'use client';
import { useEffect, useMemo, useState } from 'react';
import { CircuitBoard, AlertTriangle, Trash2, Link2 } from 'lucide-react';
import { useStore } from '@/lib/store-cliente';
import { classeCircuito, configPadrao } from '@/lib/circuitos-config';
import { semNegativo } from '@/lib/validacao';
import { uid } from '@/lib/templates';
import type { ConfigCircuitos, GrupoCircuito, ModoCircuitos, Room } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Resumo { circuitos: number; disjuntores: number; metrosCabo: number; avisos: string[] }
interface Comparacao {
  nTUE: number;
  modos: Record<'norma' | 'economico' | 'maximo', Resumo>;
  atual: Resumo & { modo: ModoCircuitos };
  resolvido: ConfigCircuitos;
}

const OPCOES: { modo: 'norma' | 'economico' | 'maximo'; titulo: string; texto: string }[] = [
  { modo: 'norma', titulo: 'Separado (padrão)', texto: 'Cada cômodo com um disjuntor para a luz e outro para as tomadas.' },
  { modo: 'economico', titulo: 'Econômico', texto: 'Um disjuntor por cômodo: luz e tomadas juntas (onde for permitido).' },
  { modo: 'maximo', titulo: 'Mais econômico', texto: 'Também junta cômodos vizinhos (os que seguem o mesmo caminho do quadro).' },
];

const nome = (r?: Room) => r?.nome || r?.base || 'Cômodo';

/** "Circuitos do quadro": a pessoa escolhe como dividir; o servidor calcula e mostra o efeito em disjuntores e cabo. */
export default function CircuitosCard() {
  const store = useStore();
  const rooms = store?.rooms ?? [];
  const cfg: ConfigCircuitos = store?.circuitos ?? configPadrao();
  const [cmp, setCmp] = useState<Comparacao | null>(null);
  const [sel, setSel] = useState<string[]>([]);

  const dados = useMemo(() => JSON.stringify({
    imovel: store.imovel, obra: store.obra, cobertura: store.cobertura, rede: store.rede,
    rooms: store.rooms, equips: store.equips, circuitos: store.circuitos,
  }), [store.imovel, store.obra, store.cobertura, store.rede, store.rooms, store.equips, store.circuitos]);

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

  if (rooms.length === 0) return null;

  const manual = cfg.modo === 'manual';
  const emGrupo = new Set(cfg.grupos.flatMap((g) => g.rooms));
  const porId = new Map(rooms.map((r) => [r.id, r]));
  const base = cmp?.modos?.norma;

  const escolher = (modo: 'norma' | 'economico' | 'maximo') => store.setCircuitos({ modo, unico: [], grupos: [] });
  const ajustarAMao = () => store.setCircuitos({ ...(cmp?.resolvido ?? { unico: [], grupos: [] }), modo: 'manual' });
  const setGrupos = (grupos: GrupoCircuito[]) => store.setCircuitos({ ...cfg, modo: 'manual', grupos });
  const alternarUnico = (id: string) => store.setCircuitos({
    ...cfg, modo: 'manual', unico: cfg.unico.includes(id) ? cfg.unico.filter((x) => x !== id) : [...cfg.unico, id],
  });

  const livres = rooms.filter((r) => classeCircuito(r) !== 'isolado' && !emGrupo.has(r.id));
  const selecionados = sel.map((id) => porId.get(id)).filter(Boolean) as Room[];
  const mesmaClasse = selecionados.length > 0 && selecionados.every((r) => classeCircuito(r) === classeCircuito(selecionados[0]));
  const juntar = () => {
    if (selecionados.length < 2 || !mesmaClasse) return;
    const dists = selecionados.map((r, i) => {
      const ant = selecionados[i - 1];
      return i > 0 && ant && r.via === ant.id && parseFloat(r.dr) > 0 ? String(parseFloat(r.dr)) : '';
    });
    setGrupos([...cfg.grupos, { id: uid(), rooms: selecionados.map((r) => r.id), dists, unico: classeCircuito(selecionados[0]) === 'comum' }]);
    setSel([]);
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><CircuitBoard className="w-4 h-4 text-primary" /> Circuitos do quadro</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cada circuito é um disjuntor no quadro. Menos circuitos = menos disjuntores e menos fio. O padrão (separado) é o mais seguro; as outras opções economizam
            onde a norma permite. Cozinha, área de serviço, banheiros e áreas externas ficam sempre em circuitos próprios.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-2">
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
                    {menos > 0 && <span className="block text-green-700 font-medium">−{menos} {menos === 1 ? 'disjuntor' : 'disjuntores'} que o padrão</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Disjuntores contam os circuitos de luz e tomadas{cmp ? ` e os ${cmp.nTUE} de equipamentos (chuveiro, ar-condicionado...)` : ' e os de equipamentos'}. Metros = trajeto do cabo do quadro até os cômodos (cada fio).
        </p>

        {cmp?.atual?.avisos?.length ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
            {cmp.atual.avisos.map((a, i) => (
              <p key={i} className="flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{a}</span></p>
            ))}
          </div>
        ) : null}

        {!manual ? (
          <Button type="button" variant="outline" size="sm" onClick={ajustarAMao}>Ajustar à mão (escolher quais cômodos juntar)</Button>
        ) : (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Ajuste manual</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => escolher('norma')}>Voltar ao padrão</Button>
            </div>

            {cfg.grupos.map((g) => (
              <div key={g.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-primary" />{g.rooms.map((id) => nome(porId.get(id))).join(' + ')}</p>
                  <button type="button" aria-label="Desfazer grupo" onClick={() => setGrupos(cfg.grupos.filter((x) => x.id !== g.id))} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {g.rooms.slice(1).map((id, k) => (
                  <label key={id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">Cabo a mais de <strong>{nome(porId.get(g.rooms[k]))}</strong> até <strong>{nome(porId.get(id))}</strong> (m)</span>
                    <Input type="number" step="0.1" min="0" className="w-24" value={g.dists[k + 1] ?? ''} placeholder="0.0"
                      onChange={(e: any) => setGrupos(cfg.grupos.map((x) => x.id === g.id ? { ...x, dists: x.dists.map((d, i) => i === k + 1 ? semNegativo(e?.target?.value) : d) } : x))} />
                  </label>
                ))}
                {classeCircuito(porId.get(g.rooms[0]) as Room) === 'comum' && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!g.unico} onChange={() => setGrupos(cfg.grupos.map((x) => x.id === g.id ? { ...x, unico: !x.unico } : x))} />
                    Luz e tomadas deste grupo no mesmo disjuntor
                  </label>
                )}
              </div>
            ))}

            {livres.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Cômodos soltos</p>
                {livres.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" aria-label={`Juntar ${nome(r)}`} checked={sel.includes(r.id)}
                      onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} />
                    <span className="flex-1">{nome(r)}{classeCircuito(r) === 'servico' ? ' (circuito exclusivo de cozinha/serviço)' : ''}</span>
                    {classeCircuito(r) === 'comum' && (
                      <label className="flex items-center gap-1 text-muted-foreground">
                        <input type="checkbox" checked={cfg.unico.includes(r.id)} onChange={() => alternarUnico(r.id)} /> luz + tomadas juntas
                      </label>
                    )}
                  </div>
                ))}
                <Button type="button" size="sm" disabled={selecionados.length < 2 || !mesmaClasse} onClick={juntar}>Juntar cômodos marcados</Button>
                {selecionados.length >= 2 && !mesmaClasse && (
                  <p className="text-[11px] text-amber-700">Cozinha/serviço só se juntam entre si; os outros cômodos também só entre si.</p>
                )}
                <p className="text-[11px] text-muted-foreground">Marque 2 ou mais cômodos vizinhos e depois informe quantos metros de cabo a mais levam de um ao outro.</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
