-- Member 2 owns no fleet or authentication tables. Gender is trusted profile data,
-- populated by the existing student registry, never by a booking request.
ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));
CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id),
  trip_id TEXT NOT NULL,
  travel_date DATE NOT NULL,
  departure_at TIMESTAMPTZ NOT NULL,
  trip_snapshot JSONB NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  seat_number INTEGER,
  standing BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  CHECK ((standing AND seat_number IS NULL) OR
    (NOT standing AND seat_number BETWEEN 1 AND capacity AND seat_number IS NOT NULL))
);
CREATE UNIQUE INDEX bookings_confirmed_seat ON bookings(trip_id, travel_date, seat_number)
  WHERE status = 'confirmed' AND NOT standing;
CREATE UNIQUE INDEX bookings_confirmed_student_trip ON bookings(student_id, trip_id, travel_date)
  WHERE status = 'confirmed';
CREATE INDEX bookings_student_date ON bookings(student_id, travel_date);
-- Serialize writes for the same student, including writes outside the API.
CREATE FUNCTION enforce_member2_booking_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    PERFORM id FROM users WHERE id = NEW.student_id FOR UPDATE;
    IF (SELECT count(*) FROM bookings WHERE student_id = NEW.student_id
        AND travel_date = NEW.travel_date AND status = 'confirmed' AND id <> NEW.id) >= 4 THEN
      RAISE EXCEPTION 'daily_booking_limit' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER member2_booking_limit BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_member2_booking_limit();
CREATE TABLE complaints (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id),
  booking_id BIGINT REFERENCES bookings(id),
  trip_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('Driver behaviour','Bus condition','Route problem','Overcrowding','Late bus','Seat/booking issue','Other')),
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 5000),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Review','Resolved','Rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX complaints_student_created ON complaints(student_id, created_at);
