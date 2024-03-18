"use client";

import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet";

import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import Link from "next/link";

import { RxHamburgerMenu } from "react-icons/rx";

export default async function NavigationMenuSideBar() {
    return (
        <div>
            <Sheet>
                <SheetTrigger>
                    <RxHamburgerMenu />
                </SheetTrigger>
                <SheetContent className="flex flex-col gap-4 items-center">
                    <NavigationMenu>
                        <NavigationMenuList className="flex-col">
                            <SheetClose>
                            <NavigationMenuItem>
                                    <Link
                                        href="/"
                                        legacyBehavior
                                        passHref
                                    >
                                        <NavigationMenuLink
                                            className={navigationMenuTriggerStyle()}
                                        >
                                            Home
                                        </NavigationMenuLink>
                                    </Link>
                                </NavigationMenuItem>
                                <NavigationMenuItem>
                                    <Link
                                        href="/leagues"
                                        legacyBehavior
                                        passHref
                                    >
                                        <NavigationMenuLink
                                            className={navigationMenuTriggerStyle()}
                                        >
                                            Leagues
                                        </NavigationMenuLink>
                                    </Link>
                                </NavigationMenuItem>
                            </SheetClose>
                            <SheetClose>
                                <NavigationMenuItem>
                                    <Link href="/about" legacyBehavior passHref>
                                        <NavigationMenuLink
                                            className={navigationMenuTriggerStyle()}
                                        >
                                            About
                                        </NavigationMenuLink>
                                    </Link>
                                </NavigationMenuItem>
                            </SheetClose>
                            <SheetClose>
                                <NavigationMenuItem>
                                    <Link
                                        href="/api/auth/signin"
                                        legacyBehavior
                                        passHref
                                    >
                                        <NavigationMenuLink
                                            className={navigationMenuTriggerStyle()}
                                        >
                                            Sign In
                                        </NavigationMenuLink>
                                    </Link>
                                </NavigationMenuItem>
                            </SheetClose>

                            <SheetClose>
                                <NavigationMenuItem>
                                    <Link
                                        href="/api/auth/signout"
                                        legacyBehavior
                                        passHref
                                    >
                                        <NavigationMenuLink
                                            className={navigationMenuTriggerStyle()}
                                        >
                                            Sign Out
                                        </NavigationMenuLink>
                                    </Link>
                                </NavigationMenuItem>
                            </SheetClose>
                        </NavigationMenuList>
                    </NavigationMenu>
                </SheetContent>
            </Sheet>
        </div>
    );
}
