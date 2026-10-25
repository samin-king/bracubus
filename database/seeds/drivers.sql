INSERT INTO drivers(name,license_number) VALUES ('Development Driver One','DEV-DL-001'),('Development Driver Two','DEV-DL-002') ON CONFLICT (license_number) DO NOTHING;
WITH candidates AS (
 SELECT t.id, d.id AS driver_id, row_number() OVER (PARTITION BY d.id,t.travel_date,t.departure_time ORDER BY t.id) AS slot
 FROM trips t JOIN buses b ON b.id=t.bus_id
 JOIN drivers d ON d.license_number=CASE b.bus_number WHEN 'BRACU-01' THEN 'DEV-DL-001' WHEN 'BRACU-02' THEN 'DEV-DL-002' END AND d.status='ACTIVE'
 WHERE t.status='SCHEDULED' AND t.driver_id IS NULL AND t.travel_date > (now() AT TIME ZONE 'Asia/Dhaka')::date
)
UPDATE trips t SET driver_id=c.driver_id FROM candidates c
WHERE t.id=c.id AND c.slot=1 AND NOT EXISTS (
 SELECT 1 FROM trips other WHERE other.driver_id=c.driver_id AND other.travel_date=t.travel_date AND other.departure_time=t.departure_time AND other.status <> 'CANCELLED'
);
