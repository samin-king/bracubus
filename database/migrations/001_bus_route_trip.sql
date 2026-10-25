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
