const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function environment() {
  const values = new Map();
  const context = vm.createContext({
    URLSearchParams, location: { search: '', hash: '#/' },
    localStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) },
    assert,
  });
  const app = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
  vm.runInContext(app.slice(0, app.indexOf('function header()')), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'dist/ops-data.js'), 'utf8'), context);
  return code => vm.runInContext(code, context);
}

test('Pix checkout, operational receipt and shipment retain one linked order', () => {
  environment()(`
    orders.push({id:'qa-pix',number:'QA-0001',items:[],total:100,payment:'pix',status:'Aguardando Pix',address:{name:'Teste',email:'teste@exemplo.com'}});
    syncStoreOps(); syncStoreOps();
    const linked=ops.orders.filter(x=>x.sourceOrderId==='qa-pix');
    assert.equal(linked.length,1);
    assert.equal(ops.charges.find(x=>x.id===linked[0].chargeId).status,'Pendente');
    syncStorePayment('qa-pix');
    assert.equal(ops.charges.find(x=>x.id===linked[0].chargeId).status,'Pago');
    assert.equal(orders[0].status,'Confirmado');
    linked[0].tracking='DEMO12345'; setOrderOps(linked[0].id,'Enviado');
    assert.equal(orders[0].status,'Enviado');
    assert.equal(linked[0].tracking,'DEMO12345');
  `);
});

test('monthly Pix cycle cannot duplicate, and payment advances renewal once', () => {
  environment()(`
    const s=ops.subscriptions[1];
    assert.equal(existingClubForEmail(opClient(s.customerId).email.toUpperCase()).id,s.id);
    const due=s.nextRenewal;
    const orderId=generateClubCycle(s,'Pendente');
    assert.ok(orderId);
    assert.equal(generateClubCycle(s,'Pendente'),null);
    assert.equal(s.nextRenewal,due);
    const charge=ops.charges.find(x=>x.orderId===orderId);
    payChargeOps(charge.id); payChargeOps(charge.id);
    assert.equal(s.nextRenewal,'2027-01-08');
    assert.equal(opOrder(orderId).status,'Confirmado');
    productionOps(orderId); productionOps(orderId);
    assert.equal(ops.jobs.filter(j=>j.orderId===orderId).length,1);
  `);
});

test('new plan price does not reprice existing contracts or historical items', () => {
  environment()(`
    const s=ops.subscriptions[0],price=s.price;
    const old=ops.orders.find(o=>o.subscriptionId===s.id);
    const items=JSON.stringify(old.items);
    ops.settings.price=199.9;
    ops.settings.profiles[s.profile]=['palavra-fe'];
    const id=generateClubCycle(s,'Pago');
    assert.equal(opOrder(id).total,price);
    assert.equal(opOrder(id).items.length,1);
    assert.equal(opOrder(id).items[0].id,'palavra-fe');
    assert.equal(JSON.stringify(old.items),items);
    assert.equal(opAddMonth('2027-01-31'),'2027-02-28');
  `);
});

test('shop support becomes one customer-linked conversation', () => {
  environment()(`
    const data={name:'Teste',email:'suporte@exemplo.com',topic:'Entrega',message:'Uma dúvida fictícia sobre a cesta.'};
    captureStoreTicket(data); captureStoreTicket(data);
    const clients=ops.clients.filter(c=>c.email===data.email);
    assert.equal(clients.length,1);
    assert.equal(ops.tickets.filter(t=>t.customerId===clients[0].id).length,2);
  `);
});

test('all local entrypoint scripts, styles and images exist', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?"/g)) {
    if (/^(?:https?:|data:)/.test(match[1])) continue;
    assert.ok(fs.existsSync(path.join(root, 'dist', match[1])), match[1]);
  }
  assert.ok(fs.existsSync(path.join(root, 'dist/assets/club-basket.png')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'vercel.json'))).outputDirectory,'dist');
});
