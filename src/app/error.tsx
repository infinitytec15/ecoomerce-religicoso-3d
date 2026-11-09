'use client';
import { ErrorState } from '@/components/ui/states';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="container">
      <ErrorState
        message="Não conseguimos preparar esta página. Tente novamente em alguns instantes."
        onRetry={reset}
      />
    </main>
  );
}
