'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useUser } from "@/hooks/useUser";

export default function Landing() {
    const router = useRouter();
    const { user, loading, loginAsGuest } = useUser();
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function handlePlay() {
        setError('');
        if (!user) {
            try {
                setBusy(true);
                await loginAsGuest(name.trim());
            } catch {
                setError('Could not reach the server.. Check if the backend is running?');
                setBusy(false);
                return;
            }
        }
        router.push('/game/random');
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
            <div className="text-5xl font-bold">Gambit</div>
            <div className="text-neutral-400">Play chess against a real opponent.</div>

            {loading ? (
                <div className="text-neutral-500">Loading…</div>
            ) : (
                <div>
                    {user ? (
                        <div className="text-neutral-300">Welcome back, {user.name}</div>
                    ) : (
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name (optional)"
                            className="w-64 rounded-lg bg-neutral-800 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-green-500"
                        />
                    )}
                    <Button onClick={handlePlay} disabled={busy}>
                        {user ? 'Play' : 'Play as guest'}
                    </Button>
                    {error && <div className="text-red-400">{error}</div>}
                </div>
            )}
        </div>
    );
}