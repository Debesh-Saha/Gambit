const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GithubStrategy = require('passport-github2').Strategy;
import passport from "passport";
import dotenv from 'dotenv';
import { db } from "./db";

interface GithubEmailRes {
    email: string;
    primary: boolean;
    verified: boolean;
    visibility: 'private' | 'public';
}

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export function initPassport() {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        throw new Error('Missing environment variables for authentication providers',);
    }
    passport.use(
        new GoogleStrategy(
            {
                clientID: GOOGLE_CLIENT_ID,
                clientSecret: GOOGLE_CLIENT_SECRET,
                callbackURL: "/auth/google/callback",
            },
            async function (accessToken: string, refreshToken: string, profile: any, done: any) {
                try {
                    const email = profile.emails?.[0]?.value;
                    if (!email) return done(new Error('No email from Google'));

                    const user = await db.user.upsert({
                        where: { email },
                        update: { name: profile.displayName },
                        create: { email, name: profile.displayName, provider: 'GOOGLE' },
                    });
                    done(null, user);
                } catch (err) {
                    done(err);
                }
            },
        ),
    );
    passport.use(
        new GithubStrategy(
            {
                clientID: GITHUB_CLIENT_ID,
                clientSecret: GITHUB_CLIENT_SECRET,
                callbackURL: "/auth/github/callback",
            },
            async function (accessToken: string, refreshToken: string, profile: any, done: any) {
                try {
                    const res = await fetch('https://api.github.com/user/emails', {
                        headers: { Authorization: `token ${accessToken}` },
                    });
                    const data: GithubEmailRes[] = await res.json();
                    const primaryEmail = Array.isArray(data)
                        ? data.find((item) => item.primary)?.email
                        : undefined;
                    if (!primaryEmail) return done(new Error('No primary email from GitHub'));

                    const name = profile.displayName || profile.username;
                    const user = await db.user.upsert({
                        where: { email: primaryEmail },
                        update: { name },
                        create: { email: primaryEmail, name, provider: 'GITHUB' },
                    });
                    done(null, user);
                } catch (err) {
                    done(err);
                }
            },
        ),
    );
    passport.serializeUser(function (user: any, cb) {
        process.nextTick(function () {
            return cb(null, {
                id: user.id,
                username: user.username,
                picture: user.picture,
            });
        });
    });

    passport.deserializeUser(function (user: any, cb) {
        process.nextTick(function () {
            return cb(null, user);
        });
    });
}