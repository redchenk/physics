'use client';

import { ArrowRight, AudioLines, BookOpenCheck, ExternalLink, FlaskConical, LayoutGrid, Lightbulb, Scale, Users, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CLASSROOM_MODULES, classroomUrl, type ClassroomModuleId } from './classroom-catalog';

const ICONS = { sound: AudioLines, optics: Lightbulb, electricity: Zap, mechanics: Scale };

function ClassroomFrame({ id, active }: { id: ClassroomModuleId; active: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1000);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const experiment = CLASSROOM_MODULES.find((item) => item.id === id)!;

  useEffect(() => {
    const sendActive = () => frame.current?.contentWindow?.postMessage({ type: 'gewulab:active', active }, window.location.origin);
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.moduleId !== id) return;
      if (event.data.type === 'gewulab:ready') {
        setStatus('ready');
        sendActive();
      }
      if (event.data.type === 'gewulab:active-ack') setStatus('ready');
      if (event.data.type === 'gewulab:height' && Number.isFinite(event.data.height) && event.data.height > 0) {
        setHeight(Math.max(400, Math.min(100000, Math.ceil(event.data.height))));
      }
    }
    window.addEventListener('message', receive);
    sendActive();
    return () => window.removeEventListener('message', receive);
  }, [active, id]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timeout = window.setTimeout(() => setStatus((current) => current === 'loading' ? 'failed' : current), 15000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  return (
    <div className="classroom-frame-panel" hidden={!active}>
      {status === 'loading' && <output className="classroom-load-state">正在打开{experiment.title}……</output>}
      {status === 'failed' && <p className="classroom-load-state" role="alert">实验页面未能完成连接。可刷新页面，或<a href={classroomUrl(id)} target="_blank" rel="noreferrer">单独打开{experiment.title}</a>。</p>}
      <iframe
        ref={frame}
        src={classroomUrl(id, true)}
        title={`${experiment.title}课堂演示装置`}
        allow={id === 'sound' ? 'microphone' : undefined}
        className="classroom-frame"
        style={{ height }}
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'gewulab:active', active }, window.location.origin)}
        onError={() => setStatus('failed')}
      />
    </div>
  );
}

function ClassroomCenter() {
  return (
    <>
      <div className="classroom-heading">
        <div><p className="iq-kicker">课堂实验</p><h1>今天，从哪个实验开始？</h1><p>声学、光学、电学与力学实验，适合投屏讲解与自由探索。</p></div>
        <span className="classroom-mode-note"><FlaskConical />自由演示 · 不做学生诊断</span>
      </div>

      <section className="classroom-module-grid" aria-label="课堂实验室">
        {CLASSROOM_MODULES.map((module) => {
          const Icon = ICONS[module.id];
          return (
            <a key={module.id} className={`classroom-module classroom-module-${module.id}`} href={`#classroom/${module.id}`}>
              <div className="classroom-module-top"><span className="classroom-module-icon"><Icon /></span><span>课堂常用</span></div>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
              <ul>{module.experiments.map((label) => <li key={label}>{label}</li>)}</ul>
              <div className="classroom-module-enter">进入实验室 <ArrowRight /></div>
            </a>
          );
        })}
      </section>

      <section className="classroom-inquiry-section" aria-labelledby="inquiry-entries-title">
        <div className="classroom-section-heading"><div><span className="classroom-new-label">新增板块</span><h2 id="inquiry-entries-title">从课堂演示，走向学生探究</h2></div><p>独立入口，不改变原有上课方式。</p></div>
        <div className="classroom-inquiry-grid">
          <a className="classroom-inquiry-link" href="#student"><span className="classroom-entry-icon"><BookOpenCheck /></span><div><h3>学生探究</h3><p>预测、计划、操作、记录与结论，留下可追溯的学习证据。</p><small>欧姆定律 · 凸透镜成像 · 频率与音调</small></div><ArrowRight /></a>
          <a className="classroom-inquiry-link" href="#teacher"><span className="classroom-entry-icon"><Users /></span><div><h3>教师工作台 <span>Teacher OS</span></h3><p>查看探究过程与认知证据，复核候选判断，安排补充实验。</p><small>认知地图 · 过程回放 · 诊断复核 · 教学建议</small></div><ArrowRight /></a>
        </div>
        <a className="classroom-scope-link" href="#inquiry-scope"><AudioLines /><span><strong>探究声音采集</strong>将示波器实时读数或 A / B 片段摘要加入当前声学探究的证据本。</span><ArrowRight /></a>
      </section>
      <div className="classroom-planned"><span>后续实验室</span><span>热学 <small>规划中</small></span></div>
    </>
  );
}

export function ClassroomWorkspace({ active, moduleId }: { active: boolean; moduleId: ClassroomModuleId | null }) {
  const [visited, setVisited] = useState<ClassroomModuleId[]>([]);
  // Keep opened iframe instances mounted so switching sections retains their
  // in-memory records. Adjust only when a previously unseen module is selected.
  if (active && moduleId && !visited.includes(moduleId)) setVisited([...visited, moduleId]);
  const selected = CLASSROOM_MODULES.find((item) => item.id === moduleId);
  return (
    <main className="classroom-workspace" hidden={!active} id="classroom-content">
      <nav className="classroom-subnav" aria-label="课堂实验导航">
        <a href="#classroom" aria-current={!moduleId ? 'page' : undefined}><LayoutGrid />实验中心</a>
        {CLASSROOM_MODULES.map((module) => {
          const Icon = ICONS[module.id];
          return <a key={module.id} href={`#classroom/${module.id}`} aria-current={moduleId === module.id ? 'page' : undefined}><Icon />{module.title}</a>;
        })}
      </nav>
      {!selected && <ClassroomCenter />}
      {selected && <div className="classroom-lab-heading"><div><h1>{selected.title}</h1><p>{selected.experiments.join(' · ')}</p></div><a className="iq-button iq-button-outline" href={classroomUrl(selected.id)} target="_blank" rel="noreferrer"><ExternalLink />单独窗口演示</a></div>}
      {selected && <p className="classroom-record-note">课堂记录在本页切换板块时保留，刷新或关闭后清除；不会自动加入学生档案。离开声学会停止声音和采集，并取消尚未完成的录制。</p>}
      {CLASSROOM_MODULES.filter((module) => visited.includes(module.id) || (active && moduleId === module.id)).map((module) => <ClassroomFrame key={module.id} id={module.id} active={active && moduleId === module.id} />)}
    </main>
  );
}
