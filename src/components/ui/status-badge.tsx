const success = ['Pago', 'Ativa', 'Ativo', 'Entregue', 'Resolvido', 'Disponível', 'Concluída'];
const warning = [
  'Pendente',
  'Pagamento pendente',
  'Aberto',
  'Aguardando pagamento',
  'Pausada',
  'Previsto',
];
const danger = ['Cancelada', 'Cancelado', 'Estornado', 'Recusado', 'Inativo', 'Manutenção'];
export function StatusBadge({ status }: { status: string }) {
  const tone = success.includes(status)
    ? 'good'
    : warning.includes(status)
      ? 'warn'
      : danger.includes(status)
        ? 'bad'
        : 'info';
  return <span className={`op-status ${tone}`}>{status}</span>;
}
