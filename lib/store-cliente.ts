'use client';
import { create } from 'zustand';
import { AppState, Room, Equip, Ponto, Luz, Comando, Sw, Modulo } from './types';
import { carregarEstado, limparEstado, novoEstado, salvarEstado } from './storage-local';

function defaultState(): AppState {
  return {
    id: '',
    imovel: '',
    obra: '',
    cobertura: '',
    rede: '',
    rooms: [],
    equips: [],
    step: 0,
  };
}

/** Grava os dados do wizard no estado local, preservando pagamento e entrega. */
function saveState(dados: AppState) {
  const atual = carregarEstado();
  salvarEstado(atual ? { ...atual, dados } : novoEstado(dados));
}

interface StoreActions {
  setField: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  setStep: (step: number) => void;
  addRoom: (room: Room) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  removeRoom: (id: string) => void;
  addEquip: (equip: Equip) => void;
  updateEquip: (id: string, patch: Partial<Equip>) => void;
  removeEquip: (id: string) => void;
  // Points helpers
  addPonto: (roomId: string, ponto: Ponto) => void;
  updatePonto: (roomId: string, pontoId: string, patch: Partial<Ponto>) => void;
  removePonto: (roomId: string, pontoId: string) => void;
  addLuz: (roomId: string, luz: Luz) => void;
  updateLuz: (roomId: string, luzId: string, patch: Partial<Luz>) => void;
  removeLuz: (roomId: string, luzId: string) => void;
  addComando: (roomId: string, cmd: Comando) => void;
  updateComando: (roomId: string, cmdId: string, patch: Partial<Comando>) => void;
  removeComando: (roomId: string, cmdId: string) => void;
  addModulo: (roomId: string, pontoId: string, mod: Modulo) => void;
  removeModulo: (roomId: string, pontoId: string, modId: string) => void;
  addSw: (roomId: string, cmdId: string, sw: Sw) => void;
  removeSw: (roomId: string, cmdId: string, swId: string) => void;
  /** Novo orçamento: apaga tudo do navegador (dados, Pix e PDF) e volta ao início. */
  resetState: () => void;
  hydrateFromStorage: () => void;
}

export type Store = AppState & StoreActions;

export const useStore = create<Store>((set) => {
  function update(fn: (s: AppState) => Partial<AppState>) {
    set((prev) => {
      const patch = fn(prev);
      const next = { ...prev, ...patch };
      saveState(next);
      return patch;
    });
  }

  function updateRoomInner(rooms: Room[], id: string, fn: (r: Room) => Room): Room[] {
    return (rooms ?? []).map((r: Room) => r?.id === id ? fn({ ...(r ?? {} as Room) }) : r);
  }

  return {
    ...defaultState(),
    setField: (key, value) => update(() => ({ [key]: value } as any)),
    setStep: (step) => update(() => ({ step })),
    addRoom: (room) => update((s) => ({ rooms: [...(s?.rooms ?? []), room] })),
    updateRoom: (id, patch) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], id, (r) => ({ ...r, ...patch })),
    })),
    removeRoom: (id) => update((s) => ({
      rooms: (s?.rooms ?? []).filter((r: Room) => r?.id !== id),
      equips: (s?.equips ?? []).map((e: Equip) => e?.room === id ? { ...e, room: '' } : e),
    })),
    addEquip: (equip) => update((s) => ({ equips: [...(s?.equips ?? []), equip] })),
    updateEquip: (id, patch) => update((s) => ({
      equips: (s?.equips ?? []).map((e: Equip) => e?.id === id ? { ...e, ...patch } : e),
    })),
    removeEquip: (id) => update((s) => ({
      equips: (s?.equips ?? []).filter((e: Equip) => e?.id !== id),
    })),
    addPonto: (roomId, ponto) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({ ...r, pontos: [...(r?.pontos ?? []), ponto] })),
    })),
    updatePonto: (roomId, pontoId, patch) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        pontos: (r?.pontos ?? []).map((p: Ponto) => p?.id === pontoId ? { ...p, ...patch } : p),
      })),
    })),
    removePonto: (roomId, pontoId) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        pontos: (r?.pontos ?? []).filter((p: Ponto) => p?.id !== pontoId),
      })),
    })),
    addLuz: (roomId, luz) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({ ...r, luzes: [...(r?.luzes ?? []), luz] })),
    })),
    updateLuz: (roomId, luzId, patch) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        luzes: (r?.luzes ?? []).map((l: Luz) => l?.id === luzId ? { ...l, ...patch } : l),
      })),
    })),
    removeLuz: (roomId, luzId) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        luzes: (r?.luzes ?? []).filter((l: Luz) => l?.id !== luzId),
        comandos: (r?.comandos ?? []).map((c: Comando) => ({
          ...c,
          luzes: (c?.luzes ?? []).filter((lid: string) => lid !== luzId),
        })),
      })),
    })),
    addComando: (roomId, cmd) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({ ...r, comandos: [...(r?.comandos ?? []), cmd] })),
    })),
    updateComando: (roomId, cmdId, patch) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        comandos: (r?.comandos ?? []).map((c: Comando) => c?.id === cmdId ? { ...c, ...patch } : c),
      })),
    })),
    removeComando: (roomId, cmdId) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        comandos: (r?.comandos ?? []).filter((c: Comando) => c?.id !== cmdId),
      })),
    })),
    addModulo: (roomId, pontoId, mod) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        pontos: (r?.pontos ?? []).map((p: Ponto) =>
          p?.id === pontoId ? { ...p, mods: [...(p?.mods ?? []), mod] } : p
        ),
      })),
    })),
    removeModulo: (roomId, pontoId, modId) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        pontos: (r?.pontos ?? []).map((p: Ponto) =>
          p?.id === pontoId ? { ...p, mods: (p?.mods ?? []).filter((m: Modulo) => m?.id !== modId) } : p
        ),
      })),
    })),
    addSw: (roomId, cmdId, sw) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        comandos: (r?.comandos ?? []).map((c: Comando) =>
          c?.id === cmdId ? { ...c, sws: [...(c?.sws ?? []), sw] } : c
        ),
      })),
    })),
    removeSw: (roomId, cmdId, swId) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        comandos: (r?.comandos ?? []).map((c: Comando) =>
          c?.id === cmdId ? { ...c, sws: (c?.sws ?? []).filter((sw: Sw) => sw?.id !== swId) } : c
        ),
      })),
    })),
    resetState: () => {
      limparEstado();
      set(defaultState());
    },
    hydrateFromStorage: () => {
      const dados = carregarEstado()?.dados;
      if (dados) set({ ...defaultState(), ...dados });
    },
  };
});
