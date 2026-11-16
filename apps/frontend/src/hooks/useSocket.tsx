'use client';

import {createContext, ReactNode, useContext, useEffect, useState} from "react";
import { WS_URL } from "@/lib/config";
import { useUser } from "./useUser";

const SocketContext= createContext<WebSocket | null>(null);

export function SocketProvider({children}: {children: ReactNode}){
    const {user}= useUser();
    const token= user?.token;
    const [socket, setSocket]= useState<WebSocket | null>(null);

    useEffect(()=> {
        if(!token) return;
        const ws= new WebSocket(`${WS_URL}?token=${encodeURIComponent(String(token))}`);
        ws.onopen=()=>setSocket(ws);
        ws.onclose=()=>setSocket((current)=>(current==ws? null: current));
        return ()=>{
            ws.close()
        }
    },[token]);

    return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket(){
    return useContext(SocketContext);
}