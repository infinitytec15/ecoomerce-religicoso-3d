'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem } from '@/lib/domain/types';
interface CartStore {
  items: CartItem[];
  favorites: string[];
  isOpen: boolean;
  add: (item: CartItem) => void;
  change: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  toggleFavorite: (id: string) => void;
  setOpen: (open: boolean) => void;
  importLegacy: (items: CartItem[], favorites: string[]) => void;
}
export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      favorites: [],
      isOpen: false,
      add: (item) =>
        set((s) => {
          const found = s.items.find((x) => x.key === item.key);
          return {
            items: found
              ? s.items.map((x) =>
                  x.key === item.key
                    ? { ...x, quantity: Math.min(10, x.quantity + item.quantity) }
                    : x,
                )
              : [...s.items, item],
          };
        }),
      change: (key, quantity) =>
        set((s) => ({
          items: s.items.map((x) =>
            x.key === key ? { ...x, quantity: Math.max(1, Math.min(10, quantity)) } : x,
          ),
        })),
      remove: (key) => set((s) => ({ items: s.items.filter((x) => x.key !== key) })),
      clear: () => set({ items: [] }),
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((x) => x !== id)
            : [...s.favorites, id],
        })),
      setOpen: (isOpen) => set({ isOpen }),
      importLegacy: (items, favorites) => set({ items, favorites }),
    }),
    {
      name: 'meo-cart-v2',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, favorites: s.favorites }),
      skipHydration: true,
    },
  ),
);
