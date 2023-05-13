export * from "@prisma/client"
import { PrismaClient } from "@prisma/client"
import pgPromise from "pg-promise"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
if (!process.env.DATABASE_URL) throw Error("Missing database url from .env")

export const pgp = pgPromise()
export const pgClient = pgp(process.env.DATABASE_URL)


// import { PrismaClient } from "@prisma/client";
// import pgPromise from "pg-promise"


// declare global {
//   var prisma: PrismaClient | undefined;
// }

// const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }


// export const prisma = global.prisma || new PrismaClient();

export type { PrismaClient } from "@prisma/client";

// if (process.env.NODE_ENV !== "production") global.prisma = prisma;

// if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
// if (!process.env.DATABASE_URL) throw Error("Missing database url from .env")

// export const pgp = pgPromise()
// export const pgClient = pgp(process.env.DATABASE_URL)
