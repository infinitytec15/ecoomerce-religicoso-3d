import type { Operations, Session } from '@/lib/domain/types';
import { createSeed, DEMO_EMAIL, STAFF_PERMISSIONS } from './seed';
export interface DemoStorage {
  load(): Operations;
  save(value: Operations): void;
  session(): Session | null;
  saveSession(value: Session | null): void;
}
export class MemoryDemoStorage implements DemoStorage {
  constructor(
    private value = createSeed(),
    private currentSession: Session | null = null,
  ) {}
  load() {
    return structuredClone(this.value);
  }
  save(value: Operations) {
    this.value = structuredClone(value);
  }
  session() {
    return this.currentSession;
  }
  saveSession(value: Session | null) {
    this.currentSession = value;
  }
}
export class BrowserDemoStorage implements DemoStorage {
  private readonly key = 'meo-commerce-v2';
  private readonly sessionKey = 'meo-session-v2';
  load(): Operations {
    try {
      const current = localStorage.getItem(this.key);
      if (current) {
        const state = JSON.parse(current) as Operations;
        if (state.version === 2 && Array.isArray(state.products) && Array.isArray(state.orders))
          return {
            ...createSeed(),
            ...state,
            workspace: { ...createSeed().workspace, ...state.workspace },
            invitations: state.invitations || [],
            editions: state.editions || createSeed().editions,
            coupons: state.coupons || [],
            stockMovements: state.stockMovements || [],
            reviews: state.reviews || [],
          };
      }
      const previous = localStorage.getItem('amago-operations-v1');
      let state = createSeed();
      if (previous) {
        const old = JSON.parse(previous);
        if (Array.isArray(old.clients) && Array.isArray(old.orders) && old.settings)
          state = createSeed(old);
      }
      const prayers = JSON.parse(localStorage.getItem('amago-prayers') || '[]') as {
        id: string;
        name: string;
        title: string;
        message: string;
        category: string;
        anonymous: boolean;
        created?: string;
      }[];
      const hidden = JSON.parse(localStorage.getItem('amago-hidden-prayers') || '[]') as string[],
        prayed = JSON.parse(localStorage.getItem('amago-prayed') || '[]') as string[];
      state.prayers = [
        ...prayers.map((p) => ({
          ...p,
          created: p.created || '2026-11-09',
          example: false,
          hidden: hidden.includes(p.id),
          reactions: prayed.includes(p.id) ? 1 : 0,
          prayed: prayed.includes(p.id),
          owned: true,
        })),
        ...state.prayers.map((p) => ({
          ...p,
          hidden: hidden.includes(p.id),
          prayed: prayed.includes(p.id),
          reactions: prayed.includes(p.id) ? 1 : 0,
        })),
      ];
      state.newsletter = JSON.parse(localStorage.getItem('amago-newsletter') || 'null');
      this.save(state);
      return state;
    } catch {
      return createSeed();
    }
  }
  save(value: Operations) {
    localStorage.setItem(this.key, JSON.stringify(value));
  }
  session(): Session | null {
    try {
      const value = sessionStorage.getItem(this.sessionKey);
      if (value) return JSON.parse(value) as Session;
      const admin = JSON.parse(sessionStorage.getItem('amago-admin-session') || 'null');
      if (admin?.demo)
        return {
          id: 'staff-demo',
          name: 'Equipe Mãos em Oração',
          email: DEMO_EMAIL,
          role: 'admin',
          permissions: STAFF_PERMISSIONS,
          owner: true,
          demo: true,
        };
      const client = JSON.parse(localStorage.getItem('amago-customer') || 'null');
      if (client?.email) {
        const found = this.load().clients.find(
          (c) => c.email.toLowerCase() === client.email.toLowerCase(),
        );
        if (found)
          return {
            id: found.id,
            name: found.name,
            email: found.email,
            role: 'customer',
            permissions: [],
            demo: true,
          };
      }
      return null;
    } catch {
      return null;
    }
  }
  saveSession(value: Session | null) {
    sessionStorage.setItem(this.sessionKey, JSON.stringify(value));
  }
}
