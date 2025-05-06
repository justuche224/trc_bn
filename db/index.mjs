import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema.mjs';

const client = createClient({ url: process.env.DB_FILE_NAME });
const db = drizzle(client, { schema });

export { db, schema };
