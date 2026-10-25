INSERT INTO buses (bus_number,registration_number,capacity) VALUES ('BRACU-01','DEV-001',37),('BRACU-02','DEV-002',37),('BRACU-03','DEV-003',28) ON CONFLICT (bus_number) DO NOTHING;
INSERT INTO routes (route_name,origin,destination,stops)
SELECT 'Mirpur - BRAC University','Mirpur','BRAC University',ARRAY['Mirpur','Agargaon','Farmgate','BRAC University']
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE route_name='Mirpur - BRAC University');
INSERT INTO routes (route_name,origin,destination,stops)
SELECT 'Uttara - BRAC University','Uttara','BRAC University',ARRAY['Uttara','Airport','Badda','BRAC University']
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE route_name='Uttara - BRAC University');
INSERT INTO trips (route_id,bus_id,travel_date,departure_time)
SELECT r.id,b.id,(now() AT TIME ZONE 'Asia/Dhaka')::date + d.day, time '06:30' + (d.day % 2) * interval '30 minutes'
FROM buses b CROSS JOIN generate_series(1,5) AS d(day)
JOIN LATERAL (SELECT id FROM routes WHERE route_name = CASE WHEN d.day % 2=0 THEN 'Uttara - BRAC University' ELSE 'Mirpur - BRAC University' END ORDER BY id LIMIT 1) r ON true
WHERE b.bus_number IN ('BRACU-01','BRACU-02','BRACU-03') ON CONFLICT DO NOTHING;
