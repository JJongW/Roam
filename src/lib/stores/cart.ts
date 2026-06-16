"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * The visitor's chosen booths ("내 동선에 담은 부스"). The route is derived from
 * this set — recommendations fill it, and the user adds/removes freely.
 */
interface CartState {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  setIds: (ids: string[]) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ids: [],
      has: (id) => get().ids.includes(id),
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id)
            ? s.ids.filter((x) => x !== id)
            : [...s.ids, id],
        })),
      add: (id) =>
        set((s) => (s.ids.includes(id) ? s : { ids: [...s.ids, id] })),
      remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
      setIds: (ids) => set({ ids: [...new Set(ids)] }),
      clear: () => set({ ids: [] }),
    }),
    { name: "roam-cart", storage: createJSONStorage(() => localStorage) },
  ),
);
