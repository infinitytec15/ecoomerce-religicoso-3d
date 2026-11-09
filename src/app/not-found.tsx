import { EmptyState } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/button';
export default function NotFound() {
  return (
    <main id="main" className="container">
      <EmptyState
        title="Este caminho mudou."
        description="A página não foi encontrada. Encontre uma nova peça de fé ou volte para o início."
        action={<ButtonLink href="/">Voltar ao início</ButtonLink>}
      />
    </main>
  );
}
