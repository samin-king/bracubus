CREATE TABLE drivers (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 250),
 license_number text NOT NULL UNIQUE CHECK (length(btrim(license_number)) BETWEEN 1 AND 250),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER drivers_updated BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE trips DROP CONSTRAINT trips_driver_id_check;
ALTER TABLE trips ADD CONSTRAINT trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;
ALTER TABLE trips ADD COLUMN started_at timestamptz, ADD COLUMN completed_at timestamptz;
COMMENT ON COLUMN trips.driver_id IS 'Assigned driver; nullable until assignment. Historical references are protected.';
CREATE INDEX trips_driver_id_idx ON trips(driver_id);
CREATE UNIQUE INDEX trips_driver_departure_unique ON trips(driver_id,travel_date,departure_time) WHERE driver_id IS NOT NULL AND status <> 'CANCELLED';
CREATE UNIQUE INDEX trips_one_active_per_driver ON trips(driver_id) WHERE driver_id IS NOT NULL AND status = 'ACTIVE';
