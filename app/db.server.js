import { PrismaClient } from "@prisma/client";

function hasCurrentPrismaSchema(prisma) {
  const fields = prisma?._runtimeDataModel?.models?.LoyaltySetting?.fields || [];

  return fields.some((field) => field.name === "iframeCustomCss");
}

if (process.env.NODE_ENV !== "production") {
  if (
    !global.prismaGlobal ||
    !global.prismaGlobal.rewardActivityLog ||
    !hasCurrentPrismaSchema(global.prismaGlobal)
  ) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
