import "reflect-metadata";
import { prisma } from "@transitchat/database";
import { Lifecycle, container } from "tsyringe";

import { PrismaUserRepository } from "./repositories/user-repository";

container.register("PrismaClient", {
  useValue: prisma,
});

container.register(
  "UserRepository",
  { useClass: PrismaUserRepository },
  { lifecycle: Lifecycle.Singleton }
);

export { container };
