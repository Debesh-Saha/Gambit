import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL!;

const adapter = new PrismaPg({
  connectionString,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

const prisma = new PrismaClient({
  adapter,
});

export { GameStatus, AuthProvider } from "../generated/prisma/enums.js";
export default prisma;