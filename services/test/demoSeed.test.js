import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { demoEmails, seedDemo } from '../scripts/demoData.js';
import { validateBracuEmail } from '../src/services/authService.js';

const env = {
  DEMO_STUDENT_EMAIL: 'demo.student@g.bracu.ac.bd',
  DEMO_DRIVER_EMAIL: 'demo.driver@g.bracu.ac.bd',
  DEMO_AUTHORITY_EMAIL: 'demo.authority@g.bracu.ac.bd'
};

for (const variable of Object.keys(env)) {
  test(`demo preflight identifies invalid ${variable} without touching the database`, async () => {
    for (const value of [undefined,'','demo.driver1@g.bracu.ac.bd','demo_driver@g.bracu.ac.bd','demo.driver@example.com']) {
      let queries = 0;
      await assert.rejects(seedDemo({query:()=>{queries++;}}, {...env,[variable]:value}), error => {
        assert.equal(error.code,'invalid_email');
        assert.equal(error.fields.length,1);
        assert.equal(error.fields[0].variable,variable);
        if (value) assert.ok(!JSON.stringify(error).includes(value));
        return true;
      });
      assert.equal(queries,0);
    }
  });
}

test('demo preflight reports all missing variables and has no fake default accounts', () => {
  assert.throws(()=>demoEmails({}), error=>{
    assert.deepEqual(error.fields,Object.keys(env).map(variable=>({variable,reason:'required'})));
    return true;
  });
});

test('environment formatting is normalized; production auth validator remains strict', () => {
  const formatted=Object.fromEntries(Object.entries(env).map(([key,value])=>[key,'  '+value.toUpperCase()+'\n']));
  assert.deepEqual(demoEmails(formatted),Object.values(env));
  assert.throws(()=>validateBracuEmail(' '+env.DEMO_STUDENT_EMAIL+' '),/invalid_email/);
  assert.throws(()=>demoEmails({...env,DEMO_DRIVER_EMAIL:env.DEMO_STUDENT_EMAIL.toUpperCase()}),error=>{
    assert.equal(error.code,'duplicate_demo_email');
    assert.deepEqual(error.fields.map(f=>f.variable),['DEMO_STUDENT_EMAIL','DEMO_DRIVER_EMAIL']);
    return true;
  });
});

test('demo preflight respects the optional production email pattern', () => {
  assert.throws(()=>demoEmails({...env,BRACU_STUDENT_EMAIL_PATTERN:'demo\\.(?:student|authority)@g\\.bracu\\.ac\\.bd'}),error=>{
    assert.deepEqual(error.fields,[{variable:'DEMO_DRIVER_EMAIL',reason:'invalid_email'}]);
    return true;
  });
  assert.throws(()=>demoEmails({...env,BRACU_STUDENT_EMAIL_PATTERN:'['}),error=>{
    assert.equal(error.code,'invalid_email_pattern');
    return true;
  });
});

test('production seed CLI logs the failing field safely before attempting DB connection', () => {
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/seed-demo.js',import.meta.url))], {
    env:{...process.env,...env,NODE_ENV:'production',DATABASE_URL:'postgresql://unreachable.invalid/demo',
      BRACU_STUDENT_EMAIL_PATTERN:'',DEMO_DRIVER_EMAIL:'invalid_driver1@example.com'},encoding:'utf8',timeout:10000
  });
  assert.equal(child.status,1);
  assert.match(child.stderr,/DEMO_DRIVER_EMAIL/);
  assert.match(child.stderr,/invalid_email/);
  assert.doesNotMatch(child.stderr,/invalid_driver1@example.com|unreachable\.invalid|ENOTFOUND/);
  for(const value of Object.values(env)) assert.ok(!child.stderr.includes(value));
});

test('demo seed is repeatable, preserves profiles and refuses role escalation', async () => {
  const db = new PGlite();
  try {
    const root = new URL('../../database/migrations/', import.meta.url);
    for (const name of (await readdir(root)).filter(n => n.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name, root), 'utf8'));
    }
    // PGlite has no cross-process locking; PostgreSQL exercises the real lock.
    const adapter = {query:(sql, values) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({rows:[]}) : db.query(sql, values)};
    await seedDemo(adapter, env);
    await db.query("UPDATE users SET gender='female',gender_verified=true WHERE role='student'");
    await seedDemo(adapter, env);
    for (const [table, count] of [['users',3],['drivers',1],['buses',2],['routes',1],['trips',48],['complaints',1],['feedback',1],['notifications',1],['auth_sessions',0],['email_login_tokens',0],['bookings',0]]) {
      assert.equal(Number((await db.query('SELECT count(*) AS count FROM '+table)).rows[0].count), count, table);
    }
    const profile = (await db.query("SELECT gender,gender_verified FROM users WHERE role='student'")).rows[0];
    assert.equal(profile.gender,'female');
    assert.equal(profile.gender_verified,true);
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM trips WHERE driver_id IS NOT NULL')).rows[0].count),24);
    await assert.rejects(seedDemo(adapter, {...env,DEMO_STUDENT_EMAIL:env.DEMO_AUTHORITY_EMAIL,DEMO_AUTHORITY_EMAIL:env.DEMO_STUDENT_EMAIL}), /refusing to overwrite/);
    await assert.rejects(seedDemo(adapter, {...env,DEMO_DRIVER_EMAIL:env.DEMO_STUDENT_EMAIL}), /distinct inboxes/);
    await assert.rejects(seedDemo(adapter, {...env,DEMO_STUDENT_EMAIL:'invalid@example.com'}), /invalid_email/);
    assert.equal((await db.query("SELECT role FROM users WHERE email=$1",[env.DEMO_STUDENT_EMAIL])).rows[0].role,'student');
  } finally {await db.close();}
});
