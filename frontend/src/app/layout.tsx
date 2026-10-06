import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from 'sonner';
import ThemeProvider from '@/components/ThemeProvider';
import { SettingsProvider } from '@/components/SettingsProvider';

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
            <body className="font-sans antialiased">
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
