-- Explicit local development fixtures only. Gender is trusted seed/profile data, never a login parameter.
INSERT INTO users(google_subject,name,email,role,gender,gender_verified) VALUES
 ('local-development:booking:female','Development Female Student','female.student@g.bracu.ac.bd','student','female',true),
 ('local-development:booking:male','Development Male Student','male.student@g.bracu.ac.bd','student','male',true),
 ('local-development:booking:male-second','Development Second Male Student','male.second@g.bracu.ac.bd','student','male',true),
 ('local-development:booking:unverified','Development Unverified Student','unverified.student@g.bracu.ac.bd','student',NULL,false)
ON CONFLICT(email) DO NOTHING;
INSERT INTO buses(bus_number,registration_number,capacity,standing_capacity)
VALUES('DEV-BOOKING-01','DEV-BOOKING-01',37,2) ON CONFLICT(bus_number) DO NOTHING;
INSERT INTO routes(route_name,origin,destination,stops)
SELECT 'Development booking route','Campus','Development stop',ARRAY['Campus','Development stop']
WHERE NOT EXISTS(SELECT 1 FROM routes WHERE route_name='Development booking route');
INSERT INTO trips(bus_id,route_id,travel_date,departure_time)
SELECT b.id,r.id,(now() AT TIME ZONE 'Asia/Dhaka')::date+1,time '06:30'
FROM buses b CROSS JOIN LATERAL (SELECT id FROM routes WHERE route_name='Development booking route' ORDER BY id LIMIT 1) r
WHERE b.bus_number='DEV-BOOKING-01' ON CONFLICT DO NOTHING;
