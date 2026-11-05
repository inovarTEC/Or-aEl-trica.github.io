'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore, CHAVE_PEDIDO as SESSAO } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Copy, CheckCircle2, Loader2, Download, Mail, FileText, AlertTriangle, Printer, RefreshCw, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { dadosDoOrcamento } from './step-previa';
import { imprimirHtml, baixarHtml } from '@/lib/pdf-cliente';
import { guardarSalvo, formatarData } from '@/lib/meus-orcamentos';

type Fase = 'email' | 'pix' | 'vencido' | 'liberando' | 'pronto' | 'recusado' | 'jaentregue' | 'erro';

interface Pedido {
  orcamentoId: string;
  chave: string;
  pagamentoId: string;
  qrCode: string;
  qrBase64: string;
  expira: string;
  email: string;
}

interface Entrega {
  codigo: string;
  expiraEm: string;
  restantes: number;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CheckoutModal({ onClose, valor }: { onClose: () => void; valor: number }) {
  const store = useStore();
  const [fase, setFase] = useState<Fase>('email');
  const [email, setEmail] = useState('');
  const [aceite, setAceite] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [html, setHtml] = useState('');
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [restante, setRestante] = useState(0);
  const liberando = useRef(false);

  const salvar = (p: Pedido | null, h = '', e: Entrega | null = null) => {
    try {
      if (p) sessionStorage.setItem(SESSAO, JSON.stringify({ p, h, e }));
      else sessionStorage.removeItem(SESSAO);
    } catch { /* sem sessionStorage: segue sem retomar */ }
  };

  /* Retoma um pedido em andamento (ex.: usuário fechou a janela depois de gerar o Pix). */
  useEffect(() => {
    try {
      const bruto = sessionStorage.getItem(SESSAO);
      if (!bruto) return;
      const { p, h, e } = JSON.parse(bruto);
      if (!p?.orcamentoId) return;
      setPedido(p);
      if (h) { setHtml(h); setEntrega(e ?? null); setFase('pronto'); } else setFase('pix');
    } catch { /* ignora */ }
  }, []);

  const cab = (p: Pedido) => ({ 'Content-Type': 'application/json', 'x-chave': p.chave });

  const liberar = useCallback(async (p: Pedido) => {
    if (liberando.current) return;
    liberando.current = true;
    setFase('liberando');
    try {
      const r = await fetch('/api/liberar', {
        method: 'POST',
        headers: cab(p),
        body: JSON.stringify({ orcamentoId: p.orcamentoId, pagamentoId: p.pagamentoId }),
      });
      if (r.status === 409) { salvar(null); setFase('jaentregue'); return; }
      if (!r.ok) throw new Error('falha');
      const j = await r.json();
      const e: Entrega = { codigo: j.codigo, expiraEm: j.expiraEm, restantes: j.restantes };
      setHtml(j.html);
      setEntrega(e);
      salvar(p, j.html, e);
      if (p.email) {
        guardarSalvo({ codigo: e.codigo, email: p.email, expiraEm: e.expiraEm });
        useStore.getState().atualizarEdicao({ ...e, email: p.email });
      }
      setFase('pronto');
    } catch {
      liberando.current = false;
      toast.error('Não foi possível liberar o PDF agora. Tentando de novo...');
      setFase('pix');
    }
  }, []);

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

  /* Contagem regressiva */
  useEffect(() => {
    if (fase !== 'pix' || !pedido?.expira) return;
    const tick = () => setRestante(Math.max(0, Math.floor((Date.parse(pedido.expira) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [fase, pedido]);

  const criar = async (corpo: { email?: string; dados?: unknown; orcamentoId?: string; chave?: string }) => {
    setCarregando(true);
    try {
      const r = await fetch('/api/pagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j?.erro === 'email_invalido' ? 'E-mail inválido' : 'Não foi possível gerar o Pix. Tente novamente.');
        return;
      }
      const novo: Pedido = {
        orcamentoId: j.orcamentoId,
        chave: j.chave ?? pedido?.chave ?? '',
        pagamentoId: j.pagamentoId,
        qrCode: j.qrCode,
        qrBase64: j.qrBase64,
        expira: j.expira,
        email: corpo.email ?? pedido?.email ?? '',
      };
      liberando.current = false;
      setPedido(novo);
      salvar(novo);
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
    criar({ email: email.trim(), dados: dadosDoOrcamento(store) });
  };

  const novoQr = () => pedido && criar({ orcamentoId: pedido.orcamentoId, chave: pedido.chave });

  const copiar = () => {
    if (!pedido) return;
    navigator.clipboard?.writeText(pedido.qrCode).then(() => toast.success('Código Pix copiado!')).catch(() => {});
  };

  const imprimir = () => imprimirHtml(html);
  const baixar = () => baixarHtml(html, `orcamento-eletrico-${pedido?.orcamentoId.slice(0, 8) ?? 'pdf'}.html`);

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
                <p className="text-sm text-muted-foreground">Seu orçamento continua salvo. Gere um novo QR Code para pagar.</p>
                <Button className="w-full" onClick={novoQr} disabled={carregando}>
                  {carregando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Gerar novo QR Code
                </Button>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}

            {fase === 'liberando' && (
              <div className="space-y-4 text-center py-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <h3 className="text-lg font-bold">Pagamento confirmado!</h3>
                <p className="text-sm text-muted-foreground">Preparando o seu PDF...</p>
              </div>
            )}

            {fase === 'pronto' && (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <h3 className="text-lg font-bold">Seu orçamento está pronto!</h3>
                <p className="text-sm text-muted-foreground">
                  Clique em salvar e escolha <strong>“Salvar como PDF”</strong> na janela de impressão.
                </p>
                <Button className="w-full" onClick={imprimir}><Printer className="w-4 h-4 mr-2" /> Salvar como PDF</Button>
                <Button variant="outline" className="w-full" onClick={baixar}><Download className="w-4 h-4 mr-2" /> Baixar cópia (.html)</Button>
                {entrega && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-left">
                    <p className="text-[11px] text-green-800">Código do seu orçamento</p>
                    <p className="font-mono text-lg font-bold tracking-wider text-green-900">{entrega.codigo}</p>
                    <p className="text-[11px] text-green-800 mt-1">
                      Com este código e o seu e-mail você altera este orçamento sem custo até {formatarData(entrega.expiraEm)}
                      {' '}({entrega.restantes} {entrega.restantes === 1 ? 'edição' : 'edições'}). O código também está no PDF.
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                  Salve agora: por segurança, o PDF de um pagamento é entregue uma única vez.
                </p>
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

            {fase === 'jaentregue' && (
              <div className="space-y-4 text-center py-2">
                <FileText className="w-14 h-14 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-bold">PDF já entregue</h3>
                <p className="text-sm text-muted-foreground">O PDF deste pagamento já foi liberado. Se não conseguiu salvar, fale com o suporte informando o seu e-mail.</p>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}

            {fase === 'erro' && (
              <div className="space-y-4 text-center py-2">
                <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">Algo deu errado</h3>
                <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
