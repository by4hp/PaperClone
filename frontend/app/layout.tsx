import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "出卷好帮手 · PaperClone",
  description: "基于参考试卷与内容来源，生成同风格模拟试卷",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon='{"token": "4623c23dcba74823b43b42e25d9ca47b"}'
        />
      </body>
    </html>
  );
}
