import Link from 'next/link';
import { STORE_LEGAL } from '@/lib/domain/store-legal';

export const metadata = {
  title: 'Política de Trocas e Devoluções',
  description:
    'Como funcionam o arrependimento em 7 dias, as trocas por defeito e o reembolso na Mãos em Oração.',
};

export default function Page() {
  return (
    <main id="main" className="container policy">
      <h1>Política de Trocas e Devoluções</h1>
      <p className="policy-updated">Atualizada em {STORE_LEGAL.updatedAt}</p>
      <p>
        Cada peça da {STORE_LEGAL.name} é impressa em 3D sob encomenda, com cuidado e oração. Se
        algo não sair como você esperava, estamos aqui para resolver. Esta política segue o Código
        de Defesa do Consumidor (Lei 8.078/1990) e o Decreto 7.962/2013.
      </p>

      <h2 id="arrependimento">1. Desistência da compra (arrependimento)</h2>
      <p>
        Você pode desistir da compra em até <strong>7 dias corridos</strong> contados do dia em que
        recebeu o pedido, sem precisar explicar o motivo.
      </p>
      <ul>
        <li>A peça deve voltar sem sinais de uso, de preferência na embalagem original.</li>
        <li>
          O envio de volta é por nossa conta: mandamos um código de postagem para você levar a peça
          aos Correios ou ao ponto indicado.
        </li>
        <li>Devolvemos o valor total pago, incluindo o frete.</li>
      </ul>

      <h2 id="defeito">2. Peça com defeito ou danificada no transporte</h2>
      <p>
        Se a peça chegar quebrada, com defeito de impressão ou diferente do que você comprou, avise
        em até <strong>7 dias</strong> após o recebimento, com fotos da peça e da embalagem. Para
        defeitos que aparecerem depois, o prazo legal é de <strong>90 dias</strong> a partir da
        entrega.
      </p>
      <p>
        Depois de analisar as fotos (ou a peça, se precisarmos dela de volta), você escolhe entre
        receber uma peça nova, trocar por outra de mesmo valor ou receber o dinheiro de volta.
        Resolvemos em até 30 dias, e todo o frete fica por nossa conta.
      </p>

      <h2 id="impressao-3d">3. O que é próprio da impressão 3D</h2>
      <p>
        As peças são feitas camada por camada, então linhas finas na superfície e pequenas variações
        de tom em relação às fotos fazem parte do processo e não são consideradas defeito. Medidas
        podem variar alguns milímetros.
      </p>

      <h2 id="personalizadas">4. Peças personalizadas</h2>
      <p>
        Peças com nome, frase ou dedicatória escolhidos por você também têm o direito de desistência
        previsto em lei. Se houver erro nosso na personalização, refazemos a peça sem custo.
      </p>

      <h2 id="como-pedir">5. Como pedir troca ou devolução</h2>
      <ol>
        <li>
          Abra um atendimento em <Link href="/suporte">Central de ajuda</Link> ou escreva para{' '}
          <a href={`mailto:${STORE_LEGAL.email}`}>{STORE_LEGAL.email}</a>, informando o número do
          pedido e o motivo (com fotos, em caso de defeito).
        </li>
        <li>Respondemos em até 1 dia útil com as instruções e o código de postagem.</li>
        <li>Assim que a peça chegar e for conferida, fazemos a troca ou o reembolso.</li>
      </ol>
      <p>Atendimento: {STORE_LEGAL.supportHours}.</p>

      <h2 id="reembolso">6. Reembolso</h2>
      <ul>
        <li>
          <strong>Pix:</strong> devolvido na mesma conta de origem em até 5 dias úteis após a
          aprovação.
        </li>
        <li>
          <strong>Cartão de crédito:</strong> pedimos o estorno ao Mercado Pago em até 5 dias úteis.
          O valor aparece na fatura conforme o prazo do banco emissor, normalmente em uma ou duas
          faturas.
        </li>
        <li>
          <strong>Pix + cartão:</strong> cada parte volta pelo seu próprio meio de pagamento.
        </li>
      </ul>

      <h2 id="cancelamento">7. Cancelamento antes do envio</h2>
      <p>
        Se o pedido ainda não foi enviado, você pode pedir o cancelamento pelo atendimento e
        devolvemos o valor integral, pelas mesmas regras de reembolso acima.
      </p>

      <h2 id="contato">8. Quem somos</h2>
      <p>
        {STORE_LEGAL.legalName}
        {STORE_LEGAL.document ? ` · ${STORE_LEGAL.document}` : ''}
        <br />
        {STORE_LEGAL.address}
        <br />
        <a href={`mailto:${STORE_LEGAL.email}`}>{STORE_LEGAL.email}</a>
      </p>
    </main>
  );
}
