import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emailLabels, renderEmail } from '@maos-em-oracao/emails';
import { sampleContext, sampleEmails } from '@maos-em-oracao/emails/samples';

const output = new URL('../packages/emails/.preview/', import.meta.url);
await mkdir(output, { recursive: true });
for (const message of sampleEmails) {
  const rendered = renderEmail(message, sampleContext);
  await writeFile(new URL(`${message.kind}.html`, output), rendered.html);
  await writeFile(new URL(`${message.kind}.txt`, output), rendered.text);
}
const rows = sampleEmails
  .map(
    ({ kind }) =>
      `<li><a href="${kind}.html">${emailLabels[kind]}<span aria-hidden="true"> →</span></a><a class="text" href="${kind}.txt">Texto simples<span class="sr-only">: ${emailLabels[kind]}</span></a></li>`,
  )
  .join('');
await writeFile(
  new URL('index.html', output),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E-mails · Mãos em Oração</title><style>*{box-sizing:border-box}body{margin:0;background:#faf9f5;color:#282c25;font:16px/1.6 Arial,sans-serif}main{max-width:900px;margin:auto;padding:64px 24px}h1{font:400 clamp(36px,7vw,56px)/1.1 Georgia,serif;letter-spacing:-.02em;max-width:600px}p{max-width:65ch;color:#65695f}a{color:#3e4934;text-underline-offset:5px}a:focus-visible{outline:3px solid #aa5438;outline-offset:5px}ul{list-style:none;margin:36px 0 0;padding:0}li{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:18px 0;border-bottom:1px solid #dedfd6}li a{padding:8px 0;font-size:18px;font-weight:bold}li .text{font-size:14px;font-weight:400;color:#aa5438}::selection{background:#e9eddf}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:520px){main{padding-top:32px}li{align-items:start;flex-direction:column;gap:0}li a{padding:6px 0}}</style></head><body><main><h1>Mensagens que acolhem.<br>Informação que ajuda.</h1><p>Os e-mails da Mãos em Oração, no visual Essência. Abra um modelo para conferir a versão em HTML ou em texto simples.</p><p><strong>Catálogo de desenvolvimento.</strong> Nomes, valores, pedidos e links são fictícios. Nenhum e-mail foi enviado. Os botões dos modelos apontam para domínios de exemplo.</p><ul>${rows}</ul></main></body></html>`,
);
console.log(`${sampleEmails.length} templates HTML + texto em ${fileURLToPath(output)}`);
