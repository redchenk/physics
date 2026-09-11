import type { Metadata } from 'next';
import './globals.css';
import './platform-layout.css';

export const metadata: Metadata = {
  title: '格物 · 物理教学实验与探究平台',
  description: '声学、光学、电学与力学课堂仿真实验，连接学生探究、学习证据、诊断反馈与教师工作台。',
  openGraph: {
    title: '声迹 · 让声音变得看得见',
    description: '实时观察声音波形、响度、音调与音色的教学实验台。',
    type: 'website',
    locale: 'zh_CN',
    images: [
      {
        url: '/og.png',
        width: 1728,
        height: 908,
        alt: '声迹声音波形教学实验台',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '声迹 · 让声音变得看得见',
    description: '实时观察声音波形、响度、音调与音色的教学实验台。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body data-app-id="gewuphysics-inquiry-v1">{children}</body>
    </html>
  );
}
