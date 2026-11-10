'use client';
import type { Address } from '@/lib/domain/types';
import { demoAddress } from '@/lib/domain/schemas';
import { IS_DEMO } from '@/lib/api/config';
import { Button } from './button';
export const emptyAddress: Address = {
  name: '',
  email: '',
  phone: '',
  document: '',
  cep: '',
  street: '',
  number: '',
  extra: '',
  district: '',
  city: '',
  state: 'SP',
};
const fields: [keyof Address, string, string?, boolean?][] = [
  ['name', 'Nome completo', 'text', true],
  ['email', 'E-mail', 'email', true],
  ['phone', 'Telefone com DDD', 'tel'],
  ['document', 'CPF ou CNPJ para o envio', 'text', true],
  ['cep', 'CEP', 'text'],
  ['street', 'Rua ou avenida', 'text', true],
  ['number', 'Número'],
  ['extra', 'Complemento'],
  ['district', 'Bairro'],
  ['city', 'Cidade'],
];
export function AddressFields({
  value,
  onChange,
  showDemo = true,
}: {
  value: Address;
  onChange: (value: Address) => void;
  showDemo?: boolean;
}) {
  return (
    <>
      {IS_DEMO && showDemo && (
        <Button type="button" variant="text" onClick={() => onChange({ ...demoAddress })}>
          Preencher com dados fictícios
        </Button>
      )}
      <div className="form-grid">
        {fields.map(([key, label, type, wide]) => (
          <label className={wide ? 'span2' : ''} key={key}>
            {label}
            {key === 'extra' && <span className="muted"> (opcional)</span>}
            <input
              name={key}
              value={value[key] || ''}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              type={type || 'text'}
              required={key !== 'extra' && (key !== 'document' || !IS_DEMO)}
              minLength={key === 'phone' ? 10 : key === 'name' ? 3 : undefined}
              pattern={key === 'cep' ? '[0-9]{5}-?[0-9]{3}' : undefined}
              maxLength={key === 'cep' ? 9 : 120}
              autoComplete={
                IS_DEMO ? 'off' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'on'
              }
              placeholder={key === 'cep' ? '00000-000' : undefined}
            />
          </label>
        ))}
        <label>
          Estado
          <select
            name="state"
            value={value.state}
            onChange={(e) => onChange({ ...value, state: e.target.value })}
          >
            {[
              'AC',
              'AL',
              'AP',
              'AM',
              'BA',
              'CE',
              'DF',
              'ES',
              'GO',
              'MA',
              'MT',
              'MS',
              'MG',
              'PA',
              'PB',
              'PR',
              'PE',
              'PI',
              'RJ',
              'RN',
              'RS',
              'RO',
              'RR',
              'SC',
              'SP',
              'SE',
              'TO',
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
