'use client';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';

const STEPS = ['Imóvel', 'Cômodos', 'Pontos', 'Equipamentos', 'Entrada', 'Aterramento', 'Prévia'];

export default function ProgressBar({ step, onStepClick }: { step: number; onStepClick: (s: number) => void }) {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <button
                onClick={() => onStepClick(i)}
                className={`flex flex-col items-center gap-1 group cursor-pointer transition-all ${
                  done || active ? '' : 'opacity-50'
                }`}
                type="button"
              >
                <motion.div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
                    done
                      ? 'bg-primary border-primary text-primary-foreground'
                      : active
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-muted-foreground/30 text-muted-foreground bg-card'
                  } group-hover:scale-110`}
                  whileTap={{ scale: 0.95 }}
                >
                  {done ? <Check className="w-4 h-4" /> : i + 1}
                </motion.div>
                <span className={`text-xs font-medium hidden sm:block ${
                  active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${
                  done ? 'bg-primary' : 'bg-border'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
