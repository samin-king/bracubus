# Member 3 Part 1: Bus, route, trip

Latest local run: Parts 1 and 2 are running against native PostgreSQL. See [local verification](local-verification.md) for current results; it supersedes earlier database-unavailable notes below.

## Models and relationships
Full executable schema: Database/migrations/001_bus_route_trip.sql.
Buses: identity id, unique bus_number and optional unique registration_number, positive capacity, ACTIVE/INACTIVE/MAINTENANCE status, audit timestamps.
Routes: identity id, route_name, origin, destination, ordered PostgreSQL text[] stops, audit timestamps.
Trips: identity id, route_id and bus_id required foreign keys with RESTRICT deletion, nullable driver_id, travel_date, departure_time, SCHEDULED/ACTIVE/STOPPED/COMPLETED/CANCELLED status, audit timestamps.
Route 1 -> many Trips; Bus 1 -> many Trips. Trip data contains no duplicated route/bus fields. GET joins provide nested objects.
Driver assignment is reserved, with a null-only check preventing orphan IDs. Later drop trips_driver_id_check and add a drivers foreign key when the driver module exists; no driver table is created now.
All departure dates/times are Asia/Dhaka wall time. Audit timestamps use timestamptz. Triggers maintain updated_at.
Partial unique index prevents two non-cancelled trips for one bus/date/time. Cancellation frees the slot. No duration-overlap check is possible without journey duration data.
Indexes cover route_id, bus_id (unique index prefix), travel_date and status. No DELETE API is exposed.

## API
All payload fields use snake_case. PUT replaces writable fields; omitted status uses its default.
GET /api/buses; GET /api/buses/:id; POST /api/buses; PUT /api/buses/:id.
GET /api/routes; GET /api/routes/:id; POST /api/routes; PUT /api/routes/:id.
GET /api/trips; GET /api/trips/:id; POST /api/trips; PUT /api/trips/:id.
Lists return arrays; detail/create/update return objects. POST returns 201 with Location. GET/PUT return 200. Invalid 400, missing 404, duplicate 409, unexpected 500. No pagination in this initial module.

### Request examples
POST /api/buses
~~~json
{"bus_number":"BRACU-04","registration_number":"DEV-004","capacity":37,"status":"ACTIVE"}
~~~
POST /api/routes
~~~json
{"route_name":"Mirpur - BRAC University","origin":"Mirpur","destination":"BRAC University","stops":["Mirpur","Farmgate","BRAC University"]}
~~~
POST /api/trips
~~~json
{"bus_id":1,"route_id":1,"travel_date":"2026-10-20","departure_time":"06:30","status":"SCHEDULED"}
~~~
Example trip response (audit timestamps omitted):
~~~json
{"id":1,"bus_id":1,"route_id":1,"driver_id":null,"travel_date":"2026-10-20","departure_time":"06:30:00","status":"SCHEDULED","bus":{"id":1,"bus_number":"BRACU-01","capacity":37,"status":"ACTIVE"},"route":{"id":1,"route_name":"Mirpur - BRAC University","origin":"Mirpur","destination":"BRAC University","stops":["Mirpur","Farmgate","BRAC University"]}}
~~~
Error: {"error":"Invalid bus status"}.

## Seed
Three fictional buses (37,37,28 seats), example Mirpur and Uttara routes, fifteen SCHEDULED journeys over the next five Dhaka dates. No personal information. Migration and seed are repeatable; seeding on later dates adds new days.

## Run (PowerShell from repository root)
Requires Node.js 22.12+ or newer supported release, npm, Docker Compose and Git.
~~~powershell
git init
git switch -c m3-bus-route-trip
Copy-Item .env.example .env
npm.cmd install
docker compose up -d --wait
npm.cmd run migrate
npm.cmd run seed
npm.cmd run dev
~~~
If .env already exists, keep it and configure DATABASE_URL and API_PORT rather than overwriting it.
In another terminal:
~~~powershell
npm.cmd run dev --workspace transport-client
~~~
Open http://localhost:5173. Vite proxies /api to port 3000. If API_PORT changes, update the Vite proxy. Production hosting must proxy /api to Express and serve client dist. Database credentials stay server-side. Do not commit .env. Docker credentials are development-only. Future authentication middleware can mount before resource routers. No authentication, driver, booking, queue, tracking, payment, QR, dashboard or RBAC modules are included.
Windows filesystem is case-insensitive: the existing Client and Database directories hold the requested client and database files, preserving original placeholders. All project configuration refers to lowercase client/database; configuration preserves the actual Client and Database casing for Linux compatibility.

## Frontend
Pages: Buses, Routes, Trips. Cards: BusCard, RouteCard, TripCard. ManagementPage shares accessible forms and loading, empty, success and API error states. All HTTP requests use services/api.js via busApi, routeApi and tripApi. React never receives database credentials.

