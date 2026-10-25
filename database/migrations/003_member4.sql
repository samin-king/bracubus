-- Extend the existing Member 2 complaint system; retain all original records.
ALTER TABLE complaints DROP CONSTRAINT complaints_category_check;
ALTER TABLE complaints DROP CONSTRAINT complaints_status_check;
ALTER TABLE complaints ALTER COLUMN status SET DEFAULT 'pending';
UPDATE complaints SET status = CASE status WHEN 'Pending' THEN 'pending' WHEN 'In Review' THEN 'in_review' WHEN 'Resolved' THEN 'resolved' WHEN 'Rejected' THEN 'rejected' ELSE status END;
ALTER TABLE complaints ADD CONSTRAINT complaints_category_check CHECK (category IN ('service','driver','safety','schedule','other','Driver behaviour','Bus condition','Route problem','Overcrowding','Late bus','Seat/booking issue','Other'));
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check CHECK (status IN ('pending','in_review','resolved','rejected'));
ALTER TABLE complaints ADD COLUMN user_id text GENERATED ALWAYS AS (student_id::text) STORED,
 ADD COLUMN route_id integer REFERENCES routes(id) ON DELETE RESTRICT,
 ADD COLUMN response text CHECK(response IS NULL OR length(btrim(response)) BETWEEN 1 AND 5000),
 ADD COLUMN updated_by text, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX complaints_owner_created_idx ON complaints(user_id,created_at DESC,id DESC);
CREATE INDEX complaints_status_created_idx ON complaints(status,created_at DESC,id DESC);
CREATE TRIGGER complaints_updated BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE feedback (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id text NOT NULL CHECK (length(btrim(user_id)) BETWEEN 1 AND 250),
 target text NOT NULL CHECK (target IN ('service','bus','trip','route')),
 bus_id integer REFERENCES buses(id) ON DELETE RESTRICT,
 trip_id integer REFERENCES trips(id) ON DELETE RESTRICT,
 route_id integer REFERENCES routes(id) ON DELETE RESTRICT,
 rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
 comment text CHECK (comment IS NULL OR length(btrim(comment)) BETWEEN 1 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((target='service' AND bus_id IS NULL AND trip_id IS NULL AND route_id IS NULL)
 OR (target='bus' AND bus_id IS NOT NULL AND trip_id IS NULL AND route_id IS NULL)
 OR (target='trip' AND trip_id IS NOT NULL AND bus_id IS NULL AND route_id IS NULL)
 OR (target='route' AND route_id IS NOT NULL AND bus_id IS NULL AND trip_id IS NULL))
);
CREATE INDEX feedback_owner_created_idx ON feedback(user_id,created_at DESC,id DESC);
CREATE TABLE notifications (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id text NOT NULL CHECK (length(btrim(user_id)) BETWEEN 1 AND 250),
 type text NOT NULL CHECK (length(btrim(type)) BETWEEN 1 AND 100),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 250),
 message text NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 5000),
 reference_type text CHECK (reference_type IS NULL OR length(btrim(reference_type)) BETWEEN 1 AND 100),
 reference_id text CHECK (reference_id IS NULL OR length(btrim(reference_id)) BETWEEN 1 AND 250),
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_owner_created_idx ON notifications(user_id,created_at DESC,id DESC);
CREATE INDEX notifications_unread_idx ON notifications(user_id,created_at DESC) WHERE read_at IS NULL;
