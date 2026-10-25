-- Existing non-null genders were already trusted by booking; retain that behavior without guessing missing values.
ALTER TABLE users ADD COLUMN gender_verified boolean NOT NULL DEFAULT false;
UPDATE users SET gender_verified=true WHERE gender IN ('male','female');
ALTER TABLE users ADD CONSTRAINT users_verified_gender_check CHECK (NOT gender_verified OR gender IS NOT NULL);
