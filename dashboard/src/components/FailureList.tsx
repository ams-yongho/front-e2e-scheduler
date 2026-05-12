import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Attachment, TestFailure } from '../types';
import { StepTrail } from './StepTrail';

type Props = {
  failures: TestFailure[];
};

const ERROR_SUMMARY_LIMIT = 140;

export function FailureList({ failures }: Props) {
  if (failures.length === 0) return null;

  return (
    <div
      style={{
        padding: '0 22px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {failures.map((f, i) => (
        <FailureItem key={`${f.file}:${f.line}:${f.test}:${i}`} failure={f} />
      ))}
    </div>
  );
}

function FailureItem({ failure: f }: { failure: TestFailure }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeError(f.error);
  const attachmentSummary = formatAttachmentSummary(f.attachments);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        style={{
          borderRadius: 8,
          background: open ? 'rgba(229, 72, 77, 0.045)' : 'rgba(229, 72, 77, 0.025)',
          border: open ? '1px solid rgba(229, 72, 77, 0.16)' : '1px solid rgba(229, 72, 77, 0.10)',
          overflow: 'hidden',
        }}
      >
        <CollapsibleTrigger
          aria-label={`${f.test} 실패 상세 ${open ? '접기' : '펼치기'}`}
          className="failure-summary-trigger"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <X style={{ width: 14, height: 14, color: 'var(--danger)', flex: '0 0 auto' }} />
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: 0,
              }}
            >
              {f.test}
            </span>
          </div>

          <div
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-muted)',
              letterSpacing: 0,
            }}
          >
            {summary}
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-faint)',
              whiteSpace: 'nowrap',
            }}
          >
            {f.file}:{f.line}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
            <Pill>{f.browser}</Pill>
            {attachmentSummary && <Pill tone="accent">{attachmentSummary}</Pill>}
          </div>

          <ChevronDown
            style={{
              width: 14,
              height: 14,
              color: 'var(--text-faint)',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'rotate(0)',
            }}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div style={{ borderTop: '1px solid rgba(229, 72, 77, 0.10)', padding: '0 14px 14px' }}>
            <StepTrail steps={f.steps} failedStepIdx={f.failedStepIdx} />

            <div className="failure-detail-grid">
              <ScreenshotPlaceholder />
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  padding: '8px 10px',
                  background: 'var(--surface-2)',
                  borderRadius: 4,
                  borderLeft: '2px solid var(--danger)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.55,
                  letterSpacing: 0,
                  overflow: 'auto',
                  maxHeight: 160,
                  margin: 0,
                }}
              >
                {f.error}
              </pre>
            </div>

            {f.attachments.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  marginLeft: 24,
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                {f.attachments.map((a, i) => (
                  <span
                    key={`${a.name}:${i}`}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      color: 'var(--accent-hover)',
                      padding: '4px 9px',
                      borderRadius: 4,
                      background: 'rgba(94,106,210,0.08)',
                      border: '1px solid rgba(94,106,210,0.14)',
                      letterSpacing: 0,
                    }}
                  >
                    {iconFor(a.name)} {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' }) {
  return (
    <span
      style={{
        background: tone === 'accent' ? 'rgba(94,106,210,0.08)' : 'var(--surface-3)',
        color: tone === 'accent' ? 'var(--accent-hover)' : 'var(--text-secondary)',
        padding: '2px 8px',
        fontSize: 10,
        borderRadius: 999,
        fontWeight: 500,
        letterSpacing: 0,
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function summarizeError(error: string): string {
  const firstLine = error
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return '에러 메시지 없음';
  if (firstLine.length <= ERROR_SUMMARY_LIMIT) return firstLine;
  return `${firstLine.slice(0, ERROR_SUMMARY_LIMIT - 3)}...`;
}

function formatAttachmentSummary(attachments: Attachment[]): string | null {
  if (attachments.length === 0) return null;
  return `첨부 ${attachments.length}개`;
}

function ScreenshotPlaceholder() {
  return (
    <div
      style={{
        borderRadius: 5,
        background: [
          'radial-gradient(at 30% 30%, rgba(94,106,210,0.15), transparent 60%)',
          'radial-gradient(at 70% 70%, rgba(229,72,77,0.12), transparent 60%)',
          'linear-gradient(135deg, #2a2b35 0%, #1a1b22 100%)',
        ].join(', '),
        border: '1px solid var(--border-subtle)',
        position: 'relative',
        overflow: 'hidden',
        aspectRatio: '16 / 10',
      }}
    >
      <span
        style={{
          position: 'absolute',
          bottom: 6,
          right: 8,
          fontSize: 9,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          background: 'rgba(0,0,0,0.55)',
          padding: '1px 6px',
          borderRadius: 3,
          letterSpacing: 0,
        }}
      >
        📷 screenshot
      </span>
    </div>
  );
}

function iconFor(name: string): string {
  if (name.includes('screenshot') || name.includes('image')) return '📷';
  if (name.includes('video')) return '🎬';
  if (name.includes('trace')) return '🔍';
  return '📎';
}
