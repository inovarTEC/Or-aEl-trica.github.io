'use client';
import { useStore } from '@/lib/store-cliente';
import { DadosOrcamento, Pendencia } from '@/lib/types';
import { EstadoLocal, carregarEstado, edicoesRestantes, formatarData, podeEditar } from '@/lib/storage-local';
import { faltasObrigatorias } from '@/lib/validacao';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, CheckCircle2, Info, XCircle, Zap,
  Box, Plug, Lightbulb, ToggleLeft, Ruler, FileText,
  CircuitBoard, Cable, Lock, Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import CheckoutModal from './checkout-modal';
import { abrirPendencia, STEP_COMODOS, STEP_PONTOS } from '@/lib/navegacao';
import { entradaPadrao, sincronizarEntrada } from '@/lib/entrada-calc';
import { AFILIADOS, LINK_NOSSOS_APPS } from '@/lib/afiliados';

interface Previa {
  valor: number;
  totais: any;
  pendencias: Pendencia[];
  resumo: { nCircuitos: number; nMateriais: number };
  entrada?: { demandaKva: number; categoria: string; disjuntorGeralA: number; sistema: string; uf: string | null };
}

/** Só os campos que alimentam o cálculo — o resto do estado (step, id...) não vai ao servidor. */
export function dadosDoOrcamento(s: DadosOrcamento): DadosOrcamento {
  return {
    imovel: s.imovel, obra: s.obra, cobertura: s.cobertura, rede: s.rede, rooms: s.rooms, equips: s.equips,
    ...(s.entrada ? { entrada: s.entrada } : {}),
    ...(s.aterramento ? { aterramento: s.aterramento } : {}),
    ...(s.circuitos ? { circuitos: s.circuitos } : {}),
  };
}

