import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal ??= new PrismaClient();
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;