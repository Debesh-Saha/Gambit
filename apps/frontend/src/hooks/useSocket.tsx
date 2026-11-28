'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { WS_URL } from "@/lib/config";
import { useUser } from "./useUser";

const SocketContext = createContext<WebSocket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const token = user?.token;
    const [socket, setSocket] = useState<WebSocket | null>(null);

    useEffect(() => {
        if (!token) return;

        let ws: WebSocket | null = null;
        let retry = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let stopped = false;

        const connect = () => {
            const current = new WebSocket(`${WS_URL}?token=${encodeURIComponent(String(token))}`);
            ws = current;

            current.onopen = () => {
                retry = 0;
                setSocket(current);
            };

            current.onclose = (event) => {
                setSocket((s) => (s === current ? null : s));
                // stop if we were shut down on purpose, or the server rejected our token (1008)
                if (stopped || event.code === 1008) return;
                const delay = Math.min(1000 * 2 ** retry, 10_000); // 1s, 2s, 4s, 8s, 10s...
                retry += 1;
                timer = setTimeout(connect, delay);
            };
        };

        connect();

        return () => {
            stopped = true;
            clearTimeout(timer);
            ws?.close();
        };
    }, [token]);

    return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
    return useContext(SocketContext);
}