import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "出卷好帮手 · PaperClone",
  description: "基于参考试卷与内容来源，生成同风格模拟试卷",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
