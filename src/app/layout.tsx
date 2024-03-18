import { Toaster } from "@/components/ui/toaster";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import NavigationMenu from "@/components/NavigationMenuSideBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "FX Racing",
    description: "Formula 1 P10 Fantasy",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.className} antialiased`}>
                <header className="m-4 h-10 bg-inherit flex justify-between sticky items-center top-0 z-50">
                    <div className="flex items-center gap-2">
                        <Image
                            src={"/icon.ico"}
                            alt="icon"
                            width={50}
                            height={50}
                        />
                        <div>FXRACING</div>
                    </div>
                    {/*  <NavigationMenu /> */}
                </header>
                <main className="relative">{children}</main>
                <Toaster />
            </body>
        </html>
    );
}
