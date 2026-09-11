export const CLASSROOM_MODULES = [
  {
    id: 'sound',
    title: '声学实验室',
    shortTitle: '声学',
    filename: '声迹-声音波形传感器.html',
    description: '播放、采集与比较声音，让响度、音调和音色的差异看得见。',
    experiments: ['声音发生器', '麦克风示波器', '音色频谱', 'A / B 波形对比'],
  },
  {
    id: 'optics',
    title: '光学实验室',
    shortTitle: '光学',
    filename: '光学仿真实验室.html',
    description: '自由组合光源、镜面、透镜与棱镜，用光屏观察成像和色散，探索自己的光路。',
    experiments: ['自由组合光路', '平面镜成像', '色散现象', '光的反射', '折射与全反射', '凸透镜成像', '凹透镜成像'],
  },
  {
    id: 'electricity',
    title: '电学实验室',
    shortTitle: '电学',
    filename: '电学仿真实验室.html',
    description: '自由组合元件、连接电路，用电流表和电压表测量并记录，探究电路与磁场规律。',
    experiments: ['自由搭建电路', '欧姆定律', '串联与并联', '元件伏安特性', '电磁感应'],
  },
  {
    id: 'mechanics',
    title: '力学实验室',
    shortTitle: '力学',
    filename: '力学仿真实验室.html',
    description: '自由挂接杠杆与滑轮、重新穿绕绳索，用拉力、力矩和位移探索简单机械。',
    experiments: ['自由组合装置', '杠杆平衡与测力', '定滑轮与动滑轮', '绳角与拉力', '滑轮组', '杠杆与滑轮组合'],
  },
] as const;

export type ClassroomModuleId = (typeof CLASSROOM_MODULES)[number]['id'];
export type PlatformDestination = 'classroom' | 'student' | 'teacher' | 'sound';
export type PlatformLocation = { view: PlatformDestination; module: ClassroomModuleId | null };

export function classroomUrl(id: ClassroomModuleId, embedded = false) {
  const experiment = CLASSROOM_MODULES.find((item) => item.id === id)!;
  return `/classroom/${encodeURIComponent(experiment.filename)}${embedded ? '?embedded=1' : ''}`;
}

export function parsePlatformHash(hash: string): PlatformLocation {
  const route = hash.replace(/^#\/?/, '');
  const experiment = CLASSROOM_MODULES.find((item) => route === `classroom/${item.id}`);
  if (experiment) return { view: 'classroom', module: experiment.id };
  if (route === 'student' || route === 'teacher') return { view: route, module: null };
  if (route === 'inquiry-scope') return { view: 'sound', module: null };
  return { view: 'classroom', module: null };
}

export function platformHash(location: PlatformLocation) {
  if (location.view === 'classroom') return location.module ? `#classroom/${location.module}` : '#classroom';
  return location.view === 'sound' ? '#inquiry-scope' : `#${location.view}`;
}
