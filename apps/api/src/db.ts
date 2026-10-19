import { databaseUrl } from './config.js';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

export const db = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl }) });
