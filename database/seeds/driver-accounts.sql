-- Loaded only by the guarded development seed path. Existing account roles and links are never overwritten.
INSERT INTO users(google_subject,name,email,role,driver_id)
SELECT 'local-development:driver:'||d.license_number,d.name,
 CASE d.license_number WHEN 'DEV-DL-001' THEN 'driver.one@g.bracu.ac.bd' ELSE 'driver.two@g.bracu.ac.bd' END,
 'driver',d.id
FROM drivers d
WHERE d.license_number IN ('DEV-DL-001','DEV-DL-002')
 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.driver_id=d.id)
ON CONFLICT(email) DO NOTHING;
