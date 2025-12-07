import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../drizzle/schema.js';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection, { schema, mode: 'default' });

const plans = await db.query.plans.findMany();
console.log('Plans in database:');
plans.forEach(p => {
  console.log(`ID: ${p.id}, Name: ${p.nameAr}, Price: ${p.priceMonthly}`);
});

await connection.end();
