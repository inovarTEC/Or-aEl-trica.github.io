/* Navegação da prévia para a etapa/item de origem de uma pendência ou botão "Editar". */
export interface NavStore {
  setActiveRoomId: (id: string) => void;
  setActiveEquipId: (id: string) => void;
  setVeioDaPrevia: (v: boolean) => void;
  setStep: (s: number) => void;
}

export const STEP_COMODOS = 1;
export const STEP_PONTOS = 2;
export const STEP_EQUIPAMENTOS = 3;
export const STEP_ENTRADA = 4;
export const STEP_ATERRAMENTO = 5;
export const STEP_PREVIA = 6;

export function abrirPendencia(p: { step: number; roomId?: string; equipId?: string }, store: NavStore) {
  if (p.roomId) store.setActiveRoomId(p.roomId);
  if (p.equipId) store.setActiveEquipId(p.equipId);
  store.setVeioDaPrevia(true);
  store.setStep(p.step);
}