## Tests and build
~~~powershell
$env:TEST_DATABASE_URL = 'postgres://bracu:bracu_dev@localhost:5432/bracu_transport'
npm.cmd test
npm.cmd run build
~~~
Tests create and drop an isolated unique PostgreSQL schema; the role needs schema creation permission. Without TEST_DATABASE_URL, integration tests explicitly skip. Validation and HTTP error tests still run. Tests cover CRUD, relationships, invalid references, date/time/status validation, uniqueness, database constraints, protected deletion and migration/seed repeatability.

## Important implementation sections
Bus schema, route schema, trip schema, FK relationships, indexes and timestamp triggers: Database/migrations/001_bus_route_trip.sql.
Migration transaction, lock, ledger, and seed transaction: server/src/utils/database.js.
Trip endpoints: server/src/routes/tripRoutes.js -> controllers/tripController.js -> services/tripService.js -> services/resourceService.js.
The shared service uses fixed resource metadata and parameterized user values. Trip SELECT joins buses and routes and formats date/time independently of host timezone.

## Actual validation in this workspace

- Node.js v24.21.0. Dependencies installed; npm audit reports 0 vulnerabilities.
- Final npm.cmd test: tests 3, pass 2, fail 0, skipped 1, duration 306.5576 ms. PostgreSQL integration suite skipped because TEST_DATABASE_URL is not configured. Its 13 database subtests remain unverified.
- Final npm.cmd run build: Vite 6.4.4, 37 modules, built in 951 ms. HTML 0.37 kB, CSS 10.20 kB, JavaScript 150.24 kB.
- npm.cmd run migrate: failed, ECONNREFUSED: Database connection failed.
- npm.cmd run seed: failed, ECONNREFUSED: Database connection failed.
- Docker and Git commands are unavailable. No branch was created, no commit or push was performed, and no database schema or seed data was applied.
- Existing placeholders were not modified.

### Database/migrations/001_bus_route_trip.sql

