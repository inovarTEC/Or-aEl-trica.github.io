'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store-cliente';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Copy, CheckCircle2, Loader2, Download, Mail, AlertTriangle, Printer, RefreshCw, Clock, Pencil, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { dadosDoOrcamento } from './step-previa';
import { imprimirHtml, baixarHtml } from '@/lib/pdf-cliente';
import {
  EDICOES_MAX, EstadoLocal, alterarEstado, PagamentoLocal, carregarEstado, edicoesRestantes, formatarData,
  novoEstado, podeEditar, salvarEstado,
} from '@/lib/storage-local';

type Fase = 'email' | 'pix' | 'vencido' | 'liberando' | 'pronto' | 'limite' | 'recusado' | 'erro';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Dados atuais do wizard (o que vai ao servidor) e a assinatura usada para saber se mudaram. */
function dadosAtuais() {
  const dados = dadosDoOrcamento(useStore.getState());
  return { dados, assinatura: JSON.stringify(dados) };
}

const gravar = (fn: (e: EstadoLocal) => EstadoLocal) => alterarEstado(fn, useStore.getState());

export default function CheckoutModal({ onClose, valor }: { onClose: () => void; valor: number }) {
  const [fase, setFase] = useState<Fase>('email');
  const [email, setEmail] = useState('');
  const [aceite, setAceite] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [pedido, setPedido] = useState<PagamentoLocal | null>(null);
  const [estado, setEstado] = useState<EstadoLocal | null>(null);
  const [restante, setRestante] = useState(0);
  const ocupado = useRef(false);

  const post = (url: string, p: PagamentoLocal) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chave': p.chave },
    body: JSON.stringify({ orcamentoId: p.orcamentoId, pagamentoId: p.pagamentoId, dados: dadosAtuais().dados }),
  });

  /** PDF atualizado de um orçamento já pago. `edicao` = false só para recuperar o PDF original. */
  const regerar = useCallback(async (p: PagamentoLocal, edicao: boolean) => {
    const r = await post('/api/regerar', p);
    if (r.status === 410) {
      setEstado(carregarEstado());
      setFase('limite');
      return;
    }
    if (!r.ok) throw new Error('falha');
    const { html } = await r.json();
    const { assinatura } = dadosAtuais();
    const e = gravar((s) => ({
      ...s,
      entrega: { html, edicoes: (s.entrega?.edicoes ?? 0) + (edicao ? 1 : 0), entregueEm: Date.now(), assinatura },
    }));
    setEstado(e);
    setFase('pronto');
  }, []);

  /** Primeira entrega do pagamento aprovado. */
  const liberar = useCallback(async (p: PagamentoLocal) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setFase('liberando');
    try {
      const r = await post('/api/liberar', p);
      // Já entregue (ex.: a resposta anterior se perdeu): recupera o PDF sem gastar edição.
      if (r.status === 409) return await regerar(p, false);
      if (!r.ok) throw new Error('falha');
      const { html } = await r.json();
      const { assinatura } = dadosAtuais();
      const agora = Date.now();
      // Os 15 dias de edição contam a partir do pagamento.
      const e = gravar((s) => ({
        ...s,
        criadoEm: agora,
        expiraEm: agora + (s.expiraEm - s.criadoEm),
        entrega: { html, edicoes: 0, entregueEm: agora, assinatura },
      }));
      setEstado(e);
      setFase('pronto');
    } catch {
      ocupado.current = false;
      toast.error('Não foi possível liberar o PDF agora. Tentando de novo...');
      setFase('pix');
    }
  }, [regerar]);

  /* Ao abrir: decide a fase pelo que está salvo no navegador. */
  useEffect(() => {
    const e = carregarEstado();
    setEstado(e);
    const p = e?.pagamento ?? null;
    setPedido(p);
    if (e?.entrega && p) {
      if (e.entrega.assinatura === dadosAtuais().assinatura) return setFase('pronto'); // nada mudou
      if (!podeEditar(e)) return setFase('limite');
      if (ocupado.current) return; // evita gastar duas edições se o efeito rodar duas vezes
      ocupado.current = true;
      setFase('liberando');
      regerar(p, true).catch(() => setFase('erro'));
      return;
    }
    if (p) setFase('pix');
  }, [regerar]);

  /* Consulta o status do Pix a cada 3 s enquanto a tela do QR Code está aberta. */
  useEffect(() => {
    if (fase !== 'pix' || !pedido) return;
    let parar = false;
    const checar = async () => {
      try {
        const q = new URLSearchParams({ orcamentoId: pedido.orcamentoId, pagamentoId: pedido.pagamentoId });
        const r = await fetch(`/api/verificar?${q}`, { headers: { 'x-chave': pedido.chave }, cache: 'no-store' });
        if (!r.ok || parar) return;
        const { status } = await r.json();
        if (parar) return;
        if (status === 'aprovado') liberar(pedido);
        else if (status === 'vencido') setFase('vencido');
        else if (status === 'recusado') setFase('recusado');
      } catch { /* tenta de novo no próximo ciclo */ }
    };
    checar();
    const t = setInterval(checar, 3000);
    return () => { parar = true; clearInterval(t); };
  }, [fase, pedido, liberar]);

  /* Contagem regressiva do QR Code */
  useEffect(() => {
    if (fase !== 'pix' || !pedido?.expira) return;
    const tick = () => setRestante(Math.max(0, Math.floor((Date.parse(pedido.expira) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [fase, pedido]);

  const criar = async (corpo: { email: string; dados: unknown } | { orcamentoId: string; chave: string }) => {
    setCarregando(true);
    try {
      const r = await fetch('/api/pagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json();
      if (!r.ok) {
        toast.error(
          j?.erro === 'email_invalido' ? 'E-mail inválido'
          : j?.erro === 'dados_incompletos' || j?.erro === 'dados_invalidos' ? 'Há dados obrigatórios faltando ou inválidos. Confira as etapas do orçamento.'
          : 'Não foi possível gerar o Pix. Tente novamente.',
        );
        return;
      }
      const novo: PagamentoLocal = {
        orcamentoId: j.orcamentoId,
        chave: j.chave ?? pedido?.chave ?? '',
        pagamentoId: j.pagamentoId,
        qrCode: j.qrCode,
        qrBase64: j.qrBase64,
        expira: j.expira,
        email: 'email' in corpo ? corpo.email : pedido?.email ?? '',
      };
      ocupado.current = false;
      setEstado(gravar((s) => ({ ...s, pagamento: novo })));
      setPedido(novo);
      setFase('pix');
    } catch {
      toast.error('Erro de conexão. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  const enviarEmail = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return toast.error('Digite um e-mail válido');
    if (!aceite) return toast.error('Marque o aceite para continuar');
    criar({ email: email.trim(), dados: dadosAtuais().dados });
  };

  const novoQr = () => pedido && criar({ orcamentoId: pedido.orcamentoId, chave: pedido.chave });

  /** Limite atingido: começa uma nova compra mantendo os dados do wizard. */
  const pagarNovamente = () => {
    const e = novoEstado(useStore.getState());
    salvarEstado(e);
    setEstado(e);
    setPedido(null);
    setEmail(pedido?.email ?? '');
    ocupado.current = false;
    setFase('email');
  };

  const copiar = () => {
    if (!pedido) return;
    navigator.clipboard?.writeText(pedido.qrCode).then(() => toast.success('Código Pix copiado!')).catch(() => {});
  };

  const html = estado?.entrega?.html ?? '';
  const restantes = estado ? edicoesRestantes(estado) : 0;
  const mmss = `${String(Math.floor(restante / 60)).padStart(2, '0')}:${String(restante % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardContent className="pt-5 pb-5 relative">
            <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>

            {fase === 'email' && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-bold">Finalizar pedido</h3>
                  <p className="text-sm text-muted-foreground">PDF do orçamento completo — <strong className="text-primary">{brl(valor)}</strong></p>
                </div>
                <div>
                  <Label className="text-xs">Seu e-mail</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-10" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Usado apenas para registrar o pagamento no Pix</p>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="aceite" checked={aceite} onCheckedChange={(v) => setAceite(!!v)} className="mt-0.5" />
                  <label htmlFor="aceite" className="text-xs text-muted-foreground cursor-pointer">
                    Aceito que meus dados serão usados apenas para gerar o orçamento
                  </label>
                </div>
                <Button className="w-full" onClick={enviarEmail} disabled={carregando}>
                  {carregando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Pagar com Pix — {brl(valor)}
                </Button>
              </div>
            )}

            {fase === 'pix' && pedido && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-bold">Pague com Pix</h3>
                  <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código</p>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                  <span className="mt-0.5 text-base leading-none">🔒</span>
                  <span>
                    <strong>Pagamento 100% seguro via Mercado Pago</strong> — líder em pagamentos na América Latina.
                    Após a confirmação do Pix, seu PDF detalhado é liberado automaticamente.
                  </span>
                </div>
                <div className="flex justify-center">
                  <div className="w-52 h-52 bg-white rounded-xl flex items-center justify-center p-2">
                    {pedido.qrBase64
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`data:image/png;base64,${pedido.qrBase64}`} alt="QR Code Pix" className="w-full h-full" />
                      : <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Código Pix (copia e cola)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={pedido.qrCode} className="text-xs font-mono" />
                    <Button variant="outline" size="icon" onClick={copiar} aria-label="Copiar"><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Aguardando confirmação do pagamento...
                </div>
                {pedido.expira && (
                  <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" /> Este QR Code vale por {mmss}
                  </p>
                )}
              </div>
            )}

            {fase === 'vencido' && (
              <div className="space-y-4 text-center py-2">
                <Clock className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">O QR Code venceu</h3>
                <p className="text-sm text-muted-foreground">Seu orçamento continua salvo neste navegador. Você pode revisá-lo ou gerar um novo QR Code para pagar.</p>
                <Button className="w-full" onClick={novoQr} disabled={carregando}>
                  {carregando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Gerar novo QR
                </Button>
                <Button variant="outline" className="w-full" onClick={onClose}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar orçamento
                </Button>
              </div>
            )}

            {fase === 'liberando' && (
              <div className="space-y-4 text-center py-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <h3 className="text-lg font-bold">{estado?.entrega ? 'Atualizando o seu PDF...' : 'Pagamento confirmado!'}</h3>
                <p className="text-sm text-muted-foreground">Preparando o seu PDF...</p>
              </div>
            )}

            {fase === 'pronto' && html && (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <h3 className="text-lg font-bold">Seu orçamento está pronto!</h3>
                <p className="text-sm text-muted-foreground">
                  Clique em salvar e escolha <strong>“Salvar como PDF”</strong> na janela de impressão.
                </p>
                <Button className="w-full" onClick={() => imprimirHtml(html)}><Printer className="w-4 h-4 mr-2" /> Salvar como PDF</Button>
                <Button variant="outline" className="w-full" onClick={() => baixarHtml(html)}><Download className="w-4 h-4 mr-2" /> Baixar cópia (.html)</Button>
                {estado && (
                  <p className="text-[11px] text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-left">
                    {restantes > 0
                      ? <>Precisa mudar algo? Feche esta janela, edite o orçamento e gere o PDF de novo: {restantes === 1 ? 'resta 1 edição gratuita' : `restam ${restantes} edições gratuitas`} até {formatarData(estado.expiraEm)}.</>
                      : <>Você já usou as {EDICOES_MAX} edições gratuitas deste orçamento.</>}
                  </p>
                )}
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                  O PDF fica guardado só neste navegador. «Novo orçamento» ou limpar os dados do navegador apagam tudo.
                </p>
              </div>
            )}

            {fase === 'limite' && (
              <div className="space-y-4 text-center py-2">
                <Ban className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">Edições gratuitas encerradas</h3>
                <p className="text-sm text-muted-foreground">
                  Você usou suas 3 edições gratuitas (ou o prazo de 15 dias venceu). Para gerar um novo orçamento pago, clique abaixo.
                </p>
                <Button className="w-full" onClick={pagarNovamente}>Pagar novamente — {brl(valor)}</Button>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}

            {fase === 'recusado' && (
              <div className="space-y-4 text-center py-2">
                <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">Pagamento não aprovado</h3>
                <p className="text-sm text-muted-foreground">Seu orçamento continua salvo. Você pode tentar com um novo Pix.</p>
                <Button className="w-full" onClick={novoQr} disabled={carregando}>
                  {carregando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Tentar novamente
                </Button>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}

            {fase === 'erro' && (
              <div className="space-y-4 text-center py-2">
                <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">Não foi possível gerar o PDF agora</h3>
                <p className="text-sm text-muted-foreground">Nenhuma edição foi gasta. Verifique a conexão e tente de novo.</p>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
