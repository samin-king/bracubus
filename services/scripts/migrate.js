import 'dotenv/config';
import {migrate} from '../../server/src/utils/database.js';
import pg from 'pg';
import {config} from 'dotenv';
config({path:new URL('../../.env',import.meta.url)});
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try {await migrate(client);console.log('Migrations completed');} finally {client.release();await pool.end();}
