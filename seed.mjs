import { db, schema } from './db/index.mjs';
// creat admin admin:admin
const admin = await db.insert(schema.admins).values({
    username: 'admin',
    password: 'admin'
});

console.log(admin);

