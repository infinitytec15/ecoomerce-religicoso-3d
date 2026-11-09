'use client';
import { create } from 'zustand';
export const useUiStore = create<{
  newsletterOpen: boolean;
  setNewsletterOpen: (open: boolean) => void;
}>((set) => ({
  newsletterOpen: false,
  setNewsletterOpen: (newsletterOpen) => set({ newsletterOpen }),
}));
