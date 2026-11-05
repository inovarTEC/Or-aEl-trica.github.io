'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { DadosOrcamento } from '@/lib/types';
import { OrcamentoSalvo, formatarData, guardarSalvo, lerSalvos, removerSalvo } from '@/lib/meus-orcamentos';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X, FolderOpen, Loader2, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Resposta {
  estado: 'ativo' | 'sem_edicoes' | 'expirado';
  dados: DadosOrcamento;
  codigo: string;
  expiraEm: string;
  restantes: number;
}

export default function AbrirOrcamento({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [salvos, setSalvos] = useState<OrcamentoSalvo[]>(() => lerSalvos());
  const [codigo, setCodigo] = useState('');
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [encerrado, setEncerrado] = useState<Resposta | null>(null);

  /** Só pergunta se já houver um orçamento na tela, pois ele será substituído. */
  const podeSubstituir = () => store.rooms.length === 0 || window.confirm('O orçamento que está na tela será substituído. Continuar?');

  const abrir = async (cod: string, mail: string) => {
    setCarregando(true);
    try {
      const r = await fetch('/api/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: cod, email: mail }),
      });
      if (r.status === 429) { toast.error('Muitas tentativas. Aguarde alguns minutos e tente de novo.'); return; }
      if (!r.ok) { toast.error('Código ou e-mail não conferem, ou o orçamento já foi apagado.'); return; }
      const j: Resposta = await r.json();
      if (j.estado !== 'ativo') { setEncerrado(j); return; }
      if (!podeSubstituir()) return;
      guardarSalvo({ codigo: j.codigo, email: mail, expiraEm: j.expiraEm });
      store.carregarOrcamento(j.dados, { codigo: j.codigo, email: mail, expiraEm: j.expiraEm, restantes: j.restantes });
      toast.success('Orçamento carregado. Faça as alterações e gere o PDF atualizado.');
      onClose();
    } catch {
      toast.error('Erro de conexão. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  const usarComoBase = () => {
    if (!encerrado || !podeSubstituir()) return;
    store.carregarOrcamento(encerrado.dados, null);
    onClose();
  };

  const apagar = (c: string) => { removerSalvo(c); setSalvos(lerSalvos()); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <Card className="shadow-xl">
          <CardContent className="pt-5 pb-5 relative">
            <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>

            {encerrado ? (
              <div className="space-y-4 text-center py-2">
                <Clock className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="text-lg font-bold">Edição gratuita encerrada</h3>
                <p className="text-sm text-muted-foreground">
                  {encerrado.estado === 'expirado'
                    ? `O prazo de edição gratuita deste orçamento terminou em ${formatarData(encerrado.expiraEm)}.`
                    : 'As edições gratuitas deste orçamento acabaram.'}
                  {' '}Você pode usar os dados como base de um orçamento novo. Para gerar o PDF dele, o pagamento é cobrado normalmente.
                </p>
                <Button className="w-full" onClick={usarComoBase}>Usar como base de um novo orçamento</Button>
                <Button variant="outline" className="w-full" onClick={() => setEncerrado(null)}>Voltar</Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="text-center">
                  <FolderOpen className="w-10 h-10 text-primary mx-auto mb-2" />
                  <h3 className="text-lg font-bold">Abrir orçamento anterior</h3>
                  <p className="text-sm text-muted-foreground">Edite sem custo um orçamento que você já pagou, dentro do prazo.</p>
                </div>

                {salvos.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Neste aparelho</Label>
                    {salvos.map((s) => {
                      const vencido = Date.parse(s.expiraEm) < Date.now();
                      return (
                        <div key={s.codigo} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold">{s.codigo}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {vencido ? `Prazo encerrado em ${formatarData(s.expiraEm)}` : `Edição gratuita até ${formatarData(s.expiraEm)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" disabled={carregando} onClick={() => abrir(s.codigo, s.email)}>Abrir</Button>
                            <Button size="icon" variant="ghost" aria-label="Remover da lista" onClick={() => apagar(s.codigo)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs">{salvos.length > 0 ? 'Ou use um código' : 'Use o código do seu PDF'}</Label>
                  <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código (ex.: K7M2-9PQX-4TRH)" className="font-mono" />
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail usado no pagamento" />
                  <Button className="w-full" disabled={carregando || !codigo.trim() || !email.trim()} onClick={() => abrir(codigo, email.trim())}>
                    {carregando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Abrir orçamento
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
