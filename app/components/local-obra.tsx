'use client';
import { useStore } from '@/lib/store-cliente';
import { entradaPadrao, patchTensao, patchUf } from '@/lib/entrada-calc';
import { UFS, infoUf } from '@/lib/tensao-por-uf';
import type { EntradaPrincipal } from '@/lib/types';
import { Label } from '@/components/ui/label';

const selCls = 'mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm';

/**
 * Estado (UF) e tensão da localidade. É o MESMO dado da etapa "Entrada de energia": escolher aqui já preenche lá
 * (categoria, disjuntor geral, cabo) e define a tensão das tomadas usada para dividir circuitos com equipamentos.
 */
export default function LocalObra() {
  const store = useStore();
  const e: EntradaPrincipal = { ...entradaPadrao(), ...(store?.entrada ?? {}) };
  const up = (patch: Partial<EntradaPrincipal>) => store.updateEntrada(patch);
  const ufInfo = infoUf(e.uf);
  const potKw = parseFloat(e.potenciaDemandada) || 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Estado (UF) da obra</Label>
          <select value={e.uf ?? ''} className={selCls} onChange={(ev) => up(patchUf(ev.target.value, potKw))}>
            <option value="">Selecione…</option>
            {UFS.map((u) => <option key={u.uf} value={u.uf}>{u.uf} — {u.nome}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Tensão da localidade</Label>
          <select value={e.sistemaTensao ?? 'nao-sei'} className={selCls}
            onChange={(ev) => up(patchTensao(e, ev.target.value as NonNullable<EntradaPrincipal['sistemaTensao']>))}>
            <option value="nao-sei">Não sei (adota 220/127 V)</option>
            <option value="220/127">220/127 V</option>
            <option value="380/220">380/220 V</option>
          </select>
        </div>
      </div>
      {ufInfo && (
        <p className="text-[11px] text-muted-foreground">
          Distribuidora: {ufInfo.distribuidora} — {ufInfo.tensao} V. Confirme a tensão na sua conta de luz.
        </p>
      )}
    </div>
  );
}