~~~sql
CREATE TABLE buses (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 bus_number text NOT NULL UNIQUE CHECK (length(btrim(bus_number)) > 0),
 registration_number text UNIQUE CHECK (registration_number IS NULL OR length(btrim(registration_number)) > 0),
 capacity integer NOT NULL CHECK (capacity > 0),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','MAINTENANCE')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE routes (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 route_name text NOT NULL CHECK (length(btrim(route_name)) > 0),
 origin text NOT NULL CHECK (length(btrim(origin)) > 0),
 destination text NOT NULL CHECK (length(btrim(destination)) > 0),
 stops text[] NOT NULL DEFAULT '{}' CHECK (array_position(stops,NULL) IS NULL AND array_position(stops,'') IS NULL),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trips (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 route_id integer NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
 bus_id integer NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
 driver_id integer CHECK (driver_id IS NULL),
 travel_date date NOT NULL CHECK (isfinite(travel_date)),
 departure_time time(0) NOT NULL CHECK (departure_time < time '24:00'),
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','ACTIVE','STOPPED','COMPLETED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN trips.driver_id IS 'Reserved for later driver FK. Replace null-only check when driver module is introduced.';
CREATE UNIQUE INDEX trips_bus_departure_unique ON trips(bus_id,travel_date,departure_time) WHERE status <> 'CANCELLED';
CREATE INDEX trips_route_id_idx ON trips(route_id);
CREATE INDEX trips_travel_date_idx ON trips(travel_date);
CREATE INDEX trips_status_idx ON trips(status);
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER buses_updated BEFORE UPDATE ON buses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER routes_updated BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trips_updated BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION set_updated_at();

~~~

### server/src/routes/tripRoutes.js

~~~js
import { Router } from 'express';
import { tripController } from '../controllers/tripController.js';
export function tripRoutes(db) {
 const router=Router(), c=tripController(db);
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 router.get('/',wrap(c.list));router.get('/:id',wrap(c.get));router.post('/',wrap(c.create));router.put('/:id',wrap(c.update));
 return router;
}

~~~

### server/src/controllers/tripController.js

~~~js
import { tripService } from '../services/tripService.js';
import { id,validate } from '../utils/validation.js';
export function tripController(db) {
 const service=tripService(db);
 return {
 list:async(req,res)=>res.json(await service.list()),
 get:async(req,res)=>res.json(await service.get(id(req.params.id))),
 create:async(req,res)=>{const data=await service.create(validate('trip',req.body));res.location('/api/trips/'+data.id).status(201).json(data);},
 update:async(req,res)=>res.json(await service.update(id(req.params.id),validate('trip',req.body)))
 };
}

~~~

### server/src/services/resourceService.js

~~~js
import { HttpError } from '../middleware/errors.js';
const specs={
 bus:{table:'buses',fields:['bus_number','registration_number','capacity','status']},
 route:{table:'routes',fields:['route_name','origin','destination','stops']},
 trip:{table:'trips',fields:['route_id','bus_id','travel_date','departure_time','status']}
};
const select = kind => kind==='trip' ? "SELECT t.id,t.route_id,t.bus_id,t.driver_id,to_char(t.travel_date,'YYYY-MM-DD') AS travel_date,to_char(t.departure_time,'HH24:MI:SS') AS departure_time,t.status,t.created_at,t.updated_at,json_build_object('id',b.id,'bus_number',b.bus_number,'capacity',b.capacity,'status',b.status) AS bus,json_build_object('id',r.id,'route_name',r.route_name,'origin',r.origin,'destination',r.destination,'stops',r.stops) AS route FROM trips t JOIN buses b ON b.id=t.bus_id JOIN routes r ON r.id=t.route_id" : 'SELECT t.* FROM '+specs[kind].table+' t';
export function resourceService(db,kind) {
 const {table,fields}=specs[kind];
 const get=async id=>{
  const result=await db.query(select(kind)+' WHERE t.id=$1',[id]);
  if(!result.rows.length) throw new HttpError(404,kind+' not found');
  return result.rows[0];
 };
 return {
  list:async()=> (await db.query(select(kind)+' ORDER BY t.id DESC')).rows,
  get,
  create:async data=>{
   const result=await db.query('INSERT INTO '+table+' ('+fields.join(',')+') VALUES ('+fields.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING id',fields.map(f=>data[f]));
   return get(result.rows[0].id);
  },
  update:async(id,data)=>{
   const result=await db.query('UPDATE '+table+' SET '+fields.map((f,i)=>f+'=$'+(i+1)).join(',')+' WHERE id=$'+(fields.length+1)+' RETURNING id',[...fields.map(f=>data[f]),id]);
   if(!result.rows.length) throw new HttpError(404,kind+' not found');
   return get(id);
  }
 };
}

~~~

### server/src/utils/database.js

~~~js
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';
const root = new URL('../../../Database/', import.meta.url);
export async function migrate(db) {
 await db.query('BEGIN');
 try {
  await db.query('SELECT pg_advisory_xact_lock(376301)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of (await readdir(new URL('migrations/',root))).filter(n=>n.endsWith('.sql')).sort()) {
   const applied = await db.query('SELECT name FROM schema_migrations WHERE name=$1',[name]);
   if (!applied.rowCount) {
    await db.query(await readFile(new URL('migrations/'+name,root),'utf8'));
    await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
   }
  }
  await db.query('COMMIT');
 } catch(e) { await db.query('ROLLBACK'); throw e; }
}
export async function seed(db) {
 await db.query('BEGIN');
 try { await db.query(await readFile(new URL('seeds/development.sql',root),'utf8')); await db.query('COMMIT'); }
 catch(e) { await db.query('ROLLBACK'); throw e; }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 let db;
 try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  db = await pool.connect();
  if (process.argv[2]==='migrate') await migrate(db);
  else if (process.argv[2]==='seed') await seed(db);
  else throw new Error('Expected migrate or seed');
  console.log(process.argv[2]+' completed');
 } catch(e) { console.error(e.code ? e.code+': '+(e.message || 'Database connection failed') : e.message); process.exitCode=1; }
 finally { db?.release(); await pool.end(); }
}

~~~

## Files created

- .env
- .env.example
- .gitignore
- Client/index.html
- Client/package.json
- Client/postcss.config.js
- Client/src/components/BusCard.jsx
- Client/src/components/ManagementPage.jsx
- Client/src/components/RouteCard.jsx
- Client/src/components/TripCard.jsx
- Client/src/main.jsx
- Client/src/pages/Buses.jsx
- Client/src/pages/Routes.jsx
- Client/src/pages/Trips.jsx
- Client/src/services/api.js
- Client/src/services/busApi.js
- Client/src/services/routeApi.js
- Client/src/services/tripApi.js
- Client/src/style.css
- Client/vite.config.js
- Database/migrations/001_bus_route_trip.sql
- Database/seeds/development.sql
- compose.yaml
- docs/member3-part1-bus-route-trip.md
- package-lock.json
- package.json
- server/package.json
- server/src/app.js
- server/src/config/db.js
- server/src/controllers/busController.js
- server/src/controllers/routeController.js
- server/src/controllers/tripController.js
- server/src/index.js
- server/src/middleware/errors.js
- server/src/routes/busRoutes.js
- server/src/routes/routeRoutes.js
- server/src/routes/tripRoutes.js
- server/src/services/busService.js
- server/src/services/resourceService.js
- server/src/services/routeService.js
- server/src/services/tripService.js
- server/src/utils/database.js
- server/src/utils/validation.js
- server/test/api.test.js

Generated output: Client/dist/index.html, Client/dist/assets/index-Civskelj.css, Client/dist/assets/index-CE7yEC9f.js. Dependencies in node_modules and build output are ignored.

## Existing files modified

None. All original placeholder files remain untouched.
