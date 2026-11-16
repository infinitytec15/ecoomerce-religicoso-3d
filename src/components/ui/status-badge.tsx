const success = [
  'Pago',
  'Ativa',
  'Ativo',
  'Entregue',
  'Resolvido',
  'Disponível',
  'Concluída',
  'Pode receber',
  'Na loja',
];
const warning = [
  'Pendente',
  'Pagamento pendente',
  'Aberto',
  'Aguardando pagamento',
  'Aguardando grupo',
  'Pausada',
  'Previsto',
  'Sem vídeo',
  'Sem capa',
  'Vídeo processando',
];
const danger = [
  'Cancelada',
  'Cancelado',
  'Estornado',
  'Recusado',
  'Inativo',
  'Manutenção',
  'Descadastrado',
  'Vídeo falhou',
];
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
