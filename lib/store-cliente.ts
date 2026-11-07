'use client';
import { create } from 'zustand';
import { AppState, Room, Equip, Ponto, Luz, Comando, Sw, Modulo, TipoComando, EntradaPrincipal, AterramentoPrincipal } from './types';
import { aterramentoPadrao } from './aterramento-calc';
import { entradaPadrao } from './entrada-calc';
import { STEP_ATERRAMENTO, STEP_ENTRADA, STEP_PREVIA } from './navegacao';
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
    entrada: entradaPadrao(),
    aterramento: aterramentoPadrao(),
    step: 0,
    activeRoomId: '',
    activeEquipId: '',
    veioDaPrevia: false,
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
  setActiveRoomId: (id: string) => void;
  setActiveEquipId: (id: string) => void;
  setVeioDaPrevia: (v: boolean) => void;
  addRoom: (room: Room) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  removeRoom: (id: string) => void;
  addEquip: (equip: Equip) => void;
  updateEquip: (id: string, patch: Partial<Equip>) => void;
  removeEquip: (id: string) => void;
  updateEntrada: (patch: Partial<EntradaPrincipal>) => void;
  updateAterramento: (patch: Partial<AterramentoPrincipal>) => void;
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
  updateSw: (roomId: string, cmdId: string, swId: string, patch: Partial<Sw>) => void;
  /** Liga a luz ao comando indicado (tirando-a de qualquer outro). cmdId '' = desvincula. */
  vincularLuzComando: (roomId: string, luzId: string, cmdId: string) => void;
  /** Troca o tipo do comando ajustando a quantidade de caixas (IS=1, IP=2, II>=3). */
  setTipoComando: (roomId: string, cmdId: string, t: TipoComando, novoSw: () => Sw) => void;
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
    setActiveRoomId: (activeRoomId) => update(() => ({ activeRoomId })),
    setActiveEquipId: (activeEquipId) => update(() => ({ activeEquipId })),
    setVeioDaPrevia: (veioDaPrevia) => update(() => ({ veioDaPrevia })),
    addRoom: (room) => update((s) => ({ rooms: [...(s?.rooms ?? []), room] })),
    updateRoom: (id, patch) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], id, (r) => ({ ...r, ...patch })),
    })),
    // Remove o cômodo (com seus pontos, luzes, comandos e caixas), os equipamentos dele
    // e qualquer rota de outro cômodo que passava por ele.
    removeRoom: (id) => update((s) => ({
      rooms: (s?.rooms ?? [])
        .filter((r: Room) => r?.id !== id)
        .map((r: Room) => r?.via === id ? { ...r, via: '' } : r),
      equips: (s?.equips ?? []).filter((e: Equip) => e?.room !== id),
      activeRoomId: s?.activeRoomId === id ? '' : s?.activeRoomId,
    })),
    addEquip: (equip) => update((s) => ({ equips: [...(s?.equips ?? []), equip] })),
    updateEquip: (id, patch) => update((s) => ({
      equips: (s?.equips ?? []).map((e: Equip) => e?.id === id ? { ...e, ...patch } : e),
    })),
    removeEquip: (id) => update((s) => ({
      equips: (s?.equips ?? []).filter((e: Equip) => e?.id !== id),
    })),
    updateEntrada: (patch) => update((s) => ({ entrada: { ...entradaPadrao(), ...(s?.entrada ?? {}), ...patch } })),
    updateAterramento: (patch) => update((s) => ({ aterramento: { ...aterramentoPadrao(), ...(s?.aterramento ?? {}), ...patch } })),
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
    updateSw: (roomId, cmdId, swId, patch) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        comandos: (r?.comandos ?? []).map((c: Comando) =>
          c?.id === cmdId ? { ...c, sws: (c?.sws ?? []).map((sw: Sw) => sw?.id === swId ? { ...sw, ...patch } : sw) } : c
        ),
      })),
    })),
    vincularLuzComando: (roomId, luzId, cmdId) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        comandos: (r?.comandos ?? []).map((c: Comando) => {
          const sem = (c?.luzes ?? []).filter((lid: string) => lid !== luzId);
          return { ...c, luzes: c?.id === cmdId ? [...sem, luzId] : sem };
        }),
      })),
    })),
    setTipoComando: (roomId, cmdId, t, novoSw) => update((s) => ({
      rooms: updateRoomInner(s?.rooms ?? [], roomId, (r) => ({
        ...r,
        comandos: (r?.comandos ?? []).map((c: Comando) => {
          if (c?.id !== cmdId) return c;
          let sws = [...(c?.sws ?? [])];
          const min = t === 'IS' ? 1 : t === 'IP' ? 2 : 3;
          while (sws.length < min) sws.push(novoSw());
          if (t !== 'II') sws = sws.slice(0, min);
          return { ...c, t, sws };
        }),
      })),
    })),
    resetState: () => {
      limparEstado();
      set(defaultState());
    },
    hydrateFromStorage: () => {
      const dados = carregarEstado()?.dados;
      if (!dados) return;
      // Orçamentos antigos: sem `entrada` a Prévia era o passo 4; sem `aterramento` era o passo 5. Levamos à Prévia atual.
      const d = dados as Partial<AppState>;
      const passo = dados.step ?? 0;
      const step = (!d.entrada && passo >= STEP_ENTRADA) || (!d.aterramento && passo >= STEP_ATERRAMENTO) ? STEP_PREVIA : passo;
      set({
        ...defaultState(), ...dados, step,
        entrada: { ...entradaPadrao(), ...(d.entrada ?? {}) },
        aterramento: { ...aterramentoPadrao(), ...(d.aterramento ?? {}) },
      });
    },
  };
});
