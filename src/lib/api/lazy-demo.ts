import type { CommerceGateway } from './contracts';
/** The browser-only demo data is loaded on first use, outside the initial page bundle. */
export function createLazyDemoGateway(): CommerceGateway {
  let instance: Promise<CommerceGateway> | undefined;
  const load = () =>
    (instance ??= Promise.all([import('@/lib/demo/gateway'), import('@/lib/demo/storage')]).then(
      ([{ DemoGateway }, { MemoryDemoStorage, BrowserDemoStorage }]) =>
        new DemoGateway(
          typeof window === 'undefined' ? new MemoryDemoStorage() : new BrowserDemoStorage(),
        ),
    ));
  return {
    mode: 'demo',
    estimate: async (...args) => (await load()).estimate(...args),
    reportPrayer: async (...args) => (await load()).reportPrayer(...args),
    invitation: async (...args) => (await load()).invitation(...args),
    acceptInvitation: async (...args) => (await load()).acceptInvitation(...args),
    productReviews: async (...args) => (await load()).productReviews(...args),
    createReview: async (...args) => (await load()).createReview(...args),
    catalog: async (...args) => (await load()).catalog(...args),
    product: async (...args) => (await load()).product(...args),
    settings: async (...args) => (await load()).settings(...args),
    session: async (...args) => (await load()).session(...args),
    login: async (...args) => (await load()).login(...args),
    logout: async (...args) => (await load()).logout(...args),
    recover: async (...args) => (await load()).recover(...args),
    account: async (...args) => (await load()).account(...args),
    updateProfile: async (...args) => (await load()).updateProfile(...args),
    checkout: async (...args) => (await load()).checkout(...args),
    subscribe: async (...args) => (await load()).subscribe(...args),
    confirmDemoPayment: async (...args) => (await load()).confirmDemoPayment(...args),
    payment: async (...args) => (await load()).payment(...args),
    shipping: async (...args) => (await load()).shipping(...args),
    changeSubscription: async (...args) => (await load()).changeSubscription(...args),
    createTicket: async (...args) => (await load()).createTicket(...args),
    replyTicket: async (...args) => (await load()).replyTicket(...args),
    community: async (...args) => (await load()).community(...args),
    postPrayer: async (...args) => (await load()).postPrayer(...args),
    reactPrayer: async (...args) => (await load()).reactPrayer(...args),
    deletePrayer: async (...args) => (await load()).deletePrayer(...args),
    newsletter: async (...args) => (await load()).newsletter(...args),
    unsubscribeNewsletter: async (...args) => (await load()).unsubscribeNewsletter(...args),
    admin: async (...args) => (await load()).admin(...args),
    adminCommand: async (...args) => (await load()).adminCommand(...args),
  };
}
