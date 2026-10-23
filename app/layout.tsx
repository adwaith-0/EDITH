import type { Metadata } from "next";
import { Inter } from "next/font/google";
import 'leaflet/dist/leaflet.css';
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

export const metadata: Metadata = {
    title: "EDITH Charge — Good energy, shared locally",
    description: "Rent private charging access from local hosts. Discover a compatible EV charger, request a time and plan your electric journey.",
    keywords: "EDITH Charge, private EV charger rental, Kochi, charging stations, trip planner",
    authors: [{ name: "EDITH Charge" }],
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "EDITH Charge",
    },
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#263d35",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <body className="antialiased" suppressHydrationWarning>
                {children}
            </body>
        </html>
    );
}
