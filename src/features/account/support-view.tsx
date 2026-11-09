'use client';
import { useState } from 'react';
import { NewTicketForm } from './tickets';
import { Button, ButtonLink } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { IS_DEMO } from '@/lib/api/config';
const faqs = [
  [
    'Como funciona a impressão 3D?',
    'O conceito utiliza camadas de PLA para criar peças decorativas. As linhas sutis da impressão fazem parte da textura. As imagens do catálogo são ilustrativas.',
  ],
  [
    'Posso pagar uma parte no Pix e outra no cartão?',
    'No checkout, escolha Pix + cartão, defina a parte no Pix e divida o restante em até 3 parcelas. No modo demonstrativo, a confirmação é simulada.',
  ],
  [
    'Como funciona a entrega?',
    'Informe seu CEP no produto ou checkout para consultar as opções de entrega e o prazo estimado de produção. No modo demonstrativo, os preços e prazos são ilustrativos.',
  ],
  [
    'É possível personalizar minha peça?',
    'Escolha cor e tamanho no produto. As peças da coleção Personalizados também permitem uma dedicatória na embalagem.',
  ],
  [
    'Como funcionam trocas e devoluções?',
    'Esta demonstração não gera compras reais. A política comercial precisa ser definida pelo lojista antes do lançamento de vendas reais. Para conversar, abra um atendimento.',
  ],
  [
    'Como cuidar das peças?',
    'Use um pano macio e seco. Evite calor, sol direto e produtos abrasivos. Os objetos apresentados são conceitos decorativos.',
  ],
  [
    'Quais dados ficam salvos?',
    'No modo demonstrativo, favoritos, carrinho, perfil fictício e pedidos são guardados neste navegador. Senhas e dados de cartão não são armazenados. No modo integrado, a API é responsável por sua conta e seus registros.',
  ],
];
export function SupportView({ topic = '' }: { topic?: string }) {
  const [resetOpen, setResetOpen] = useState(false),
    [done, setDone] = useState(false),
    openIndex = ({ entrega: 2, trocas: 4, cuidados: 5, privacidade: 6 } as Record<string, number>)[
      topic
    ];
  return (
    <main id="main" className="container">
      <div className="support-title">
        <h1>Como podemos ajudar?</h1>
        <p>
          Da escolha da peça aos detalhes da entrega, encontre o que precisa para seguir com
          tranquilidade.
        </p>
      </div>
      <div className="support-layout">
        <section>
          <h2>Respostas que aproximam.</h2>
          <div className="details-list" style={{ marginTop: 0 }}>
            {faqs.map(([title, description], i) => (
              <details key={title} open={i === openIndex}>
                <summary>{title}</summary>
                <p>{description}</p>
              </details>
            ))}
          </div>
          {IS_DEMO && (
            <Button variant="text" style={{ marginTop: 22 }} onClick={() => setResetOpen(true)}>
              Apagar meus dados de demonstração
            </Button>
          )}
          <div style={{ marginTop: 25 }}>
            <ButtonLink variant="secondary" href="/conta/atendimentos">
              Acompanhar meus atendimentos
            </ButtonLink>
          </div>
        </section>
        <section className="support-form">
          <h2>Vamos conversar.</h2>
          <p>
            {IS_DEMO
              ? 'Simule um atendimento. Sua mensagem fica neste navegador e no painel de demonstração. Nenhuma mensagem externa é enviada.'
              : 'Conte o que você precisa. Nossa equipe acompanha sua mensagem pela central de atendimento.'}
          </p>
          {done ? (
            <div className="stack">
              <p role="status">Atendimento registrado{IS_DEMO ? ' na demonstração local' : ''}.</p>
              <Button variant="secondary" onClick={() => setDone(false)}>
                Iniciar outro atendimento
              </Button>
            </div>
          ) : (
            <NewTicketForm guest onSuccess={() => setDone(true)} />
          )}
        </section>
      </div>
      <Modal open={resetOpen} onOpenChange={setResetOpen} title="Apagar dados de demonstração">
        <p>
          Essa ação remove os dados desta demonstração guardados neste navegador, incluindo o
          carrinho e os registros locais. Os exemplos serão restaurados.
        </p>
        <Button
          variant="danger"
          onClick={() => {
            for (const key of Object.keys(localStorage))
              if (key.startsWith('meo-') || key.startsWith('amago-')) localStorage.removeItem(key);
            for (const key of Object.keys(sessionStorage))
              if (key.startsWith('meo-') || key.startsWith('amago-'))
                sessionStorage.removeItem(key);
            location.assign(new URL('/', location.href).toString());
          }}
        >
          Confirmar exclusão dos dados locais
        </Button>
        <Button variant="secondary" onClick={() => setResetOpen(false)}>
          Manter meus dados
        </Button>
      </Modal>
    </main>
  );
}
