"use client";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isSignUp = pathname === "/sign-up";
  return (
    <main className="bg-neutral-100 min-h-screen">
      <div className="mx-auto max-w-360 p-4">
        <nav className="flex justify-between items-center">
          <Image src={"/logo.svg"} alt="logo" height={40} width={40} />
          <Button asChild variant={"secondary"}>
            <Link href={isSignUp ? "/sign-in" : "/sign-up"}>
              <span>{isSignUp ? "Sign In" : "Sign Up"}</span>
            </Link>
          </Button>
        </nav>
        <div className="flex flex-col items-center justify-center pt-4 md:pt-14">
          {children}
        </div>
      </div>
    </main>
  );
};

export default AuthLayout;
