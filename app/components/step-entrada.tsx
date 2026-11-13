'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Lock, PlugZap, Package, Zap } from 'lucide-react';
import { useStore } from '@/lib/store-cliente';
import { semNegativo } from '@/lib/validacao';
import {
  avisosEntrada, entradaPadrao, materiaisEntrada, sincronizarEntrada, textoPotencia,
  tensaoDoSistema, tipoEletrodutoPadrao,
} from '@/lib/entrada-calc';
import { UFS, infoUf, sistemaSugeridoUf } from '@/lib/tensao-por-uf';
import type {
  BitolaCabo, DiametroEletroduto, EntradaPrincipal, SistemaAlimentacao, TipoEletroduto, TipoEntrada, TipoPoste, UnidadeEletroduto,
} from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const selCls = 'mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm';
const sug = (manual: boolean) => (manual ? '' : ' (sugerido)');

/** Resultado do motor (mesmo campo `entrada` que /api/calcular devolve para a prévia). */
interface PadraoEntrada { demandaKva: number; categoria: string; disjuntorGeralA: number; sistema: string; uf: string | null }

export default function StepEntrada() {
  const store = useStore();
  const e: EntradaPrincipal = { ...entradaPadrao(), ...(store?.entrada ?? {}) };
  const up = (patch: Partial<EntradaPrincipal>) => store.updateEntrada(patch);

  const potKw = parseFloat(e.potenciaDemandada) || 0;
  const vs = e.sistemaTensao === '220/127' || e.sistemaTensao === '380/220' ? e.sistemaTensao : undefined;
  const ufInfo = infoUf(e.uf);

  // Padrão de entrada calculado pelo motor (mesma chamada da prévia), ao montar e quando UF/sistema mudam.
  const [padrao, setPadrao] = useState<PadraoEntrada | null>(null);
  const [calculando, setCalculando] = useState(false);
  // Só sincroniza a potência depois do primeiro resultado (evita esvaziar o campo enquanto carrega).
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const s = store;
    if (!(s?.rooms?.length || s?.equips?.length)) { setPadrao(null); setPronto(true); return; }
    const dados = {
      imovel: s.imovel, obra: s.obra, cobertura: s.cobertura, rede: s.rede, rooms: s.rooms, equips: s.equips,
      ...(s.entrada ? { entrada: s.entrada } : {}),
      ...(s.aterramento ? { aterramento: s.aterramento } : {}),
      ...(s.circuitos ? { circuitos: s.circuitos } : {}),
    };
    const ctrl = new AbortController();
    setCalculando(true);
    fetch('/api/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falha'))))
      .then((j) => { setPadrao(j?.entrada?.disjuntorGeralA ? j.entrada : null); setCalculando(false); setPronto(true); })
      .catch((err) => { if (err?.name !== 'AbortError') { setPadrao(null); setCalculando(false); } });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.uf, e.sistemaTensao, e.sistema, e.ligacao]);
  const [fn, ff] = vs === '220/127' ? ['127', '220'] : ['220', '380'];

  /** UF escolhida: grava a tensão da localidade e pré-preenche o sistema (o usuário pode alterar abaixo). */
  const escolherUf = (sigla: string) => {
    const u = infoUf(sigla);
    if (!u) { up({ uf: '', sistemaTensao: undefined }); return; }
    const s = sistemaSugeridoUf(u.tensao, potKw);
    up({ uf: u.uf, sistemaTensao: u.tensao, sistema: s, sistemaManual: false, tensao: tensaoDoSistema(s, u.tensao) });
  };

  // Potência estimada = demanda do padrão de entrada (kVA), enquanto a pessoa não editar.
  // Sem cômodo/equipamento o campo esvazia. Sistema, bitola e diâmetro acompanham (só se não forem manuais).
  // O mesmo cálculo roda na prévia, então tela, prévia e PDF não divergem.
  useEffect(() => {
    if (!pronto || calculando) return;
    const patch = sincronizarEntrada(e, padrao ? padrao.demandaKva : null);
    if (Object.keys(patch).length) up(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padrao, pronto, calculando, e.potenciaManual, e.potenciaDemandada, e.percurso, e.sistemaTensao, e.sistema, e.sistemaManual, e.bitolaManual, e.diametroManual]);

  const materiais = materiaisEntrada(e).filter((m) => m.mostrarNaPrevia);
  const avisos = avisosEntrada(e);
  const aerea = e.tipoEntrada === 'aerea';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Entrada de energia</h2>
        <p className="text-muted-foreground mt-1">Alimentador principal: do padrão da concessionária até o quadro</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <PlugZap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Dados da entrada</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estado (UF) da obra</Label>
              <select value={e.uf ?? ''} className={selCls} onChange={(ev) => escolherUf(ev.target.value)}>
                <option value="">Selecione…</option>
                {UFS.map((u) => <option key={u.uf} value={u.uf}>{u.uf} — {u.nome}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Tensão da localidade</Label>
              <select value={e.sistemaTensao ?? 'nao-sei'} className={selCls}
                onChange={(ev) => { const t = ev.target.value as NonNullable<EntradaPrincipal['sistemaTensao']>; up({ sistemaTensao: t, tensao: tensaoDoSistema(e.sistema, t) }); }}>
                <option value="nao-sei">Não sei (adota 220/127 V)</option>
                <option value="220/127">220/127 V</option>
                <option value="380/220">380/220 V</option>
              </select>
            </div>
          </div>
          {ufInfo && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              Distribuidora: {ufInfo.distribuidora} — {ufInfo.tensao} V.{ufInfo.verificar ? ' Tabela de categorias usada como referência: verificar com a distribuidora local.' : ''} Confirme ou altere o sistema abaixo.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo de entrada</Label>
              <select value={e.tipoEntrada} className={selCls}
                onChange={(ev) => { const t = ev.target.value as TipoEntrada; up({ tipoEntrada: t, tipoEletroduto: tipoEletrodutoPadrao(t) }); }}>
                <option value="aerea">Aérea</option>
                <option value="subterranea">Subterrânea</option>
                <option value="parede">Pela parede</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Poste</Label>
              <select value={e.poste} className={selCls} onChange={(ev) => up({ poste: ev.target.value as TipoPoste })}>
                <option value="nao-tem">Sem poste</option>
                <option value="6m">6 m</option>
                <option value="7m">7 m</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Percurso total (m)</Label>
              <Input type="number" step="0.1" min="0" value={e.percurso} placeholder="Ex: 15" className="mt-1"
                onChange={(ev) => up({ percurso: semNegativo(ev.target.value) })} />
              <p className="mt-1 text-[11px] text-muted-foreground">Inclua descidas, curvas e percurso horizontal</p>
            </div>
            <div>
              <Label className="text-xs">Potência estimada (kVA){e.potenciaManual ? '' : ' (automática)'}</Label>
              <Input type="number" step="0.01" min="0" value={e.potenciaDemandada} placeholder="Ex: 8" className="mt-1"
                onChange={(ev) => up({ potenciaDemandada: semNegativo(ev.target.value), potenciaManual: true })}
                onBlur={() => { if (e.potenciaManual && e.potenciaDemandada === '') up({ potenciaManual: false }); }} />
              {e.potenciaManual ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Valor editado por você.{' '}
                  <button type="button" className="text-primary hover:underline"
                    onClick={() => up({ potenciaManual: false, potenciaDemandada: textoPotencia(padrao?.demandaKva) })}>
                    Voltar ao automático{padrao ? ` (${textoPotencia(padrao.demandaKva).replace('.', ',')} kVA)` : ''}
                  </button>
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">Vem da demanda do padrão de entrada (soma das cargas). Você pode editar; a bitola e o sistema usam este valor.</p>
              )}
            </div>
          </div>

          {calculando && !padrao && <p className="text-xs text-muted-foreground">Calculando…</p>}
          {padrao && (
            <Card className="shadow-sm">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Padrão de entrada{calculando ? <span className="text-[11px] font-normal text-muted-foreground">Calculando…</span> : null}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {[
                    { label: 'Demanda total', value: `${padrao.demandaKva.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kVA` },
                    { label: 'Categoria', value: padrao.categoria },
                    { label: 'Disjuntor geral', value: `${padrao.disjuntorGeralA} A` },
                    { label: 'Tensão da localidade', value: `${padrao.uf ? `${padrao.uf} · ` : ''}${padrao.sistema} V` },
                  ].map((x) => (
                    <div key={x.label}>
                      <p className="text-lg font-bold">{x.value}</p>
                      <p className="text-[10px] text-muted-foreground">{x.label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">Pré-dimensionamento (DIS-NOR-030) — verificar com a distribuidora.</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Sistema{sug(e.sistemaManual)}</Label>
              <select value={e.sistema} className={selCls}
                onChange={(ev) => { const s = ev.target.value as SistemaAlimentacao; up({ sistema: s, tensao: tensaoDoSistema(s, vs), sistemaManual: true }); }}>
                <option value="monofasico">Monofásico {fn}V</option>
                {vs !== '380/220' && <option value="bifasico">Bifásico {ff}V</option>}
                <option value="trifasico">Trifásico {ff}V</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Bitola do cabo{sug(e.bitolaManual)}</Label>
              <select value={e.bitola} className={selCls} onChange={(ev) => up({ bitola: ev.target.value as BitolaCabo, bitolaManual: true })}>
                <option value="6">6 mm²</option>
                <option value="10">10 mm²</option>
                <option value="16">16 mm²</option>
              </select>
            </div>
          </div>

          {!aerea && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Diâmetro do eletroduto{sug(e.diametroManual)}</Label>
                <select value={e.diametroEletroduto} className={selCls}
                  onChange={(ev) => up({ diametroEletroduto: ev.target.value as DiametroEletroduto, diametroManual: true })}>
                  <option value="3/4">¾"</option>
                  <option value="1">1"</option>
                  <option value="1-1/4">1¼"</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Tipo de eletroduto</Label>
                <select value={e.tipoEletroduto} className={selCls} onChange={(ev) => up({ tipoEletroduto: ev.target.value as TipoEletroduto })}>
                  <option value="rigido">Rígido</option>
                  <option value="flexivel">Flexível corrugado</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Eletroduto em:</Label>
                <select value={e.unidadeEletroduto ?? 'metro'} className={selCls} onChange={(ev) => up({ unidadeEletroduto: ev.target.value as UnidadeEletroduto })}>
                  <option value="metro">Metros</option>
                  <option value="peca3m">Peças de 3 m</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Observações</Label>
            <textarea value={e.obs} maxLength={500} rows={3} className={selCls} placeholder="Ex: padrão já existente, trocar só o cabo"
              onChange={(ev) => up({ obs: ev.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={e.incluirNoPdf !== false}
              onChange={(ev) => up({ incluirNoPdf: ev.target.checked })} />
            Incluir materiais da entrada no orçamento (PDF)
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
              {avisos.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" /> {a.msg}
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
            <Lock className="w-3.5 h-3.5" /> Bitola, disjuntor e detalhamento completo inclusos no PDF
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