export default function StepPrevia() {
  const store = useStore();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [falha, setFalha] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [local, setLocal] = useState<EstadoLocal | null>(null);
  const [cep, setCep] = useState('');

  const dados = JSON.stringify(dadosDoOrcamento(store));

  // Releitura do estado salvo a cada abertura/fechamento do modal (o modal altera pagamento/entrega).
  useEffect(() => { setLocal(carregarEstado()); }, [showCheckout]);

  useEffect(() => {
    const ctrl = new AbortController();
    setFalha(false);
    fetch('/api/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados: JSON.parse(dados) }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falha'))))
      .then((j) => setPrevia(j))
      .catch((e) => { if (e?.name !== 'AbortError') setFalha(true); });
    return () => ctrl.abort();
  }, [dados]);

  // Mantém a entrada em dia com os cômodos/equipamentos atuais (ex.: apagou um cômodo depois de passar pela Entrada):
  // potência automática, bitola e sistema acompanham a demanda, para a prévia e o PDF saírem iguais.
  useEffect(() => {
    if (!previa || !store.entrada) return;
    const demanda = (store.rooms?.length || store.equips?.length) && previa.entrada?.disjuntorGeralA ? previa.entrada.demandaKva : null;
    const atual = { ...entradaPadrao(), ...store.entrada };
    const patch = sincronizarEntrada(atual, demanda);
    if (Object.keys(patch).length) store.updateEntrada(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa]);

  if (falha) {
    return (
      <Card className="max-w-3xl mx-auto"><CardContent className="pt-6 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm">Não foi possível calcular agora. Confira os dados e tente novamente.</p>
        <Button variant="outline" onClick={() => setFalha(false)}>Tentar de novo</Button>
      </CardContent></Card>
    );
  }
  if (!previa) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const { totais, pendencias, resumo } = previa;
  const erros = pendencias.filter((p) => p?.tipo === 'erro');
  // Mesmas regras que o servidor usa para recusar a cobrança/regeração (dados_incompletos).
  const faltas = faltasObrigatorias(dadosDoOrcamento(store));

  const stats = [
    { icon: Box, label: 'Caixas', value: totais?.totalCaixas ?? 0, color: 'text-primary' },
    { icon: Plug, label: 'Tomadas', value: totais?.totalTomadas ?? 0, color: 'text-orange-500' },
    { icon: Lightbulb, label: 'Luzes', value: totais?.totalLuzes ?? 0, color: 'text-yellow-500' },
    { icon: ToggleLeft, label: 'Interruptores', value: totais?.totalInterruptores ?? 0, color: 'text-green-500' },
    { icon: CircuitBoard, label: 'Circuitos', value: resumo.nCircuitos, color: 'text-indigo-500' },
    { icon: Ruler, label: 'Eletroduto (m)', value: totais?.distEletroduto ?? 0, color: 'text-purple-500' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Prévia do orçamento</h2>
        <p className="text-muted-foreground mt-1">Confira os totais. O detalhamento completo vai no PDF.</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="shadow-sm">
              <CardContent className="pt-4 pb-4 text-center">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Padrão de entrada
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              { label: 'Demanda total', value: previa.entrada ? `${previa.entrada.demandaKva.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kVA` : '-' },
              { label: 'Categoria', value: previa.entrada?.categoria ?? '-' },
              { label: 'Disjuntor geral', value: previa.entrada?.disjuntorGeralA ? `${previa.entrada.disjuntorGeralA} A` : '-' },
              { label: 'Tensão da localidade', value: previa.entrada ? `${previa.entrada.uf ? `${previa.entrada.uf} · ` : ''}${previa.entrada.sistema} V` : '-' },
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

      {/* Conteúdo pago: bloqueado na prévia */}
      <Card className="shadow-sm border-dashed">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">Incluso no PDF</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cable className="w-4 h-4" /> {resumo.nCircuitos} circuitos dimensionados (bitola, disjuntor e eletroduto)
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Box className="w-4 h-4" /> Lista com {resumo.nMateriais} itens de material
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircuitBoard className="w-4 h-4" /> Quadro de distribuição e disjuntor geral
          </div>
        </CardContent>
      </Card>

      {(totais?.porComodo ?? []).length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold mb-3">Detalhamento por cômodo</p>
            <div className="space-y-2">
              {(totais?.porComodo ?? []).map((c: any) => (
                <div key={c?.roomId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium mr-1">{c?.nome}</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => abrirPendencia({ step: STEP_COMODOS, roomId: c?.roomId }, store)}>Cômodo</Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => abrirPendencia({ step: STEP_PONTOS, roomId: c?.roomId }, store)}>Pontos</Button>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{c?.caixas} cx</span>
                    <span>{c?.tomadas} tom</span>
                    <span>{c?.luzes} luz</span>
                    <span>{(c?.distTrajeto ?? 0) > 0 ? `${c?.distInterna} m internos + ${c?.distTrajeto} m trajeto` : `${c?.distInterna} m`}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendencias.length > 0 ? (
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Pendências ({pendencias.length})
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {pendencias.map((p, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  {p?.tipo === 'erro' ? <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" /> :
                   p?.tipo === 'aviso' ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" /> :
                   <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />}
                  <span className="text-xs underline cursor-pointer hover:text-primary" onClick={() => abrirPendencia(p, store)}>{p?.msg}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm border-green-200 bg-green-50/50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="text-sm text-green-800 font-medium">Tudo certo! Nenhuma pendência encontrada.</p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Cálculo baseado na NBR 5410 (ABNT), método B1, condutor de cobre com isolação PVC. Valores de referência.
      </p>

      {faltas.length > 0 && (
        <Card className="shadow-sm border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold text-destructive mb-2">Complete os dados obrigatórios antes de gerar o PDF:</p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              {faltas.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Links de afiliados: discretos, antes do botão de pagamento */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-1">Encontre os materiais online 🛒</p>
          {AFILIADOS.map((a) => (
            <div key={a.categoria} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs">{a.emoji} {a.categoria}</span>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="h-7 px-3 text-xs"
                  style={{ background: '#fff3e8', color: '#c2410c', borderColor: '#fed7aa' }}>
                  <a href={a.shopee} target="_blank" rel="noopener noreferrer">Shopee</a>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-7 px-3 text-xs"
                  style={{ background: '#fffbe6', color: '#78600a', borderColor: '#fde68a' }}>
                  <a href={a.ml} target="_blank" rel="noopener noreferrer">Mercado Livre</a>
                </Button>
              </div>
            </div>
          ))}
          <div className="border-t border-border/60 pt-3 mt-2">
            <Button asChild size="sm" variant="outline" className="w-full text-xs"
              style={{ background: '#e8f4f8', color: '#0c4a6e', borderColor: '#bae6fd' }}>
              <a href={LINK_NOSSOS_APPS} target="_blank" rel="noopener noreferrer">Nossos Apps para Eletricista 📱</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Busca de eletricista por CEP: link externo do Google Maps, sem API key */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-2">
          <p className="text-sm font-semibold">🔍 Encontrar eletricista na sua região</p>
          <p className="text-xs text-muted-foreground">Digite seu CEP e encontre eletricistas próximos no Google Maps</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="text" inputMode="numeric" placeholder="00000-000" maxLength={9} value={cep}
              onChange={(ev) => {
                const d = ev.target.value.replace(/\D/g, '').slice(0, 8);
                setCep(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
              }}
              className="w-full sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm" />
            <Button size="sm" variant="outline" className="h-9 text-xs" disabled={cep.replace(/\D/g, '').length !== 8}
              onClick={() => {
                const cepLimpo = cep.replace(/\D/g, '');
                window.open(`https://www.google.com/maps/search/eletricista+${cepLimpo}`, '_blank', 'noopener');
              }}>
              Buscar no Google Maps 📍
            </Button>
          </div>
        </CardContent>
      </Card>

      {local && podeEditar(local) ? (
        <Card className="shadow-md border-green-300 bg-gradient-to-r from-green-50 to-green-100/60">
          <CardContent className="pt-6 pb-6 text-center">
            <FileText className="w-8 h-8 text-green-700 mx-auto mb-3" />
            <h3 className="text-lg font-bold">Atualize o PDF do seu orçamento</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Este orçamento já foi pago. {edicoesRestantes(local) === 1 ? 'Resta 1 edição gratuita' : `Restam ${edicoesRestantes(local)} edições gratuitas`} até {formatarData(local.expiraEm)}.
            </p>
            <Button size="lg" className="px-8 bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowCheckout(true)} disabled={faltas.length > 0}>
              <Zap className="w-4 h-4 mr-2" /> Gerar PDF atualizado
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-md border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="pt-6 pb-6 text-center">
            <FileText className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="text-lg font-bold">Gere o PDF completo do seu orçamento</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Com lista de materiais detalhada, circuitos e observações técnicas</p>
            <Button size="lg" className="px-8" onClick={() => setShowCheckout(true)} disabled={faltas.length > 0}>
              <Zap className="w-4 h-4 mr-2" /> {local?.entrega ? 'Ver meu PDF' : 'Gerar meu PDF'}
            </Button>
            {erros.length > 0 && faltas.length === 0 && (
              <p className="text-xs text-destructive mt-3">⚠ Há {erros.length} pendência(s) importante(s) — revise antes de pagar para o PDF não ficar incompleto</p>
            )}
          </CardContent>
        </Card>
      )}

      {showCheckout && <CheckoutModal valor={previa.valor} onClose={() => setShowCheckout(false)} />}
    </motion.div>
  );
}
