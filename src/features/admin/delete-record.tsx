'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminCommand } from '@/lib/domain/types';
import { errorMessage } from '@/lib/api/contracts';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useAdminAction } from './shared';

/**
 * Permanent delete with an explicit confirmation. The server refuses records that carry
 * payments, labels or history and explains whether to cancel or archive instead.
 */
export function DeleteRecordButton({
  command,
  label,
  what,
  redirectTo,
}: {
  command: AdminCommand;
  label: string;
  what: string;
  redirectTo: string;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    action = useAdminAction(),
    router = useRouter();
  return (
    <>
      <Button
        type="button"
        variant="text"
        className="small danger-text"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={label} className="delete-record-dialog">
        <div className="stack">
          <p>
            Você vai excluir <strong>{what}</strong> definitivamente. Essa ação não pode ser
            desfeita.
          </p>
          <p className="muted">
            Só é possível excluir registros sem pagamento, etiqueta ou histórico. Nesses casos,
            cancele ou arquive para manter a contabilidade e o rastreio.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button type="button" variant="text" onClick={() => setOpen(false)}>
              Manter
            </Button>
            <Button
              type="button"
              className="danger"
              loading={action.pending}
              onClick={async () => {
                try {
                  await action.run(command, 'Registro excluído.');
                  setOpen(false);
                  router.push(redirectTo);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Excluir definitivamente
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
