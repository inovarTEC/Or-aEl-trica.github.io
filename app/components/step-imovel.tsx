'use client';
import { useStore } from '@/lib/store-cliente';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Building2, Hammer, Layers, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const OPTIONS: { key: 'imovel' | 'obra' | 'cobertura' | 'rede'; label: string; icon: any; items: string[]; help: string }[] = [
  { key: 'imovel', label: 'Tipo de imóvel', icon: Building2, items: ['Casa', 'Apartamento', 'Comércio pequeno'], help: 'Qual é o tipo do seu imóvel?' },
  { key: 'obra', label: 'Tipo de obra', icon: Hammer, items: ['Construção nova', 'Reforma', 'Ampliação'], help: 'Qual é a situação da obra?' },
  { key: 'cobertura', label: 'Cobertura', icon: Layers, items: ['Laje', 'Forro de gesso', 'Telhado aparente', 'Não sei'], help: 'Como é o teto do imóvel?' },
  { key: 'rede', label: 'Ligação elétrica', icon: Zap, items: ['Monofásico', 'Bifásico', 'Trifásico', 'Não sei'], help: 'Qual o tipo de ligação da rede? Se não souber, sem problema!' },
];

export default function StepImovel() {
  const store = useStore();
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Sobre o imóvel</h2>
        <p className="text-muted-foreground mt-1">Informe as características gerais do seu imóvel</p>
      </div>
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const current = (store as any)?.[opt.key] ?? '';
        return (
          <Card key={opt.key} className="shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-primary" />
                <Label className="text-sm font-semibold">{opt.label}</Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{opt.help}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {opt.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => store.setField(opt.key, item as any)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                      current === item
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card border-border hover:border-primary/50 hover:bg-primary/5'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </motion.div>
  );
}
