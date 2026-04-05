import { prisma } from "@/lib/db/client";

export const USER_ID = "local-user";

export async function getUser() {
  return prisma.user.findUniqueOrThrow({
    where: { id: USER_ID },
  });
}

export async function getHealthProfile() {
  return prisma.healthProfile.findUnique({
    where: { userId: USER_ID },
  });
}
