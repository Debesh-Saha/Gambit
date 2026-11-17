'use client';

import { ReactNode } from "react";
import { UserProvider } from "@/hooks/useUser";
import { SocketProvider } from "@/hooks/useSocket";
import { GameProvider } from "@/hooks/useGame";

export default function Providers({children}: {children: ReactNode}){
    return (
        <UserProvider>
            <SocketProvider>
                <GameProvider>{children}</GameProvider>
            </SocketProvider>
        </UserProvider>
    );
}