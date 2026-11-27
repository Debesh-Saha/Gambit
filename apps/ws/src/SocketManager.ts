import {randomUUID} from 'crypto';
import { WebSocket } from 'ws';
import {userJwtClaims} from './auth';

export class User{
    public socket: WebSocket;
    public id: string;
    public userId: string;
    public name: string;
    public isGuest?: boolean | undefined;

    constructor(socket: WebSocket, userJwtClaims: userJwtClaims){
        this.socket= socket;
        this.userId= userJwtClaims.userId;
        this.id= randomUUID();
        this.name= userJwtClaims.name;
        this.isGuest= userJwtClaims.isGuest;
    }
}

class SocketManager {
    private static instance: SocketManager;
    private interestedSockets: Map<string, User[]>;
    // which room each CONNECTION is in (user.id is unique per connection)
    private userRoomMapping: Map<string, string>;

    private constructor() {
        this.interestedSockets = new Map<string, User[]>();
        this.userRoomMapping = new Map<string, string>();
    }

    static getInstance() {
        if (SocketManager.instance) {
            return SocketManager.instance;
        }
        SocketManager.instance = new SocketManager();
        return SocketManager.instance;
    }

    addUser(user: User, roomId: string) {
        // a connection can only be in one room at a time
        const previousRoom = this.userRoomMapping.get(user.id);
        if (previousRoom && previousRoom !== roomId) {
            this.removeUser(user);
        }
        const room = this.interestedSockets.get(roomId) || [];
        if (!room.some((u) => u.id === user.id)) {
            this.interestedSockets.set(roomId, [...room, user]);
        }
        this.userRoomMapping.set(user.id, roomId);
    }

    // is any connection of this ACCOUNT still in the room?
    hasUser(roomId: string, userId: string) {
        return (this.interestedSockets.get(roomId) || []).some((u) => u.userId === userId);
    }

    broadcast(roomId: string, message: string) {
        const users = this.interestedSockets.get(roomId);
        if (!users) {
            console.error("No user in the room");
            return;
        }
        users.forEach((user) => {
            if (user.socket.readyState === WebSocket.OPEN) {
                user.socket.send(message);
            }
        });
    }

    removeUser(user: User) {
        const roomId = this.userRoomMapping.get(user.id);
        if (!roomId) return; // this connection was not in any room
        const remaining = (this.interestedSockets.get(roomId) || []).filter(
            (u) => u.id !== user.id,
        );
        if (remaining.length === 0) {
            this.interestedSockets.delete(roomId);
        } else {
            this.interestedSockets.set(roomId, remaining);
        }
        this.userRoomMapping.delete(user.id);
    }
}

export const socketManager= SocketManager.getInstance();