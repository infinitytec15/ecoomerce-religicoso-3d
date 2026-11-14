'use client';
import { useMemo, useState } from 'react';
import { CRM_LIMITS, type AdminMarketingCampaign } from '@maos-em-oracao/contracts';
import { useAdminAction } from '../shared';
import {
  BlockEditor,
  blockProblem,
  blocksToInput,
  draftsFromCampaign,
  type BlockDraft,
} from './block-editor';
import { DeleteModal, ScheduleModal, TestSendModal } from './campaign-actions';
import { SegmentBuilder, validRules } from './segment-builder';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

type Panel = 'test' | 'schedule' | 'delete' | null;

export function CampaignEditor({
  campaign,
  onDone,
}: {
  campaign?: AdminMarketingCampaign;
  onDone: () => void;
}) {
  const action = useAdminAction(),
    [name, setName] = useState(campaign?.name ?? ''),
    [subject, setSubject] = useState(campaign?.subject ?? ''),
    [previewText, setPreviewText] = useState(campaign?.previewText ?? ''),
    [rules, setRules] = useState(campaign?.segment.rules ?? []),
    [blocks, setBlocks] = useState<BlockDraft[]>(() => draftsFromCampaign(campaign?.blocks ?? [])),
    [panel, setPanel] = useState<Panel>(null),
    snapshot = (n: string, s: string, p: string, r: unknown, b: BlockDraft[]) =>
      JSON.stringify([n.trim(), s.trim(), p.trim(), r, blocksToInput(b)]),
    saved = useMemo(
      () =>
        campaign
          ? snapshot(
              campaign.name,
              campaign.subject,
              campaign.previewText,
              campaign.segment.rules,
              draftsFromCampaign(campaign.blocks),
            )
          : '',
      [campaign],
    ),
    dirty = !campaign || snapshot(name, subject, previewText, rules, blocks) !== saved;
  return (
    <>
      <Form
        onSubmit={async () => {
          if (name.trim().length < 3) throw new Error('O nome precisa ter ao menos 3 caracteres.');
          if (subject.trim().length < 3)
            throw new Error('O assunto precisa ter ao menos 3 caracteres.');
          if (!blocks.length) throw new Error('Adicione ao menos um bloco ao e-mail.');
          const problem = blockProblem(blocks);
          if (problem) throw new Error(problem);
          if (validRules(rules).length !== rules.length)
            throw new Error('Complete ou remova as regras incompletas do público.');
          await action.run(
            {
              type: 'crm.campaign.save',
              campaign: {
                ...(campaign ? { id: campaign.id } : {}),
                name: name.trim(),
                subject: subject.trim(),
                previewText: previewText.trim(),
                segment: { rules },
                blocks: blocksToInput(blocks),
              },
            },
            campaign ? 'Rascunho atualizado.' : 'Rascunho salvo.',
          );
          if (!campaign) onDone();
        }}
      >
        {(pending) => (
          <>
            <label>
              Nome da campanha
              <input
                required
                aria-label="Nome da campanha"
                maxLength={CRM_LIMITS.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <small>
                Só você vê. {name.length}/{CRM_LIMITS.name}
              </small>
            </label>
            <label>
              Assunto
              <input
                required
                aria-label="Assunto"
                maxLength={CRM_LIMITS.subject}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <small>
                {subject.length}/{CRM_LIMITS.subject}
              </small>
            </label>
            <label>
              Texto de pré-visualização
              <input
                aria-label="Texto de pré-visualização"
                maxLength={CRM_LIMITS.previewText}
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
              />
              <small>
                Aparece ao lado do assunto na caixa de entrada. {previewText.length}/
                {CRM_LIMITS.previewText}
              </small>
            </label>
            <BlockEditor blocks={blocks} onChange={setBlocks} />
            <SegmentBuilder rules={rules} onChange={setRules} />
            <div className="row wrap">
              <Button loading={pending}>Salvar rascunho</Button>
            </div>
          </>
        )}
      </Form>
      {campaign && (
        <>
          <div className="row wrap">
            <Button
              type="button"
              variant="secondary"
              disabled={dirty}
              onClick={() => setPanel('test')}
            >
              Enviar teste
            </Button>
            <Button type="button" disabled={dirty} onClick={() => setPanel('schedule')}>
              Agendar
            </Button>
            <Button
              type="button"
              variant="text"
              className="danger-text"
              onClick={() => setPanel('delete')}
            >
              Excluir
            </Button>
          </div>
          {dirty && <small>Salve o rascunho para enviar um teste ou agendar.</small>}
          <TestSendModal
            campaign={campaign}
            open={panel === 'test'}
            onClose={() => setPanel(null)}
          />
          <ScheduleModal
            campaign={campaign}
            open={panel === 'schedule'}
            onClose={() => setPanel(null)}
            onScheduled={onDone}
          />
          <DeleteModal
            campaign={campaign}
            open={panel === 'delete'}
            onClose={() => setPanel(null)}
            onDeleted={onDone}
          />
        </>
      )}
    </>
  );
}
