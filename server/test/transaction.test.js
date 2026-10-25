import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {transaction} from '../src/utils/transaction.js';
test('Transactions reuse connected pg.Client and commit or roll back without reconnecting',async()=>{
 const client=new pg.Client();const statements=[];
 client.connect=async()=>{throw new Error('Connected client must not reconnect');};
 client.query=async sql=>{statements.push(sql);return {rows:[]};};
 assert.equal(await transaction(client,async db=>{assert.equal(db,client);return 'done';}),'done');
 assert.deepEqual(statements,['BEGIN','COMMIT']);
 statements.length=0;
 await assert.rejects(transaction(client,async()=>{throw new Error('Operation failed');}),/Operation failed/);
 assert.deepEqual(statements,['BEGIN','ROLLBACK']);
});
