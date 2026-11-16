'use client';

import {createContext, ReactNode, useCallback, useContext, useEffect, useState} from 'react';
import { BACKEND_URL } from '@/lib/config';
import { error } from 'console';

export interface User{
    id: String;
    name: String;
    token: String;
    isGuest: boolean;
}

interface UserContextValue{
    user: User | null;
    loading: boolean;
    loginAsGuest: (name: string) => Promise<void>;
}

const UserContext= createContext<UserContextValue | null>(null);

export function UserProvider({children}: {children: ReactNode}){
    const [user, setUser]= useState<User | null>(null);
    const [loading, setLoading]= useState(true);

    //On page load: do we already have a login cookie? (GET /auth/refresh)
    useEffect(()=>{
        let cancelled= false;
        (async()=> {
            try{
                const res= await fetch(`${BACKEND_URL}/auth/refresh`, {credentials: 'include'});
                if(res.ok){
                    const data= await res.json();
                    if(!cancelled){
                        setUser({
                            id: data.id,
                            name: data.name,
                            token: data.token,
                            isGuest: data.isGuest
                        })
                    }
                }
            }catch(err){
                console.error('Could not reach the backend', err);
            } finally{
                if(!cancelled) setLoading(false);
            }
        })();
        return ()=>{
            cancelled= true;
        };
    }, []);

    const loginAsGuest= useCallback(async (name: string)=>{
        const res= await fetch(`${BACKEND_URL}/auth/guest`,{
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name}),
        })
        if(!res.ok) throw new Error('Guest Login failed');
        const data= await res.json();
        setUser({
            id: data.id,
            name: data.name,
            token: data.token,
            isGuest: true
        });
    },[]);

    return (
        <UserContext.Provider value={{user, loading, loginAsGuest}}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser(){
    const ctx= useContext(UserContext);
    if(!ctx) throw new Error('useUser must be used inside <UserProvider>');
    return ctx;
}