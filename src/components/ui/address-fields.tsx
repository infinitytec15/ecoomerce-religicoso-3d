'use client';
import { useEffect, useRef, useState } from 'react';
import type { Address } from '@/lib/domain/types';
import { demoAddress } from '@/lib/domain/schemas';
import { lookupCep, maskCep } from '@/lib/domain/address';
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
type Field = [keyof Address, string, string?, boolean?];
const contactFields: Field[] = [
  ['name', 'Nome completo', 'text', true],
  ['email', 'E-mail', 'email', true],
  ['phone', 'Telefone com DDD', 'tel'],
  ['document', 'CPF ou CNPJ para o envio', 'text', true],
];
const placeFields: Field[] = [
  ['street', 'Rua ou avenida', 'text', true],
  ['number', 'Número'],
  ['extra', 'Complemento'],
  ['district', 'Bairro'],
  ['city', 'Cidade'],
];
const states = [
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
];
type Lookup = 'idle' | 'loading' | 'found' | 'missing' | 'failed';
const lookupMessage: Record<Lookup, string> = {
  idle: 'Digite o CEP para preenchermos o endereço.',
  loading: 'Buscando endereço…',
  found: 'Endereço encontrado. Confira e informe o número.',
  missing: 'CEP não encontrado. Preencha o endereço abaixo.',
  failed: 'Não conseguimos consultar o CEP agora. Preencha o endereço abaixo.',
};
export function AddressFields({
  value,
  onChange,
  showDemo = true,
}: {
  value: Address;
  onChange: (value: Address) => void;
  showDemo?: boolean;
}) {
  const [lookup, setLookup] = useState<Lookup>('idle'),
    numberRef = useRef<HTMLInputElement>(null),
    latest = useRef(value),
    // A saved address is trusted as-is; only a CEP typed afterwards triggers a lookup.
    resolved = useRef(value.street ? value.cep.replace(/\D/g, '') : '');
  latest.current = value;
  const digits = value.cep.replace(/\D/g, '');
  // Address details open once the CEP is complete, or when an address is already saved.
  const open = digits.length === 8 || !!value.street;
  useEffect(() => {
    if (digits.length !== 8 || resolved.current === digits) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup('loading');
      try {
        const found = await lookupCep(digits, controller.signal);
        resolved.current = digits;
        if (!found) return setLookup('missing');
        onChange({
          ...latest.current,
          street: found.street || latest.current.street,
          district: found.district || latest.current.district,
          city: found.city,
          state: found.state,
        });
        setLookup('found');
        // Many CEPs cover a whole city; only jump ahead when the street is known.
        if (found.street) requestAnimationFrame(() => numberRef.current?.focus());
      } catch {
        if (!controller.signal.aborted) setLookup('failed');
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [digits, onChange]);
  const input = ([key, label, type, wide]: Field) => (
    <label className={wide ? 'span2' : ''} key={key}>
      {label}
      {key === 'extra' && <span className="muted"> (opcional)</span>}
      <input
        ref={key === 'number' ? numberRef : undefined}
        name={key}
        value={value[key] || ''}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        type={type || 'text'}
        required={key !== 'extra' && (key !== 'document' || !IS_DEMO)}
        minLength={key === 'phone' ? 10 : key === 'name' ? 3 : undefined}
        maxLength={120}
        autoComplete={
          IS_DEMO
            ? 'off'
            : (
                {
                  name: 'name',
                  email: 'email',
                  phone: 'tel',
                  street: 'address-line1',
                  extra: 'address-line2',
                  district: 'address-level3',
                  city: 'address-level2',
                } as Partial<Record<keyof Address, string>>
              )[key] || 'on'
        }
      />
    </label>
  );
  return (
    <>
      {IS_DEMO && showDemo && (
        <Button type="button" variant="text" onClick={() => onChange({ ...demoAddress })}>
          Preencher com dados fictícios
        </Button>
      )}
      <div className="form-grid">
        {contactFields.map(input)}
        <label className="span2 cep-field">
          CEP
          <input
            name="cep"
            value={value.cep}
            onChange={(e) => {
              const cep = maskCep(e.target.value);
              if (cep.replace(/\D/g, '') !== resolved.current) setLookup('idle');
              onChange({ ...value, cep });
            }}
            inputMode="numeric"
            required
            pattern="[0-9]{5}-?[0-9]{3}"
            maxLength={9}
            autoComplete={IS_DEMO ? 'off' : 'postal-code'}
            placeholder="00000-000"
            aria-describedby="cep-status"
          />
          <span id="cep-status" className={`cep-status ${lookup}`} role="status" aria-live="polite">
            {lookup === 'loading' && <span className="cep-spinner" aria-hidden="true" />}
            {lookupMessage[lookup]}{' '}
            {lookup === 'idle' && (
              <a
                href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                target="_blank"
                rel="noreferrer"
              >
                Não sei meu CEP
              </a>
            )}
          </span>
        </label>
        {open && (
          <>
            {placeFields.map(input)}
            <label>
              Estado
              <select
                name="state"
                value={value.state}
                onChange={(e) => onChange({ ...value, state: e.target.value })}
                autoComplete={IS_DEMO ? 'off' : 'address-level1'}
              >
                {states.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </>
  );
}
