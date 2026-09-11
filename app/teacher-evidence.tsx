'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import { LensVisual, OhmVisual, SoundVisual } from './experiment-visuals';
import { buildProcessProfile, eventDescription, replayInquiryAt, variableLabel } from './inquiry-insights';
import type { InquirySession, Measurement } from './inquiry-engine';

type Props = {
  session: InquirySession;
  eventLabels: Record<string, string>;
  formatMeasurement: (session: InquirySession, measurement: Measurement) => string;
};

const INDICATOR_LABELS = { observed: '已有过程证据', attention: '需要继续关注', unknown: '暂不判断' };

export function TeacherEvidence({ session, eventLabels, formatMeasurement }: Props) {
  const [cursor, setCursor] = useState(session.events.length - 1);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<{ label: string; refs: string[] } | null>(null);
  const replayRef = useRef<HTMLDivElement>(null);
  const profile = useMemo(() => buildProcessProfile(session), [session]);
  const replay = useMemo(() => replayInquiryAt(session, cursor), [session, cursor]);
  const lastIndex = session.events.length - 1;
  const actualCursor = Math.max(0, Math.min(cursor, lastIndex));

  useEffect(() => {
    if (!playing || actualCursor >= lastIndex) return;
    const timer = window.setInterval(() => setCursor((current) => Math.min(lastIndex, current + 1)), 850);
    return () => window.clearInterval(timer);
  }, [playing, lastIndex, actualCursor]);

  const focusEvents = (label: string, refs: string[]) => {
    setFocus({ label, refs });
    setPlaying(false);
    const first = session.events.findIndex((event) => refs.includes(event.id));
    if (first >= 0) setCursor(first);
    replayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const currentMeasurement = replay.measurements.find((row) => row.id === replay.event?.payload.measurementId);
  const microphoneObservation = currentMeasurement?.values.source === 'microphone';
  const displayedParameters = currentMeasurement?.values.source === 'generator'
    ? { ...replay.parameters, ...Object.fromEntries(Object.entries(currentMeasurement.values).filter(([, value]) => typeof value === 'number')) }
    : replay.parameters;
  const visibleEvents = session.events.map((event, index) => ({ event, index }))
    .filter(({ event }) => !focus || focus.refs.includes(event.id));

  return (
    <div className="iq-evidence-workspace">
      <section className="iq-process-profile" aria-label="本次探究过程画像">
        <h3>本次探究过程画像</h3>
        <p>每项都可回到原始行为核对；不把记录次数或未观察到的行为换算为能力分数。</p>
        <div>
          {profile.map((item) => (
            <article key={item.code} className={`is-${item.state}`}>
              <span>{INDICATOR_LABELS[item.state]}</span>
              <h4>{item.label}</h4>
              <p>{item.detail}</p>
              <button type="button" disabled={item.eventRefs.length === 0} onClick={() => focusEvents(item.label, item.eventRefs)}>
                查看 {item.eventRefs.length} 个依据事件 <ArrowRight />
              </button>
            </article>
          ))}
        </div>
      </section>

      {session.evidence.length > 0 && (
        <section className="iq-evidence-extracts">
          <h3>诊断依据与反证</h3>
          {session.evidence.map((item) => (
            <article key={item.id}>
              <div><strong>{item.label}</strong><span>{item.direction === 'support' ? '支持候选' : item.direction === 'counter' ? '反证' : '背景证据'} · {item.reliability === 'high' ? '高可信' : item.reliability === 'medium' ? '中等可信' : '低可信'}</span></div>
              <p>{item.detail}</p>
              <button className="iq-evidence-link" type="button" disabled={item.eventRefs.length === 0} onClick={() => focusEvents(item.label, item.eventRefs)}>
                回放 {item.eventRefs.length} 个依据事件 <ArrowRight />
              </button>
            </article>
          ))}
        </section>
      )}

      <section className="iq-replay" ref={replayRef} aria-label="学生实验路径回放">
        <div className="iq-section-head"><div><small>INQUIRY REPLAY</small><h3>学生实验路径回放</h3></div><span>{actualCursor + 1} / {session.events.length}</span></div>
        <p className="iq-muted">按事件先后重建装置和证据本，回放不会改动学生会话或播放声音。</p>
        <div className="iq-replay-controls">
          <button type="button" aria-label="上一个事件" disabled={actualCursor <= 0} onClick={() => { setPlaying(false); setCursor(actualCursor - 1); }}><ArrowLeft /></button>
          <button type="button" onClick={() => {
            if (actualCursor >= lastIndex) { setCursor(0); setPlaying(true); }
            else setPlaying((value) => !value);
          }}>{playing && actualCursor < lastIndex ? <Pause /> : <Play />}{playing && actualCursor < lastIndex ? '暂停' : actualCursor >= lastIndex ? '从头回放' : '自动回放'}</button>
          <button type="button" aria-label="下一个事件" disabled={actualCursor >= lastIndex} onClick={() => { setPlaying(false); setCursor(actualCursor + 1); }}><ArrowRight /></button>
          <input type="range" min={0} max={Math.max(0, lastIndex)} value={actualCursor} aria-label="回放事件位置" onChange={(event) => { setPlaying(false); setCursor(Number(event.target.value)); }} />
        </div>
        {replay.event && (
          <div className="iq-replay-current" aria-live="polite">
            <strong>{eventLabels[replay.event.type]}</strong>
            <p>{eventDescription(session, replay.event)}</p>
          </div>
        )}
        {microphoneObservation ? (
          <div className="iq-replay-sensor"><strong>麦克风派生读数</strong><p>{formatMeasurement(session, currentMeasurement!)}</p><small>仅保存测得的摘要，无法从这些读数还原原始波形或录音。</small></div>
        ) : session.experimentId === 'ohm' ? (
          <OhmVisual voltage={Number(displayedParameters.voltage)} resistance={Number(displayedParameters.resistance)} />
        ) : session.experimentId === 'lens' ? (
          <LensVisual focalLength={Number(displayedParameters.focalLength)} objectDistance={Number(displayedParameters.objectDistance)} screenPosition={Number(displayedParameters.screenPosition)} />
        ) : (
          <SoundVisual frequencyHz={Number(displayedParameters.frequencyHz)} loudness={Number(displayedParameters.loudness)} waveformCode={Number(displayedParameters.waveformCode)} />
        )}
        {!microphoneObservation && <p className="iq-replay-parameters">{Object.entries(displayedParameters).filter(([key]) => Object.hasOwn(replay.parameters, key)).map(([key, value]) => `${variableLabel(session, key)} ${value}`).join(' · ')}</p>}
        <details className="iq-replay-records">
          <summary>此时的证据本 · {replay.measurements.length} 组{replay.incompleteRecords > 0 ? ` · ${replay.incompleteRecords} 组旧记录缺少快照` : ''}</summary>
          {replay.measurements.length === 0 && <p>此时尚无可还原的实验记录。</p>}
          {replay.measurements.map((row, index) => <p key={row.id}><strong>#{index + 1}</strong> {formatMeasurement(session, row)}</p>)}
        </details>
        {focus && <div className="iq-replay-filter"><span>正在查看：{focus.label}</span><button type="button" onClick={() => setFocus(null)}><RotateCcw />显示全部事件</button></div>}
        <div className="iq-replay-events" aria-label="可选择的原始事件">
          {visibleEvents.length === 0 && <p>当前引用的事件不在这份记录中。</p>}
          {visibleEvents.map(({ event, index }) => (
            <button key={event.id} type="button" aria-current={index === actualCursor ? 'step' : undefined} className={index === actualCursor ? 'is-current' : ''} onClick={() => { setPlaying(false); setCursor(index); }}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><strong>{eventLabels[event.type]}</strong><p>{eventDescription(session, event)}</p><small>{new Date(event.timestamp).toLocaleTimeString('zh-CN')} · {event.id}</small></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
