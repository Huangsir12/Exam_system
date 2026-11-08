import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '智能考试系统',
    template: '%s | 智能考试系统',
  },
  description:
    '基于知识文档的智能考试系统：文档解析、智能组卷、在线答题、自动阅卷与成绩统计分析。',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased bg-aurora`}>
        <a href="#main-content" className="skip-link">跳到主要内容</a>
        {children}
      </body>
    </html>
  );
}
