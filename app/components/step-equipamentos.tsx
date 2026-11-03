'use client';
import { useStore } from '@/lib/store';
import { uid } from '@/lib/templates';
import { Equip, Room, TipoEquip, Tensao } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Zap, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

  const addEquip = () => {
    store.addEquip({
      id: uid(), tipo: '', room: '', pot: '', tens: '', dint: '', dist: '', alim: '',
    });
    toast.success('Equipamento adicionado');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight">Equipamentos especiais</h2>
        <p className="text-muted-foreground mt-1">Aparelhos que precisam de circuito próprio (chuveiro, ar-condicionado, etc.)</p>
      </div>

      <AnimatePresence mode="popLayout">
        {equips.map((e: Equip, idx: number) => (
          <motion.div key={e?.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <Card className="shadow-sm">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Equipamento {idx + 1}</span>
                  </div>
                  <button type="button" onClick={() => { store.removeEquip(e?.id ?? ''); toast.success('Equipamento removido'); }}
                    className="text-destructive hover:text-destructive/80"><Trash2 className="w-4 h-4" /></button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <select value={e?.tipo ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { tipo: ev?.target?.value as TipoEquip })}
                      className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                      <option value="">Selecione...</option>
                      {EQUIP_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Cômodo</Label>
                    <select value={e?.room ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { room: ev?.target?.value ?? '' })}
                      className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                      <option value="">Selecione...</option>
                      {rooms.map((rm: Room) => <option key={rm?.id} value={rm?.id ?? ''}>{rm?.nome || rm?.base || 'Cômodo'}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Potência (W)</Label>
                    <Input type="number" min="0" value={e?.pot ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { pot: ev?.target?.value ?? '' })} placeholder="Ex: 5500" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Tensão</Label>
                    <select value={e?.tens ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { tens: ev?.target?.value as Tensao })}
                      className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                      <option value="">Selecione</option>
                      <option value="127V">127V</option>
                      <option value="220V">220V</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Distância ao quadro (m)</Label>
                    <Input type="number" step="0.1" min="0" value={e?.dist ?? ''} onChange={(ev: any) => store.updateEquip(e?.id ?? '', { dist: ev?.target?.value ?? '' })} placeholder="0.0" className="mt-1" />
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
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      <Button variant="outline" className="w-full" onClick={addEquip}>
        <Plus className="w-4 h-4 mr-2" /> Adicionar equipamento
      </Button>

      {equips.length === 0 && (
        <div className="text-center py-8">
          <Zap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum equipamento especial adicionado</p>
          <p className="text-xs text-muted-foreground mt-1">Se não tiver chuveiro, ar-condicionado etc., pode pular esta etapa</p>
        </div>
      )}
    </motion.div>
  );
}
