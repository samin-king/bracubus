import { validateBracuEmail } from '../src/services/authService.js';

const roles = ['student', 'driver', 'authority'];

// Validate operator configuration before opening a connection or writing any data.
// Never include supplied addresses in errors: Render logs may be shared publicly.
export function demoEmails(env) {
  const fields = [];
  const config = {};
  if (env.BRACU_STUDENT_EMAIL_PATTERN) {
    try { config.emailPattern = new RegExp(`^(?:${env.BRACU_STUDENT_EMAIL_PATTERN})$`, 'i'); }
    catch {
      throw Object.assign(new Error('Invalid BRACU_STUDENT_EMAIL_PATTERN configuration'), {
        name: 'DemoConfigurationError', code: 'invalid_email_pattern',
        fields: [{variable:'BRACU_STUDENT_EMAIL_PATTERN',reason:'invalid_regular_expression'}]
      });
    }
  }
  const emails = roles.map(role => {
    const variable = `DEMO_${role.toUpperCase()}_EMAIL`;
    const raw = env[variable];
    // Environment-entry whitespace is configuration formatting, not an auth bypass.
    const value = typeof raw === 'string' ? raw.trim() : raw;
    try { return validateBracuEmail(value, config); }
    catch {
      fields.push({variable,reason:!value ? 'required' : 'invalid_email'});
      return null;
    }
  });
  if (fields.length) {
    throw Object.assign(new Error('Invalid demo email configuration: ' + fields.map(f=>f.variable+' ('+f.reason+')').join(', ')), {
      name:'DemoConfigurationError',code:'invalid_email',fields
    });
  }
  if (new Set(emails).size !== roles.length) {
    const duplicates = roles.flatMap((role,index)=>emails.filter(e=>e===emails[index]).length>1
      ? [{variable:`DEMO_${role.toUpperCase()}_EMAIL`,reason:'duplicate_inbox'}] : []);
    throw Object.assign(new Error('Demo roles require three distinct inboxes'), {
      name:'DemoConfigurationError',code:'duplicate_demo_email',fields:duplicates
    });
  }
  return emails;
}

// Explicit demo provisioning, independent of all local authentication bypasses.
export async function seedDemo(db, env) {
  const emails = demoEmails(env);
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(376302)');
    const driver = (await db.query(`INSERT INTO drivers(name,license_number)
      VALUES('Demo Driver','DEMO-DRIVER-001') ON CONFLICT(license_number)
      DO UPDATE SET license_number=EXCLUDED.license_number RETURNING id,status`)).rows[0];
    if (driver.status !== 'ACTIVE') throw new Error('Demo driver is inactive');
    const users = [];
    for (const [index, role] of roles.entries()) {
      await db.query(`INSERT INTO users(google_subject,name,email,role,driver_id)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING`,
      ['email-demo:' + emails[index], 'Demo ' + role, emails[index], role, role === 'driver' ? driver.id : null]);
      const user = (await db.query('SELECT id,role,driver_id FROM users WHERE email=$1', [emails[index]])).rows[0];
      if (user.role !== role || (role === 'driver' && Number(user.driver_id) !== Number(driver.id))) {
        throw new Error('Existing demo account has a different role or driver link; refusing to overwrite');
      }
      users.push(user);
    }
    await db.query(`INSERT INTO buses(bus_number,registration_number,capacity,standing_capacity)
      VALUES('DEMO-28','DEMO-REG-28',28,4),('DEMO-37','DEMO-REG-37',37,4)
      ON CONFLICT(bus_number) DO NOTHING`);
    await db.query(`INSERT INTO routes(route_name,origin,destination,stops)
      SELECT 'Demo: Mirpur - BRAC University','Mirpur','BRAC University',ARRAY['Mirpur','Farmgate','BRAC University']
      WHERE NOT EXISTS(SELECT 1 FROM routes WHERE route_name='Demo: Mirpur - BRAC University')`);
    await db.query(`INSERT INTO trips(route_id,bus_id,driver_id,travel_date,departure_time)
      SELECT r.id,b.id,CASE WHEN b.bus_number='DEMO-28' THEN $1::integer ELSE NULL END,
      (now() AT TIME ZONE 'Asia/Dhaka')::date+d.day,departure.time
      FROM buses b CROSS JOIN generate_series(0,5) d(day)
      CROSS JOIN (VALUES(time '06:30'),(time '08:30'),(time '14:00'),(time '17:00')) departure(time)
      CROSS JOIN LATERAL(SELECT id FROM routes WHERE route_name='Demo: Mirpur - BRAC University' ORDER BY id LIMIT 1) r
      WHERE b.bus_number IN ('DEMO-28','DEMO-37') ON CONFLICT DO NOTHING`, [driver.id]);
    const student = String(users[0].id);
    await db.query(`INSERT INTO complaints(student_id,category,subject,description)
      SELECT $1,'service','Demo: service enquiry','Sample demo complaint for authority review.'
      WHERE NOT EXISTS(SELECT 1 FROM complaints WHERE student_id=$1 AND subject='Demo: service enquiry')`, [student]);
    await db.query(`INSERT INTO feedback(user_id,target,rating,comment)
      SELECT $1,'service',4,'Demo: sample service feedback.'
      WHERE NOT EXISTS(SELECT 1 FROM feedback WHERE user_id=$1 AND comment='Demo: sample service feedback.')`, [student]);
    await db.query(`INSERT INTO notifications(user_id,type,title,message)
      SELECT $1,'demo_welcome','Demo: welcome','Complete your student profile and choose an available trip. Booking windows still apply.'
      WHERE NOT EXISTS(SELECT 1 FROM notifications WHERE user_id=$1 AND type='demo_welcome')`, [student]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
