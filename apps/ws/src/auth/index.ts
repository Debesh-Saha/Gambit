import jwt from 'jsonwebtoken';
import { User } from '../SocketManager';
import { WebSocket } from 'ws';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');

export interface userJwtClaims {
    userId: string;
    name: string;
    isGuest?: boolean;
}

export const extractAuthUser = (token: string, ws: WebSocket): User => {
    const decoded = jwt.verify(token, JWT_SECRET) as userJwtClaims;
    return new User(ws, decoded);
}