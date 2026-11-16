import { Request, Response, Router } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { v4 as uuidv4 } from 'uuid';
import { COOKIE_MAX_AGE } from "../consts";

const authRoute = Router();

const CLIENT_URL = process.env.AUTH_REDIRECT_URL ?? 'http://localhost:5173/game/random';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set')

interface userJwtClaims {
    userId: string;
    name: string;
    isGuest?: boolean;
}

interface UserDetails {
    id: string;
    token?: string;
    name: string;
    isGuest?: boolean;
}

authRoute.post('/guest', async (req: Request, res: Response) => {
    try {
        const bodyData = req.body ?? {};
        let guestUUID = 'guest-' + uuidv4();

        const user = await db.user.create({
            data: {
                username: guestUUID,
                email: guestUUID + '@gambit.com',
                name: bodyData.name || guestUUID,
                provider: 'GUEST'
            }
        });

        const token = jwt.sign(
            { userId: user.id, name: user.name, isGuest: true },
            JWT_SECRET,
        );

        const UserDetails: UserDetails = {
            id: user.id,
            name: user.name!,
            token: token,
            isGuest: true
        };
        res.cookie('guest', token, { maxAge: COOKIE_MAX_AGE });
        res.json(UserDetails);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Could not create guest' });
    }
});

authRoute.get('/refresh', async (req: Request, res: Response) => {
    try {
        if (req.user) {
            const user = req.user as UserDetails;

            const userDb = await db.user.findFirst({
                where: {
                    id: user.id,
                }
            });

            const token = jwt.sign({ userId: user.id, name: userDb?.name }, JWT_SECRET);
            res.json({
                token,
                id: user.id,
                name: userDb?.name,
            });
        }
        else if (req.cookies && req.cookies.guest) {
            try {
                const decoded = jwt.verify(req.cookies.guest, JWT_SECRET) as userJwtClaims;
                const token = jwt.sign(
                    { userId: decoded.userId, name: decoded.name, isGuest: true }, JWT_SECRET
                );

                let User: UserDetails = {
                    id: decoded.userId,
                    name: decoded.name,
                    token: token,
                    isGuest: true,
                };

                res.cookie('guest', token, { maxAge: COOKIE_MAX_AGE });
                res.json(User);
            } catch (err) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
            }
        }
        else {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: 'Something went wrong'
        });
    }
});

authRoute.get('/login/failed', (req: Request, res: Response) => {
    res.status(401).json({
        success: false,
        message: 'failure'
    });
})

authRoute.get('/logout', (req: Request, res: Response) => {
    res.clearCookie('guest');
    req.logout((err) => {
        if (err) {
            console.error('Error logging out: ', err);
            res.status(500).json({ error: 'Failed to log out' });
        }
        else {
            res.clearCookie('jwt');
            res.redirect('http://localhost:3001/'); //http://localhost:5173/
        }
    });
});

authRoute.get(
    '/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }),
);

authRoute.get(
    '/google/callback',
    passport.authenticate('google', {
        successRedirect: CLIENT_URL,
        failureRedirect: '/auth/login/failed',
    }),
);

authRoute.get(
    '/github',
    passport.authenticate('github', { scope: ['read:user', 'user:email'] }),
);

authRoute.get(
    '/github/callback',
    passport.authenticate('github', {
        successRedirect: CLIENT_URL,
        failureRedirect: '/auth/login/failed',
    }),
);

export default authRoute;