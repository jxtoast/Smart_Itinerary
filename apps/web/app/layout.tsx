"use client";

import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Geist, Geist_Mono } from "next/font/google";
import { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="h-full">
      <head>
        <title>Smart Voyage</title>
      </head>
      <AuthProvider>
        <body className="flex flex-col min-h-screen bg-main-1">
          <div>
            <Header />
          </div>
          <div className="flex-1 overflow-auto flex flex-col">
            <main className="h-full flex-1 flex flex-col">{children}</main>
          </div>
          <div>
            <Footer />
          </div>
        </body>
      </AuthProvider>
    </html>
  );
}
