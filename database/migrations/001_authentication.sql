CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  google_subject VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE CHECK (email = lower(email)),
  role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role = 'student'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE auth_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX auth_sessions_expire_idx ON auth_sessions (expire);
