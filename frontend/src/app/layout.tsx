import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner';
import ThemeProvider from '@/components/ThemeProvider';
import { SettingsProvider } from '@/components/SettingsProvider';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "CareerCopilot – AI Job Application Manager",
    description: "AI-powered job search, resume generation, and application tracking",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <SettingsProvider>
                    <ThemeProvider>
                        {children}
                        <Toaster position="bottom-right" richColors />
                    </ThemeProvider>
                </SettingsProvider>
            </body>
        </html>
    );
}
