import Link from 'next/link';
import { CookieSettingsLink } from '@/components/tracking/cookie-banner';
import { STORE_LEGAL } from '@/lib/domain/store-legal';

export const metadata = {
  title: 'Política de Privacidade e Cookies',
  description:
    'Quais dados a Mãos em Oração coleta, para que usa, com quem compartilha e como você exerce seus direitos pela LGPD.',
};

export default function Page() {
  return (
    <main id="main" className="container policy">
      <h1>Política de Privacidade e Cookies</h1>
      <p className="policy-updated">Atualizada em {STORE_LEGAL.updatedAt}</p>
      <p>
        Esta política explica como a {STORE_LEGAL.name} trata seus dados pessoais, de acordo com a
        Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD).
      </p>

      <h2 id="controlador">1. Quem cuida dos seus dados</h2>
      <p>
        {STORE_LEGAL.legalName}
        {STORE_LEGAL.document ? ` · ${STORE_LEGAL.document}` : ''}, {STORE_LEGAL.address}. Para
        qualquer assunto de privacidade, fale com nosso encarregado pelo e-mail{' '}
        <a href={`mailto:${STORE_LEGAL.email}`}>{STORE_LEGAL.email}</a>.
      </p>

      <h2 id="dados">2. Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro e compra:</strong> nome, e-mail, telefone, CPF ou CNPJ, endereço de
          entrega e os itens dos pedidos.
        </li>
        <li>
          <strong>Pagamento:</strong> forma de pagamento, valor e situação da cobrança. Os dados do
          cartão são digitados direto no ambiente seguro do Mercado Pago e{' '}
          <strong>não ficam salvos na loja</strong>.
        </li>
        <li>
          <strong>Atendimento e comunidade:</strong> mensagens enviadas ao atendimento, pedidos de
          oração e avaliações que você publicar.
        </li>
        <li>
          <strong>Navegação:</strong> páginas visitadas, dispositivo, origem da visita (como o link
          de um anúncio) e cookies, conforme a seção 6.
        </li>
      </ul>

      <h2 id="finalidades">3. Para que usamos</h2>
      <ul>
        <li>
          Processar pedidos, pagamentos, produção, entrega, trocas e o atendimento (execução do
          contrato).
        </li>
        <li>Emitir documentos fiscais e cumprir obrigações legais (obrigação legal).</li>
        <li>
          Prevenir fraudes e manter a loja segura, e melhorar nossos produtos (legítimo interesse).
        </li>
        <li>
          Enviar novidades, orações e ofertas por e-mail e medir campanhas de anúncios, somente com
          o seu consentimento, que pode ser retirado a qualquer momento.
        </li>
      </ul>

      <h2 id="compartilhamento">4. Com quem compartilhamos</h2>
      <p>Não vendemos seus dados. Compartilhamos apenas o necessário com:</p>
      <ul>
        <li>
          <strong>Mercado Pago</strong>, para processar o pagamento.
        </li>
        <li>
          <strong>Melhor Envio e transportadoras</strong> (Correios, Jadlog, Loggi e outras), para
          calcular o frete e entregar o pedido.
        </li>
        <li>
          <strong>Provedores de tecnologia</strong> que hospedam a loja, guardam imagens e enviam
          e-mails, sob contrato e com dever de sigilo.
        </li>
        <li>
          <strong>Meta (Facebook e Instagram) e Google</strong>, apenas se você aceitar os cookies
          de marketing ou de medição. Para a Meta, enviamos dados de compra com e-mail e telefone
          criptografados (hash), usados só para medir os anúncios.
        </li>
        <li>Autoridades, quando a lei ou uma ordem judicial exigir.</li>
      </ul>

      <h2 id="prazo">5. Por quanto tempo guardamos</h2>
      <p>
        Mantemos os dados da conta enquanto ela estiver ativa. Dados de pedidos e documentos fiscais
        são guardados pelo prazo exigido em lei (em geral, 5 anos). Depois disso, são apagados ou
        anonimizados.
      </p>

      <h2 id="cookies">6. Cookies</h2>
      <p>Cookies são pequenos arquivos guardados no seu navegador. Usamos três tipos:</p>
      <ul>
        <li>
          <strong>Essenciais</strong> (sempre ativos): mantêm o login, o carrinho e a segurança da
          loja.
        </li>
        <li>
          <strong>Medição</strong> (com sua permissão): Google Analytics, para entender quantas
          pessoas visitam a loja e quais páginas usam.
        </li>
        <li>
          <strong>Marketing</strong> (com sua permissão): Pixel da Meta, para medir os anúncios no
          Facebook e no Instagram e mostrar nossas peças a quem se interessa por elas.
        </li>
      </ul>
      <p>
        Você escolhe no aviso de cookies e pode mudar a escolha quando quiser:{' '}
        <CookieSettingsLink className="text-btn" />.
      </p>

      <h2 id="direitos">7. Seus direitos</h2>
      <p>Pela LGPD, você pode pedir a qualquer momento:</p>
      <ul>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos ou desatualizados;</li>
        <li>anonimização, bloqueio ou exclusão de dados desnecessários;</li>
        <li>portabilidade dos dados a outro fornecedor;</li>
        <li>informação sobre com quem compartilhamos;</li>
        <li>retirada do consentimento e exclusão dos dados tratados com base nele.</li>
      </ul>
      <p>
        Peça pela <Link href="/suporte">Central de ajuda</Link> ou pelo e-mail{' '}
        <a href={`mailto:${STORE_LEGAL.email}`}>{STORE_LEGAL.email}</a>. Respondemos em até 15 dias.
        Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2 id="seguranca">8. Segurança</h2>
      <p>
        Usamos conexão criptografada (HTTPS), senhas protegidas, acesso restrito à equipe e
        criptografia em dados sensíveis. Nenhum sistema é totalmente invulnerável; se houver um
        incidente que possa trazer risco a você, avisaremos você e a ANPD.
      </p>

      <h2 id="alteracoes">9. Mudanças nesta política</h2>
      <p>
        Podemos atualizar esta política. A data no topo mostra a versão em vigor, e mudanças
        importantes serão avisadas no site ou por e-mail.
      </p>
    </main>
  );
}
