ALTER TABLE buses ADD COLUMN standing_capacity integer NOT NULL DEFAULT 0 CHECK(standing_capacity >= 0);
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('student','driver','authority','admin'));
ALTER TABLE users ADD COLUMN driver_id integer UNIQUE REFERENCES drivers(id);
ALTER TABLE complaints ADD COLUMN transport_trip_id integer GENERATED ALWAYS AS
 (CASE WHEN trip_id ~ '^[1-9][0-9]*$' THEN trip_id::integer ELSE NULL END) STORED REFERENCES trips(id) ON DELETE RESTRICT;
ALTER TABLE feedback ADD COLUMN account_id bigint GENERATED ALWAYS AS (user_id::bigint) STORED REFERENCES users(id);
ALTER TABLE notifications ADD COLUMN account_id bigint GENERATED ALWAYS AS (user_id::bigint) STORED REFERENCES users(id);
