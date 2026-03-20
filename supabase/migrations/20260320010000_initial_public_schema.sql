-- Consolidated baseline migration for TripBoard
-- Generated from the current checked-in public schema snapshot.

create schema if not exists public;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

CREATE TABLE IF NOT EXISTS "public"."charging_session_tesla_sync_jobs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "charging_session_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "charging_session_tesla_sync_jobs_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "charging_session_tesla_sync_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'unavailable'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."charging_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "start_battery_pct" double precision,
    "end_battery_pct" double precision,
    "energy_added_kwh" double precision,
    "charge_rate_kw" double precision,
    "latitude" double precision,
    "longitude" double precision,
    "location_name" "text",
    "charger_type" "text",
    "cost_estimate" double precision,
    "is_complete" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cost_user_entered" double precision,
    "currency" "text" DEFAULT 'CHF'::"text",
    "energy_delivered_kwh" double precision,
    "charger_price_per_kwh" double precision,
    "tesla_charge_event_id" "text"
);

COMMENT ON COLUMN "public"."charging_sessions"."energy_delivered_kwh" IS 'Total energy delivered by the charger for the session when available from Tesla charging history/invoice data.';

COMMENT ON COLUMN "public"."charging_sessions"."charger_price_per_kwh" IS 'Per-kWh station rate reported by Tesla for the charging session when available.';

COMMENT ON COLUMN "public"."charging_sessions"."tesla_charge_event_id" IS 'Tesla charging history / invoice event identifier used to reconcile Supercharger session metadata.';

CREATE TABLE IF NOT EXISTS "public"."maintenance_records" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "source_key" "text",
    "service_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "odometer_km" integer,
    "season" "text",
    "rotation_status" "text" DEFAULT 'not_applicable'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tyre_set_id" "uuid",
    "start_odometer_km" integer,
    "end_odometer_km" integer,
    "cost_amount" numeric,
    "cost_currency" "text",
    "user_id" "uuid",
    CONSTRAINT "maintenance_records_cost_amount_check" CHECK ((("cost_amount" IS NULL) OR ("cost_amount" >= (0)::numeric))),
    CONSTRAINT "maintenance_records_end_odometer_km_check" CHECK ((("end_odometer_km" IS NULL) OR ("end_odometer_km" >= 0))),
    CONSTRAINT "maintenance_records_odometer_km_check" CHECK ((("odometer_km" IS NULL) OR ("odometer_km" >= 0))),
    CONSTRAINT "maintenance_records_rotation_status_check" CHECK (("rotation_status" = ANY (ARRAY['rotated'::"text", 'not_rotated'::"text", 'unknown'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "maintenance_records_season_check" CHECK ((("season" IS NULL) OR ("season" = ANY (ARRAY['summer'::"text", 'winter'::"text", 'all_season'::"text"])))),
    CONSTRAINT "maintenance_records_service_type_check" CHECK (("service_type" = ANY (ARRAY['tyre_season'::"text", 'tyre_rotation'::"text", 'wheel_alignment'::"text", 'cabin_air_filter'::"text", 'hepa_filter'::"text", 'brake_fluid_check'::"text", 'brake_service'::"text", 'wiper_blades'::"text", 'ac_desiccant_bag'::"text", 'twelve_volt_battery'::"text", 'other'::"text"]))),
    CONSTRAINT "maintenance_records_start_odometer_km_check" CHECK ((("start_odometer_km" IS NULL) OR ("start_odometer_km" >= 0)))
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "units" "text" DEFAULT 'imperial'::"text",
    "region" "text" DEFAULT 'eu'::"text",
    "notifications_enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profiles_region_check" CHECK (("region" = ANY (ARRAY['na'::"text", 'eu'::"text", 'cn'::"text"]))),
    CONSTRAINT "profiles_units_check" CHECK (("units" = ANY (ARRAY['imperial'::"text", 'metric'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."telemetry_raw" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vin" "text" NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    "payload" "jsonb" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."tesla_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_token_hash" "text" NOT NULL,
    "access_token_encrypted" "text" NOT NULL,
    "refresh_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "region" "text" DEFAULT 'eu'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    CONSTRAINT "tesla_sessions_region_check" CHECK (("region" = ANY (ARRAY['na'::"text", 'eu'::"text", 'cn'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."trip_waypoints" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "speed_mph" double precision,
    "battery_level" integer,
    "odometer" double precision,
    "heading" integer
);

CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vin" "text" NOT NULL,
    "start_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_time" timestamp with time zone,
    "is_complete" boolean DEFAULT false,
    "start_latitude" numeric,
    "start_longitude" numeric,
    "start_address" "text",
    "end_latitude" numeric,
    "end_longitude" numeric,
    "end_address" "text",
    "start_odometer" numeric,
    "end_odometer" numeric,
    "start_battery_pct" numeric,
    "end_battery_pct" numeric,
    "distance_miles" numeric,
    "energy_used_kwh" numeric,
    "max_speed_mph" numeric,
    "avg_speed_mph" numeric,
    "min_outside_temp" numeric,
    "max_outside_temp" numeric,
    "avg_outside_temp" numeric,
    "vehicle_id" "uuid" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."tyre_sets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "source_key" "text",
    "name" "text" NOT NULL,
    "season" "text" NOT NULL,
    "purchase_date" "date",
    "purchase_odometer_km" integer,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    CONSTRAINT "tyre_sets_purchase_odometer_km_check" CHECK ((("purchase_odometer_km" IS NULL) OR ("purchase_odometer_km" >= 0))),
    CONSTRAINT "tyre_sets_season_check" CHECK (("season" = ANY (ARRAY['summer'::"text", 'winter'::"text", 'all_season'::"text"]))),
    CONSTRAINT "tyre_sets_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'retired'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "polling_driving" integer DEFAULT 30,
    "polling_charging" integer DEFAULT 300,
    "polling_parked" integer DEFAULT 1800,
    "polling_sleeping" integer DEFAULT 3600,
    "region" "text" DEFAULT 'eu'::"text",
    "units" "text" DEFAULT 'imperial'::"text",
    "notifications_enabled" boolean DEFAULT true,
    "data_source" "text" DEFAULT 'telemetry'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "map_style" "text" DEFAULT 'streets'::"text",
    "currency" "text" DEFAULT 'CHF'::"text",
    "date_format" "text" DEFAULT 'DD/MM'::"text",
    "home_latitude" double precision,
    "home_longitude" double precision,
    "home_address" "text",
    "minimum_trip_distance_miles" numeric DEFAULT 0.3 NOT NULL,
    CONSTRAINT "user_settings_data_source_check" CHECK (("data_source" = ANY (ARRAY['polling'::"text", 'telemetry'::"text"]))),
    CONSTRAINT "user_settings_date_format_check" CHECK (("date_format" = ANY (ARRAY['DD/MM'::"text", 'MM/DD'::"text"]))),
    CONSTRAINT "user_settings_map_style_check" CHECK (("map_style" = ANY (ARRAY['streets'::"text", 'dark'::"text"]))),
    CONSTRAINT "user_settings_minimum_trip_distance_miles_check" CHECK (("minimum_trip_distance_miles" >= (0)::numeric)),
    CONSTRAINT "user_settings_region_check" CHECK (("region" = ANY (ARRAY['na'::"text", 'eu'::"text", 'cn'::"text"]))),
    CONSTRAINT "user_settings_units_check" CHECK (("units" = ANY (ARRAY['imperial'::"text", 'metric'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."vehicle_status" (
    "vin" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "shift_state" "text",
    "speed" numeric,
    "odometer" numeric,
    "battery_level" numeric,
    "lat" numeric,
    "lon" numeric,
    "inside_temp" numeric,
    "outside_temp" numeric,
    "is_locked" boolean,
    "current_trip_id" "uuid",
    "trip_start_battery" numeric,
    "trip_start_odometer" numeric,
    "sentry_mode" boolean,
    "charge_state" "text",
    "charger_power" numeric,
    "is_climate_on" boolean,
    "car_version" "text",
    "door_df" boolean DEFAULT false,
    "door_dr" boolean DEFAULT false,
    "door_pf" boolean DEFAULT false,
    "door_pr" boolean DEFAULT false,
    "trunk_ft" boolean DEFAULT false,
    "trunk_rt" boolean DEFAULT false,
    "tpms_fl" numeric,
    "tpms_fr" numeric,
    "tpms_rl" numeric,
    "tpms_rr" numeric,
    "est_battery_range" numeric,
    "charge_energy_added" numeric,
    "time_to_full_charge" numeric,
    "heading" numeric,
    "rated_range" numeric,
    "window_fd" "text",
    "window_fp" "text",
    "window_rd" "text",
    "window_rp" "text",
    "home_address" "text",
    "current_charging_session_id" "uuid",
    "home_latitude" numeric,
    "home_longitude" numeric,
    "charge_limit_soc" integer,
    "state" "text"
);

CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tesla_id" "text" NOT NULL,
    "vin" "text" NOT NULL,
    "display_name" "text",
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "region" "text" DEFAULT 'eu'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "vehicles_region_check" CHECK (("region" = ANY (ARRAY['na'::"text", 'eu'::"text", 'cn'::"text"])))
);

ALTER TABLE ONLY "public"."charging_session_tesla_sync_jobs"
    ADD CONSTRAINT "charging_session_tesla_sync_jobs_charging_session_id_key" UNIQUE ("charging_session_id");

ALTER TABLE ONLY "public"."charging_session_tesla_sync_jobs"
    ADD CONSTRAINT "charging_session_tesla_sync_jobs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."charging_sessions"
    ADD CONSTRAINT "charging_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."maintenance_records"
    ADD CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."maintenance_records"
    ADD CONSTRAINT "maintenance_records_source_key_key" UNIQUE ("source_key");

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."telemetry_raw"
    ADD CONSTRAINT "telemetry_raw_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tesla_sessions"
    ADD CONSTRAINT "tesla_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tesla_sessions"
    ADD CONSTRAINT "tesla_sessions_session_token_hash_key" UNIQUE ("session_token_hash");

ALTER TABLE ONLY "public"."tesla_sessions"
    ADD CONSTRAINT "tesla_sessions_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."trip_waypoints"
    ADD CONSTRAINT "trip_waypoints_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tyre_sets"
    ADD CONSTRAINT "tyre_sets_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tyre_sets"
    ADD CONSTRAINT "tyre_sets_source_key_key" UNIQUE ("source_key");

ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."vehicle_status"
    ADD CONSTRAINT "vehicle_status_pkey" PRIMARY KEY ("vin");

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_user_id_tesla_id_key" UNIQUE ("user_id", "tesla_id");

CREATE INDEX "idx_charging_session_tesla_sync_jobs_status_queued_at" ON "public"."charging_session_tesla_sync_jobs" USING "btree" ("status", "queued_at");

CREATE INDEX "idx_charging_sessions_complete_start_time" ON "public"."charging_sessions" USING "btree" ("start_time" DESC) WHERE ("is_complete" = true);

CREATE INDEX "idx_charging_sessions_vehicle_id" ON "public"."charging_sessions" USING "btree" ("vehicle_id");

CREATE INDEX "idx_maintenance_records_service_type" ON "public"."maintenance_records" USING "btree" ("service_type", "start_date" DESC);

CREATE INDEX "idx_maintenance_records_start_date" ON "public"."maintenance_records" USING "btree" ("start_date" DESC);

CREATE INDEX "idx_maintenance_records_tyre_set_id" ON "public"."maintenance_records" USING "btree" ("tyre_set_id", "start_date" DESC);

CREATE INDEX "idx_maintenance_records_user_id_start_date" ON "public"."maintenance_records" USING "btree" ("user_id", "start_date" DESC) WHERE ("user_id" IS NOT NULL);

CREATE INDEX "idx_notifications_type" ON "public"."notifications" USING "btree" ("type", "created_at" DESC);

CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("vehicle_id", "is_read", "created_at" DESC);

CREATE INDEX "idx_telemetry_vin_time" ON "public"."telemetry_raw" USING "btree" ("vin", "timestamp" DESC);

CREATE INDEX "idx_tesla_sessions_user_id_last_used_at" ON "public"."tesla_sessions" USING "btree" ("user_id", "last_used_at" DESC) WHERE ("user_id" IS NOT NULL);

CREATE INDEX "idx_trip_waypoints_trip_id" ON "public"."trip_waypoints" USING "btree" ("trip_id");

CREATE UNIQUE INDEX "idx_trip_waypoints_trip_id_timestamp" ON "public"."trip_waypoints" USING "btree" ("trip_id", "timestamp");

CREATE INDEX "idx_trips_complete_start_time" ON "public"."trips" USING "btree" ("start_time" DESC) WHERE ("is_complete" = true);

CREATE INDEX "idx_trips_vehicle_id_start_time" ON "public"."trips" USING "btree" ("vehicle_id", "start_time" DESC);

CREATE INDEX "idx_tyre_sets_status" ON "public"."tyre_sets" USING "btree" ("status", "season", "created_at" DESC);

CREATE INDEX "idx_tyre_sets_user_id_created_at" ON "public"."tyre_sets" USING "btree" ("user_id", "created_at" DESC) WHERE ("user_id" IS NOT NULL);

CREATE INDEX "idx_vehicles_user_id" ON "public"."vehicles" USING "btree" ("user_id");
ALTER TABLE ONLY "public"."charging_session_tesla_sync_jobs"
    ADD CONSTRAINT "charging_session_tesla_sync_jobs_charging_session_id_fkey" FOREIGN KEY ("charging_session_id") REFERENCES "public"."charging_sessions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."charging_session_tesla_sync_jobs"
    ADD CONSTRAINT "charging_session_tesla_sync_jobs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."charging_sessions"
    ADD CONSTRAINT "charging_sessions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."maintenance_records"
    ADD CONSTRAINT "maintenance_records_tyre_set_id_fkey" FOREIGN KEY ("tyre_set_id") REFERENCES "public"."tyre_sets"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."maintenance_records"
    ADD CONSTRAINT "maintenance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."tesla_sessions"
    ADD CONSTRAINT "tesla_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");

ALTER TABLE ONLY "public"."tyre_sets"
    ADD CONSTRAINT "tyre_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION "public"."backfill_trip_waypoints"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    _affected_count integer := 0;
BEGIN
    WITH route_candidates AS (
        SELECT
            t.id AS trip_id,
            tr.timestamp,
            MAX(
                CASE
                    WHEN item->>'key' = 'Location'
                        THEN (item->'value'->'locationValue'->>'latitude')::double precision
                    ELSE NULL
                END
            ) AS latitude,
            MAX(
                CASE
                    WHEN item->>'key' = 'Location'
                        THEN (item->'value'->'locationValue'->>'longitude')::double precision
                    ELSE NULL
                END
            ) AS longitude,
            MAX(
                CASE
                    WHEN item->>'key' = 'VehicleSpeed'
                        THEN COALESCE(
                            (item->'value'->>'doubleValue')::double precision,
                            (item->'value'->>'intValue')::double precision
                        )
                    ELSE NULL
                END
            ) AS speed_mph,
            MAX(
                CASE
                    WHEN item->>'key' = 'BatteryLevel'
                        THEN COALESCE(
                            (item->'value'->>'doubleValue')::double precision,
                            (item->'value'->>'intValue')::double precision
                        )
                    ELSE NULL
                END
            ) AS battery_level,
            MAX(
                CASE
                    WHEN item->>'key' = 'Odometer'
                        THEN COALESCE(
                            (item->'value'->>'doubleValue')::double precision,
                            (item->'value'->>'intValue')::double precision
                        )
                    ELSE NULL
                END
            ) AS odometer,
            MAX(
                CASE
                    WHEN item->>'key' = 'Heading'
                        THEN COALESCE(
                            (item->'value'->>'doubleValue')::double precision,
                            (item->'value'->>'intValue')::double precision
                        )
                    ELSE NULL
                END
            ) AS heading
        FROM public.trips t
        JOIN public.telemetry_raw tr
          ON tr.vin = t.vin
         AND tr.timestamp >= t.start_time - INTERVAL '30 seconds'
         AND tr.timestamp <= COALESCE(t.end_time, NOW()) + INTERVAL '30 seconds'
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tr.payload->'data', '[]'::jsonb)) AS item
        WHERE t.vin IS NOT NULL
        GROUP BY t.id, tr.timestamp
    ), upserted AS (
        INSERT INTO public.trip_waypoints (
            trip_id,
            timestamp,
            latitude,
            longitude,
            speed_mph,
            battery_level,
            odometer,
            heading
        )
        SELECT
            route_candidates.trip_id,
            route_candidates.timestamp,
            route_candidates.latitude,
            route_candidates.longitude,
            route_candidates.speed_mph,
            CASE
                WHEN route_candidates.battery_level IS NULL THEN NULL
                ELSE ROUND(route_candidates.battery_level)::integer
            END,
            route_candidates.odometer,
            CASE
                WHEN route_candidates.heading IS NULL THEN NULL
                ELSE ROUND(route_candidates.heading)::integer
            END
        FROM route_candidates
        WHERE route_candidates.latitude IS NOT NULL
          AND route_candidates.longitude IS NOT NULL
        ON CONFLICT (trip_id, timestamp) DO UPDATE
        SET
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            speed_mph = COALESCE(EXCLUDED.speed_mph, trip_waypoints.speed_mph),
            battery_level = COALESCE(EXCLUDED.battery_level, trip_waypoints.battery_level),
            odometer = COALESCE(EXCLUDED.odometer, trip_waypoints.odometer),
            heading = COALESCE(EXCLUDED.heading, trip_waypoints.heading)
        RETURNING 1
    )
    SELECT COUNT(*)
    INTO _affected_count
    FROM upserted;

    RETURN _affected_count;
END;
$$;

COMMENT ON FUNCTION "public"."backfill_trip_waypoints"() IS 'Backfills exact trip routes from telemetry_raw into trip_waypoints for historical trips.';

CREATE OR REPLACE FUNCTION "public"."claim_pending_tesla_charging_sync_jobs"("p_limit" integer DEFAULT 10) RETURNS SETOF "public"."charging_session_tesla_sync_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH candidates AS (
        SELECT job.id
        FROM public.charging_session_tesla_sync_jobs job
        WHERE job.status = 'pending'
           OR (
               job.status = 'processing'
               AND job.processing_started_at <= now() - interval '15 minutes'
           )
        ORDER BY job.queued_at ASC
        LIMIT GREATEST(COALESCE(p_limit, 10), 1)
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.charging_session_tesla_sync_jobs job
        SET
            status = 'processing',
            attempt_count = job.attempt_count + 1,
            processing_started_at = now()
        FROM candidates
        WHERE job.id = candidates.id
        RETURNING job.*
    )
    SELECT *
    FROM claimed;
END;
$$;

COMMENT ON FUNCTION "public"."claim_pending_tesla_charging_sync_jobs"("p_limit" integer) IS 'Claims pending Supercharger Tesla sync jobs for out-of-band processing.';

CREATE OR REPLACE FUNCTION "public"."create_charging_complete_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_location text;
    v_battery_pct numeric;
    v_energy_suffix text;
BEGIN
    IF NOT NEW.is_complete OR COALESCE(OLD.is_complete, false) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.notifications
        WHERE type = 'charging_complete'
          AND data->>'session_id' = NEW.id::text
    ) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.vehicles vehicles
        LEFT JOIN public.user_settings user_settings
          ON user_settings.user_id = vehicles.user_id
        WHERE vehicles.id = NEW.vehicle_id
          AND COALESCE(user_settings.notifications_enabled, true) = false
    ) THEN
        RETURN NEW;
    END IF;

    v_location := COALESCE(NULLIF(NEW.location_name, ''), 'Unknown location');
    v_battery_pct := COALESCE(NEW.end_battery_pct, NEW.start_battery_pct, 0);
    v_energy_suffix := CASE
        WHEN COALESCE(NEW.energy_added_kwh, 0) > 0
            THEN format(' (+%s kWh)', round(NEW.energy_added_kwh::numeric, 1))
        ELSE ''
    END;

    INSERT INTO public.notifications (vehicle_id, type, title, message, data)
    VALUES (
        NEW.vehicle_id,
        'charging_complete',
        'Charging Complete',
        format('Charged to %s%% at %s%s', v_battery_pct, v_location, v_energy_suffix),
        jsonb_build_object(
            'session_id', NEW.id,
            'battery_pct', v_battery_pct,
            'energy_kwh', NEW.energy_added_kwh,
            'location', v_location,
            'charger_type', NEW.charger_type
        )
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."enqueue_supercharger_tesla_sync_job"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NEW.is_complete = true
       AND COALESCE(NEW.charger_type, '') ILIKE '%supercharger%'
       AND NEW.tesla_charge_event_id IS NULL THEN
        INSERT INTO public.charging_session_tesla_sync_jobs (
            charging_session_id,
            vehicle_id
        )
        VALUES (
            NEW.id,
            NEW.vehicle_id
        )
        ON CONFLICT (charging_session_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."generate_daily_trip_summary"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_record record;
    v_trip_count integer;
    v_total_distance double precision;
    v_total_energy double precision;
    v_avg_efficiency double precision;
    v_message text;
    v_yesterday_start timestamptz;
    v_yesterday_end timestamptz;
BEGIN
    v_yesterday_start := (current_date - interval '1 day')::timestamptz;
    v_yesterday_end := current_date::timestamptz;

    FOR v_record IN
        SELECT
            vehicles.id AS vehicle_id,
            count(*) AS trip_count,
            coalesce(sum(trips.distance_miles), 0) AS total_distance,
            coalesce(sum(trips.energy_used_kwh), 0) AS total_energy
        FROM public.trips
        JOIN public.vehicles
          ON public.vehicles.id = public.trips.vehicle_id
        LEFT JOIN public.user_settings
          ON public.user_settings.user_id = public.vehicles.user_id
        WHERE public.trips.start_time >= v_yesterday_start
          AND public.trips.start_time < v_yesterday_end
          AND public.trips.is_complete = true
          AND COALESCE(public.user_settings.notifications_enabled, true) = true
        GROUP BY public.vehicles.id
    LOOP
        v_trip_count := v_record.trip_count;
        v_total_distance := round(v_record.total_distance::numeric, 1);
        v_total_energy := round(v_record.total_energy::numeric, 1);

        IF v_total_distance > 0 THEN
            v_avg_efficiency := round(((v_total_energy * 1000) / v_total_distance)::numeric, 0);
        ELSE
            v_avg_efficiency := 0;
        END IF;

        v_message := format(
            '%s trip%s yesterday: %s mi, %s kWh used, %s Wh/mi avg',
            v_trip_count,
            CASE WHEN v_trip_count = 1 THEN '' ELSE 's' END,
            v_total_distance,
            v_total_energy,
            v_avg_efficiency
        );

        IF NOT EXISTS (
            SELECT 1
            FROM public.notifications
            WHERE vehicle_id = v_record.vehicle_id
              AND type = 'trip_summary'
              AND data->>'date' = to_char(v_yesterday_start, 'YYYY-MM-DD')
        ) THEN
            INSERT INTO public.notifications (vehicle_id, type, title, message, data)
            VALUES (
                v_record.vehicle_id,
                'trip_summary',
                'Daily Trip Summary',
                v_message,
                jsonb_build_object(
                    'trip_count', v_trip_count,
                    'total_distance_miles', v_total_distance,
                    'total_energy_kwh', v_total_energy,
                    'avg_efficiency_wh_mi', v_avg_efficiency,
                    'date', to_char(v_yesterday_start, 'YYYY-MM-DD')
                )
            );
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_charging_analytics_daily"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("day" "date", "battery_energy" numeric, "delivered_energy" numeric, "loss_energy" numeric, "cost" numeric, "sessions" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    with filtered as (
        select
            charging_session.start_time::date as day,
            greatest(coalesce(charging_session.energy_added_kwh, 0), 0) as battery_energy,
            greatest(coalesce(charging_session.energy_delivered_kwh, charging_session.energy_added_kwh, 0), 0) as delivered_energy,
            greatest(
                coalesce(
                    charging_session.cost_user_entered,
                    charging_session.cost_estimate,
                    coalesce(charging_session.energy_delivered_kwh, charging_session.energy_added_kwh, 0) * charging_session.charger_price_per_kwh,
                    0
                ),
                0
            ) as total_cost
        from public.charging_sessions charging_session
        join public.vehicles vehicle
          on vehicle.id = charging_session.vehicle_id
        where vehicle.user_id = auth.uid()
          and charging_session.is_complete = true
          and charging_session.start_time >= p_from
          and charging_session.start_time <= p_to
    )
    select
        day,
        coalesce(sum(battery_energy), 0) as battery_energy,
        coalesce(sum(delivered_energy), 0) as delivered_energy,
        coalesce(sum(greatest(delivered_energy - battery_energy, 0)), 0) as loss_energy,
        coalesce(sum(total_cost), 0) as cost,
        count(*) as sessions
    from filtered
    group by day
    order by day asc;
$$;

CREATE OR REPLACE FUNCTION "public"."get_charging_analytics_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("total_sessions" bigint, "total_battery_energy" numeric, "total_delivered_energy" numeric, "total_loss_energy" numeric, "total_loss_cost" numeric, "total_cost" numeric, "home_energy" numeric, "supercharger_energy" numeric, "third_party_fast_energy" numeric, "destination_energy" numeric, "other_energy" numeric, "home_cost" numeric, "supercharger_cost" numeric, "third_party_fast_cost" numeric, "destination_cost" numeric, "other_cost" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    with filtered as (
        select
            lower(coalesce(charging_session.charger_type, 'other')) as charger_type_key,
            greatest(coalesce(charging_session.energy_added_kwh, 0), 0) as battery_energy,
            greatest(coalesce(charging_session.energy_delivered_kwh, charging_session.energy_added_kwh, 0), 0) as delivered_energy,
            greatest(
                coalesce(
                    charging_session.cost_user_entered,
                    charging_session.cost_estimate,
                    coalesce(charging_session.energy_delivered_kwh, charging_session.energy_added_kwh, 0) * charging_session.charger_price_per_kwh,
                    0
                ),
                0
            ) as total_cost
        from public.charging_sessions charging_session
        join public.vehicles vehicle
          on vehicle.id = charging_session.vehicle_id
        where vehicle.user_id = auth.uid()
          and charging_session.is_complete = true
          and charging_session.start_time >= p_from
          and charging_session.start_time <= p_to
    ),
    normalized as (
        select
            case
                when charger_type_key like '%3rd_party_fast%' then 'third_party_fast'
                when charger_type_key like '%super%' then 'supercharger'
                when charger_type_key like '%home%' then 'home'
                when charger_type_key like '%dest%' then 'destination'
                else 'other'
            end as source_key,
            battery_energy,
            delivered_energy,
            greatest(delivered_energy - battery_energy, 0) as loss_energy,
            total_cost
        from filtered
    ),
    costed as (
        select
            source_key,
            battery_energy,
            delivered_energy,
            loss_energy,
            total_cost,
            case
                when delivered_energy > 0 and total_cost > 0
                    then total_cost * (loss_energy / delivered_energy)
                else 0
            end as loss_cost
        from normalized
    )
    select
        count(*) as total_sessions,
        coalesce(sum(battery_energy), 0) as total_battery_energy,
        coalesce(sum(delivered_energy), 0) as total_delivered_energy,
        coalesce(sum(loss_energy), 0) as total_loss_energy,
        coalesce(sum(loss_cost), 0) as total_loss_cost,
        coalesce(sum(total_cost), 0) as total_cost,
        coalesce(sum(battery_energy) filter (where source_key = 'home'), 0) as home_energy,
        coalesce(sum(battery_energy) filter (where source_key = 'supercharger'), 0) as supercharger_energy,
        coalesce(sum(battery_energy) filter (where source_key = 'third_party_fast'), 0) as third_party_fast_energy,
        coalesce(sum(battery_energy) filter (where source_key = 'destination'), 0) as destination_energy,
        coalesce(sum(battery_energy) filter (where source_key = 'other'), 0) as other_energy,
        coalesce(sum(total_cost) filter (where source_key = 'home'), 0) as home_cost,
        coalesce(sum(total_cost) filter (where source_key = 'supercharger'), 0) as supercharger_cost,
        coalesce(sum(total_cost) filter (where source_key = 'third_party_fast'), 0) as third_party_fast_cost,
        coalesce(sum(total_cost) filter (where source_key = 'destination'), 0) as destination_cost,
        coalesce(sum(total_cost) filter (where source_key = 'other'), 0) as other_cost
    from costed;
$$;

CREATE OR REPLACE FUNCTION "public"."get_charging_list_summary"("p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_vehicle_id" "uuid" DEFAULT NULL::"uuid", "p_preferred_currency" "text" DEFAULT NULL::"text") RETURNS TABLE("total_sessions" bigint, "total_battery_energy" numeric, "total_delivered_energy" numeric, "max_charge_rate" numeric, "total_cost" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with filtered_sessions as (
    select
        charging_session.energy_added_kwh,
        charging_session.energy_delivered_kwh,
        charging_session.charge_rate_kw,
        charging_session.currency,
        case
            when lower(coalesce(charging_session.charger_type, '')) like '%supercharger%'
                then case
                    when charging_session.cost_estimate is not null then charging_session.cost_estimate
                    else charging_session.cost_user_entered
                end
            else coalesce(charging_session.cost_user_entered, charging_session.cost_estimate)
        end as display_cost
    from public.charging_sessions charging_session
    join public.vehicles vehicle
      on vehicle.id = charging_session.vehicle_id
    where vehicle.user_id = auth.uid()
      and (p_from is null or charging_session.start_time >= p_from)
      and (p_to is null or charging_session.start_time <= p_to)
      and (p_vehicle_id is null or charging_session.vehicle_id = p_vehicle_id)
)
select
    count(*)::bigint as total_sessions,
    round(coalesce(sum(coalesce(energy_added_kwh, 0)), 0)::numeric, 3) as total_battery_energy,
    round(coalesce(sum(coalesce(energy_delivered_kwh, 0)), 0)::numeric, 3) as total_delivered_energy,
    round(coalesce(max(coalesce(charge_rate_kw, 0)), 0)::numeric, 2) as max_charge_rate,
    round(
        coalesce(
            sum(
                case
                    when display_cost is not null
                        and (currency = p_preferred_currency or currency is null or p_preferred_currency is null)
                        then display_cost
                    else 0
                end
            ),
            0
        )::numeric,
        2
    ) as total_cost
from filtered_sessions;
$$;

CREATE OR REPLACE FUNCTION "public"."get_maintenance_summary"("p_from_date" "date" DEFAULT NULL::"date", "p_to_date" "date" DEFAULT NULL::"date") RETURNS TABLE("total_records" bigint, "tyre_records" bigint, "other_records" bigint, "latest_logged_odometer_km" integer, "paid_records" bigint, "total_spend" numeric, "average_paid_cost" numeric, "spend_currency" "text", "mixed_currencies" boolean, "season_changes" bigint, "rotations" bigint, "tyre_work_records" bigint, "active_tyre_sets" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    with filtered_records as (
        select
            maintenance_record.service_type,
            maintenance_record.cost_amount,
            coalesce(maintenance_record.cost_currency, 'CHF') as cost_currency,
            maintenance_record.odometer_km
        from public.maintenance_records maintenance_record
        where maintenance_record.user_id = auth.uid()
          and (p_from_date is null or maintenance_record.start_date >= p_from_date)
          and (p_to_date is null or maintenance_record.start_date <= p_to_date)
    ),
    summary as (
        select
            count(*) as total_records,
            count(*) filter (where service_type in ('tyre_season', 'tyre_rotation')) as tyre_records,
            count(*) filter (where cost_amount is not null) as paid_records,
            coalesce(sum(cost_amount), 0) as total_spend,
            count(*) filter (where service_type = 'tyre_season') as season_changes,
            count(*) filter (where service_type = 'tyre_rotation') as rotations
        from filtered_records
    ),
    currency_stats as (
        select
            count(distinct cost_currency) filter (where cost_amount is not null) as currency_count,
            min(cost_currency) filter (where cost_amount is not null) as single_currency
        from filtered_records
    ),
    latest_odometer as (
        select odometer_km
        from filtered_records
        where odometer_km is not null
        order by odometer_km desc
        limit 1
    ),
    active_tyre_sets as (
        select count(*) as active_tyre_sets
        from public.tyre_sets
        where user_id = auth.uid()
          and status = 'active'
    )
    select
        summary.total_records,
        summary.tyre_records,
        greatest(summary.total_records - summary.tyre_records, 0) as other_records,
        (select odometer_km from latest_odometer) as latest_logged_odometer_km,
        summary.paid_records,
        case
            when coalesce(currency_stats.currency_count, 0) <= 1
                then round(summary.total_spend::numeric, 2)
            else null
        end as total_spend,
        case
            when coalesce(currency_stats.currency_count, 0) <= 1 and summary.paid_records > 0
                then round((summary.total_spend / summary.paid_records)::numeric, 2)
            else null
        end as average_paid_cost,
        case
            when coalesce(currency_stats.currency_count, 0) <= 1
                then currency_stats.single_currency
            else null
        end as spend_currency,
        coalesce(currency_stats.currency_count, 0) > 1 as mixed_currencies,
        summary.season_changes,
        summary.rotations,
        summary.season_changes + summary.rotations as tyre_work_records,
        (select active_tyre_sets from active_tyre_sets) as active_tyre_sets
    from summary
    cross join currency_stats;
$$;

CREATE OR REPLACE FUNCTION "public"."get_trip_list_summary"("p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_vehicle_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("total_trips" bigint, "total_distance" numeric, "total_energy" numeric, "avg_efficiency" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
WITH current_settings AS (
    SELECT GREATEST(
        COALESCE(
            (
                SELECT user_settings.minimum_trip_distance_miles
                FROM public.user_settings AS user_settings
                WHERE user_settings.user_id = auth.uid()
            ),
            0.3
        ),
        0
    ) AS minimum_trip_distance_miles
),
filtered_trips AS (
    SELECT
        GREATEST(
            COALESCE(
                trip.distance_miles,
                CASE
                    WHEN trip.start_odometer IS NOT NULL AND trip.end_odometer IS NOT NULL
                        THEN trip.end_odometer - trip.start_odometer
                    ELSE NULL
                END,
                0
            ),
            0
        ) AS distance_miles,
        CASE
            WHEN trip.energy_used_kwh IS NOT NULL THEN trip.energy_used_kwh
            WHEN trip.start_battery_pct IS NOT NULL
                AND trip.end_battery_pct IS NOT NULL
                AND trip.start_battery_pct > trip.end_battery_pct
                THEN ((trip.start_battery_pct - trip.end_battery_pct) / 100.0) * 75
            ELSE 0
        END AS energy_kwh
    FROM public.trips AS trip
    JOIN public.vehicles AS vehicle
      ON vehicle.id = trip.vehicle_id
     AND vehicle.user_id = auth.uid()
    WHERE (p_from IS NULL OR trip.start_time >= p_from)
      AND (p_to IS NULL OR trip.start_time <= p_to)
      AND (p_vehicle_id IS NULL OR trip.vehicle_id = p_vehicle_id)
),
qualifying_trips AS (
    SELECT filtered_trips.*
    FROM filtered_trips
    CROSS JOIN current_settings
    WHERE filtered_trips.distance_miles >= current_settings.minimum_trip_distance_miles
)
SELECT
    COUNT(*)::bigint AS total_trips,
    ROUND(COALESCE(SUM(distance_miles), 0)::numeric, 3) AS total_distance,
    ROUND(COALESCE(SUM(energy_kwh), 0)::numeric, 3) AS total_energy,
    CASE
        WHEN COALESCE(SUM(distance_miles), 0) > 0
            THEN ROUND((SUM(energy_kwh) * 1000 / SUM(distance_miles))::numeric, 2)
        ELSE 0
    END AS avg_efficiency
FROM qualifying_trips;
$$;

CREATE OR REPLACE FUNCTION "public"."get_trip_speed_metrics"("p_trip_id" "uuid") RETURNS TABLE("max_speed_mph" numeric, "avg_speed_mph" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    WITH trip_row AS (
        SELECT
            t.id,
            t.vin,
            t.start_time,
            COALESCE(t.end_time, NOW()) AS end_time
        FROM public.trips t
        WHERE t.id = p_trip_id
        LIMIT 1
    ),
    telemetry_samples AS (
        SELECT
            tr.timestamp,
            MAX(
                CASE
                    WHEN item->>'key' = 'VehicleSpeed'
                        THEN COALESCE(
                            (item->'value'->>'doubleValue')::numeric,
                            (item->'value'->>'intValue')::numeric
                        )
                    ELSE NULL
                END
            ) AS speed_mph
        FROM trip_row t
        JOIN public.telemetry_raw tr
          ON tr.vin = t.vin
         AND tr.timestamp >= t.start_time
         AND tr.timestamp <= t.end_time
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tr.payload->'data', '[]'::jsonb)) AS item
        GROUP BY tr.timestamp
    ),
    telemetry_stats AS (
        SELECT
            MAX(speed_mph)::numeric AS max_speed_mph,
            AVG(speed_mph)::numeric AS avg_speed_mph
        FROM telemetry_samples
        WHERE speed_mph IS NOT NULL
    ),
    waypoint_stats AS (
        SELECT
            MAX(tw.speed_mph)::numeric AS max_speed_mph,
            AVG(tw.speed_mph)::numeric AS avg_speed_mph
        FROM public.trip_waypoints tw
        WHERE tw.trip_id = p_trip_id
          AND tw.speed_mph IS NOT NULL
    )
    SELECT
        COALESCE(telemetry_stats.max_speed_mph, waypoint_stats.max_speed_mph) AS max_speed_mph,
        COALESCE(telemetry_stats.avg_speed_mph, waypoint_stats.avg_speed_mph) AS avg_speed_mph
    FROM telemetry_stats
    CROSS JOIN waypoint_stats;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."process_telemetry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    _data jsonb;
    _key text;
    _val jsonb;
    _value_obj jsonb;
    _vin text;
    _vehicle_uuid uuid;
    _event_time timestamptz;
    _gear text := NULL;
    _sentry_state text;
    _charge_state text := NULL;
    _effective_charge_state text := NULL;
    _prev_charge_state text;
    _ac_power numeric := NULL;
    _dc_power numeric := NULL;
    _ac_energy numeric := NULL;
    _dc_energy numeric := NULL;
    _charge_power numeric := 0;
    _charge_energy_added numeric := NULL;
    _fast_charger_present boolean := false;
    _fast_charger_type text := NULL;
    _located_at_home boolean := false;
    _is_charge_active boolean := false;
    _session_id uuid;
    _lat numeric;
    _lon numeric;
    _batt numeric;
    _speed numeric := NULL;
    _heading numeric := NULL;
    _home_lat numeric;
    _home_lon numeric;
    _outside_temp numeric := NULL;
    _charging_type text := 'other';
BEGIN
    _vin := NEW.vin;
    _event_time := COALESCE(NEW.timestamp, NEW.created_at, NOW());
    _data := NEW.payload->'data';

    IF _data IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id
    INTO _vehicle_uuid
    FROM public.vehicles
    WHERE vin = REPLACE(_vin, 'vehicle_device.', '')
    LIMIT 1;

    INSERT INTO public.vehicle_status (vin, updated_at)
    VALUES (_vin, _event_time)
    ON CONFLICT (vin) DO UPDATE
    SET updated_at = EXCLUDED.updated_at;

    SELECT
        charge_state,
        current_charging_session_id,
        lat,
        lon,
        battery_level,
        home_latitude,
        home_longitude
    INTO
        _prev_charge_state,
        _session_id,
        _lat,
        _lon,
        _batt,
        _home_lat,
        _home_lon
    FROM public.vehicle_status
    WHERE vin = _vin;

    IF _home_lat IS NULL OR _home_lon IS NULL THEN
        SELECT user_settings.home_latitude, user_settings.home_longitude
        INTO _home_lat, _home_lon
        FROM public.vehicles
        LEFT JOIN public.user_settings
            ON public.user_settings.user_id = public.vehicles.user_id
        WHERE public.vehicles.id = _vehicle_uuid
        LIMIT 1;
    END IF;

    FOR _val IN SELECT * FROM jsonb_array_elements(_data)
    LOOP
        _key := _val->>'key';
        _value_obj := _val->'value';

        CASE _key
            WHEN 'BatteryLevel' THEN
                _batt := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );
                UPDATE public.vehicle_status
                SET battery_level = _batt
                WHERE vin = _vin;

            WHEN 'Odometer' THEN
                UPDATE public.vehicle_status
                SET odometer = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'VehicleSpeed' THEN
                _speed := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );
                UPDATE public.vehicle_status
                SET speed = _speed
                WHERE vin = _vin;

            WHEN 'InsideTemp' THEN
                UPDATE public.vehicle_status
                SET inside_temp = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'OutsideTemp' THEN
                _outside_temp := (_value_obj->>'doubleValue')::numeric;
                UPDATE public.vehicle_status
                SET outside_temp = _outside_temp
                WHERE vin = _vin;

            WHEN 'ACChargingPower' THEN
                _ac_power := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'DCChargingPower' THEN
                _dc_power := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'ACChargingEnergyIn' THEN
                _ac_energy := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'DCChargingEnergyIn' THEN
                _dc_energy := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );

            WHEN 'DetailedChargeState' THEN
                _charge_state := COALESCE(
                    _value_obj->>'detailedChargeStateValue',
                    _value_obj->>'stringValue'
                );
                IF _charge_state LIKE 'DetailedChargeState%' THEN
                    _charge_state := REPLACE(_charge_state, 'DetailedChargeState', '');
                END IF;

            WHEN 'ChargeState' THEN
                IF _charge_state IS NULL THEN
                    _charge_state := _value_obj->>'stringValue';
                END IF;

            WHEN 'FastChargerPresent' THEN
                _fast_charger_present := COALESCE(
                    (_value_obj->>'booleanValue')::boolean,
                    (_value_obj->>'boolean_value')::boolean,
                    false
                );

            WHEN 'FastChargerType' THEN
                _fast_charger_type := COALESCE(
                    _value_obj->>'fastChargerValue',
                    _value_obj->>'stringValue'
                );

            WHEN 'LocatedAtHome' THEN
                _located_at_home := COALESCE(
                    (_value_obj->>'booleanValue')::boolean,
                    (_value_obj->>'boolean_value')::boolean,
                    false
                );

            WHEN 'EstBatteryRange' THEN
                UPDATE public.vehicle_status
                SET est_battery_range = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'RatedRange' THEN
                UPDATE public.vehicle_status
                SET rated_range = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureFl' THEN
                UPDATE public.vehicle_status
                SET tpms_fl = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureFr' THEN
                UPDATE public.vehicle_status
                SET tpms_fr = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureRl' THEN
                UPDATE public.vehicle_status
                SET tpms_rl = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'TpmsPressureRr' THEN
                UPDATE public.vehicle_status
                SET tpms_rr = (_value_obj->>'doubleValue')::numeric
                WHERE vin = _vin;

            WHEN 'Locked' THEN
                UPDATE public.vehicle_status
                SET is_locked = (_value_obj->>'booleanValue')::boolean
                WHERE vin = _vin;

            WHEN 'SentryMode' THEN
                _sentry_state := _value_obj->>'sentryModeStateValue';
                UPDATE public.vehicle_status
                SET sentry_mode = (_sentry_state != 'SentryModeStateOff')
                WHERE vin = _vin;

            WHEN 'Version' THEN
                UPDATE public.vehicle_status
                SET car_version = _value_obj->>'stringValue'
                WHERE vin = _vin;

            WHEN 'Location' THEN
                _lat := (_value_obj->'locationValue'->>'latitude')::numeric;
                _lon := (_value_obj->'locationValue'->>'longitude')::numeric;
                UPDATE public.vehicle_status
                SET lat = _lat, lon = _lon
                WHERE vin = _vin;

            WHEN 'Gear' THEN
                _gear := _value_obj->>'shiftStateValue';
                IF _gear IS NOT NULL AND _value_obj->>'invalid' IS NULL THEN
                    _gear := REPLACE(REPLACE(REPLACE(REPLACE(_gear, 'ShiftStateD', 'D'), 'ShiftStateR', 'R'), 'ShiftStateP', 'P'), 'ShiftStateN', 'N');
                    UPDATE public.vehicle_status
                    SET shift_state = _gear
                    WHERE vin = _vin;
                END IF;

            WHEN 'Heading' THEN
                _heading := COALESCE(
                    (_value_obj->>'doubleValue')::numeric,
                    (_value_obj->>'intValue')::numeric
                );
                UPDATE public.vehicle_status
                SET heading = _heading
                WHERE vin = _vin;

            WHEN 'DoorState' THEN
                UPDATE public.vehicle_status
                SET
                    door_df = COALESCE((_value_obj->'doorValue'->>'DriverFront')::boolean, false),
                    door_dr = COALESCE((_value_obj->'doorValue'->>'DriverRear')::boolean, false),
                    door_pf = COALESCE((_value_obj->'doorValue'->>'PassengerFront')::boolean, false),
                    door_pr = COALESCE((_value_obj->'doorValue'->>'PassengerRear')::boolean, false),
                    trunk_ft = COALESCE((_value_obj->'doorValue'->>'TrunkFront')::boolean, false),
                    trunk_rt = COALESCE((_value_obj->'doorValue'->>'TrunkRear')::boolean, false)
                WHERE vin = _vin;

            WHEN 'FdWindow' THEN
                UPDATE public.vehicle_status
                SET window_fd = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            WHEN 'FpWindow' THEN
                UPDATE public.vehicle_status
                SET window_fp = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            WHEN 'RdWindow' THEN
                UPDATE public.vehicle_status
                SET window_rd = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            WHEN 'RpWindow' THEN
                UPDATE public.vehicle_status
                SET window_rp = _value_obj->>'windowStateValue'
                WHERE vin = _vin;

            ELSE NULL;
        END CASE;
    END LOOP;

    _charge_power := COALESCE(_ac_power, 0) + COALESCE(_dc_power, 0);
    IF _ac_energy IS NOT NULL OR _dc_energy IS NOT NULL THEN
        _charge_energy_added := COALESCE(_dc_energy, _ac_energy);
    END IF;

    UPDATE public.vehicle_status
    SET
        charger_power = NULLIF(_charge_power, 0),
        charge_energy_added = _charge_energy_added,
        charge_state = COALESCE(_charge_state, _prev_charge_state)
    WHERE vin = _vin;

    IF _outside_temp IS NULL THEN
        SELECT outside_temp
        INTO _outside_temp
        FROM public.vehicle_status
        WHERE vin = _vin;
    END IF;

    IF _gear IS NOT NULL THEN
        DECLARE
            _trip uuid;
            _odo numeric;
            _current_speed numeric;
            _current_heading numeric;
        BEGIN
            SELECT current_trip_id, odometer, speed, heading
            INTO _trip, _odo, _current_speed, _current_heading
            FROM public.vehicle_status
            WHERE vin = _vin;

            IF (_gear IN ('D', 'R')) AND _trip IS NULL AND _vehicle_uuid IS NOT NULL THEN
                INSERT INTO public.trips (
                    vin,
                    vehicle_id,
                    start_time,
                    start_odometer,
                    start_latitude,
                    start_longitude,
                    start_battery_pct,
                    min_outside_temp,
                    max_outside_temp,
                    avg_outside_temp
                )
                VALUES (
                    _vin,
                    _vehicle_uuid,
                    _event_time,
                    _odo,
                    _lat,
                    _lon,
                    _batt,
                    _outside_temp,
                    _outside_temp,
                    _outside_temp
                )
                RETURNING id INTO _trip;

                UPDATE public.vehicle_status
                SET current_trip_id = _trip
                WHERE vin = _vin;
            END IF;

            IF _gear = 'P' AND _trip IS NOT NULL THEN
                IF _lat IS NOT NULL AND _lon IS NOT NULL THEN
                    INSERT INTO public.trip_waypoints (
                        trip_id,
                        timestamp,
                        latitude,
                        longitude,
                        speed_mph,
                        battery_level,
                        odometer,
                        heading
                    )
                    VALUES (
                        _trip,
                        _event_time,
                        _lat,
                        _lon,
                        _current_speed,
                        ROUND(_batt)::integer,
                        _odo,
                        CASE
                            WHEN _current_heading IS NULL THEN NULL
                            ELSE ROUND(_current_heading)::integer
                        END
                    )
                    ON CONFLICT (trip_id, timestamp) DO UPDATE
                    SET
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        speed_mph = COALESCE(EXCLUDED.speed_mph, trip_waypoints.speed_mph),
                        battery_level = COALESCE(EXCLUDED.battery_level, trip_waypoints.battery_level),
                        odometer = COALESCE(EXCLUDED.odometer, trip_waypoints.odometer),
                        heading = COALESCE(EXCLUDED.heading, trip_waypoints.heading);
                END IF;

                UPDATE public.trips
                SET
                    end_time = _event_time,
                    end_odometer = _odo,
                    end_latitude = _lat,
                    end_longitude = _lon,
                    end_battery_pct = _batt,
                    is_complete = true
                WHERE id = _trip;

                UPDATE public.vehicle_status
                SET current_trip_id = NULL
                WHERE vin = _vin;
            END IF;
        END;
    END IF;

    IF _lat IS NOT NULL AND _lon IS NOT NULL THEN
        DECLARE
            _active_trip uuid;
            _active_odo numeric;
            _active_speed numeric;
            _active_heading numeric;
        BEGIN
            SELECT current_trip_id, odometer, speed, heading
            INTO _active_trip, _active_odo, _active_speed, _active_heading
            FROM public.vehicle_status
            WHERE vin = _vin;

            IF _active_trip IS NOT NULL THEN
                INSERT INTO public.trip_waypoints (
                    trip_id,
                    timestamp,
                    latitude,
                    longitude,
                    speed_mph,
                    battery_level,
                    odometer,
                    heading
                )
                VALUES (
                    _active_trip,
                    _event_time,
                    _lat,
                    _lon,
                    _active_speed,
                    ROUND(_batt)::integer,
                    _active_odo,
                    CASE
                        WHEN _active_heading IS NULL THEN NULL
                        ELSE ROUND(_active_heading)::integer
                    END
                )
                ON CONFLICT (trip_id, timestamp) DO UPDATE
                SET
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    speed_mph = COALESCE(EXCLUDED.speed_mph, trip_waypoints.speed_mph),
                    battery_level = COALESCE(EXCLUDED.battery_level, trip_waypoints.battery_level),
                    odometer = COALESCE(EXCLUDED.odometer, trip_waypoints.odometer),
                    heading = COALESCE(EXCLUDED.heading, trip_waypoints.heading);
            END IF;
        END;
    END IF;

    IF _outside_temp IS NOT NULL THEN
        DECLARE
            _active_trip uuid;
        BEGIN
            SELECT current_trip_id
            INTO _active_trip
            FROM public.vehicle_status
            WHERE vin = _vin;

            IF _active_trip IS NOT NULL THEN
                UPDATE public.trips
                SET
                    min_outside_temp = LEAST(COALESCE(min_outside_temp, _outside_temp), _outside_temp),
                    max_outside_temp = GREATEST(COALESCE(max_outside_temp, _outside_temp), _outside_temp),
                    avg_outside_temp = (
                        LEAST(COALESCE(min_outside_temp, _outside_temp), _outside_temp) +
                        GREATEST(COALESCE(max_outside_temp, _outside_temp), _outside_temp)
                    ) / 2.0
                WHERE id = _active_trip;
            END IF;
        END;
    END IF;

    _effective_charge_state := COALESCE(_charge_state, _prev_charge_state);
    _is_charge_active := COALESCE(_effective_charge_state, '') IN ('Charging', 'Starting');

    IF _fast_charger_present OR _charge_power > 24 THEN
        IF _fast_charger_type = 'FastChargerSupercharger' THEN
            _charging_type := 'supercharger';
        ELSIF _fast_charger_type IS NOT NULL AND _fast_charger_type <> 'FastChargerUnknown' THEN
            _charging_type := '3rd_party_fast';
        ELSE
            _charging_type := 'supercharger';
        END IF;
    ELSIF _located_at_home OR (
        _home_lat IS NOT NULL
        AND _home_lon IS NOT NULL
        AND _lat IS NOT NULL
        AND _lon IS NOT NULL
        AND ABS(_lat - _home_lat) < 0.001
        AND ABS(_lon - _home_lon) < 0.001
    ) THEN
        _charging_type := 'home';
    ELSIF _charge_power > 0 THEN
        _charging_type := 'destination';
    END IF;

    IF _is_charge_active AND _session_id IS NULL AND _vehicle_uuid IS NOT NULL THEN
        INSERT INTO public.charging_sessions (
            vehicle_id,
            start_time,
            start_battery_pct,
            energy_added_kwh,
            charge_rate_kw,
            latitude,
            longitude,
            charger_type,
            is_complete
        )
        VALUES (
            _vehicle_uuid,
            _event_time,
            _batt,
            _charge_energy_added,
            NULLIF(_charge_power, 0),
            _lat,
            _lon,
            _charging_type,
            false
        )
        RETURNING id INTO _session_id;

        UPDATE public.vehicle_status
        SET current_charging_session_id = _session_id
        WHERE vin = _vin;
    ELSIF _session_id IS NOT NULL AND _is_charge_active THEN
        UPDATE public.charging_sessions
        SET
            latitude = COALESCE(public.charging_sessions.latitude, _lat),
            longitude = COALESCE(public.charging_sessions.longitude, _lon),
            energy_added_kwh = GREATEST(COALESCE(public.charging_sessions.energy_added_kwh, 0), COALESCE(_charge_energy_added, 0)),
            charge_rate_kw = GREATEST(COALESCE(public.charging_sessions.charge_rate_kw, 0), _charge_power),
            charger_type = CASE
                WHEN public.charging_sessions.charger_type IS NULL OR public.charging_sessions.charger_type = 'other'
                    THEN _charging_type
                ELSE public.charging_sessions.charger_type
            END
        WHERE id = _session_id;
    ELSIF _session_id IS NOT NULL AND _charge_state IS NOT NULL AND NOT _is_charge_active THEN
        UPDATE public.charging_sessions
        SET
            end_time = _event_time,
            end_battery_pct = _batt,
            energy_added_kwh = GREATEST(COALESCE(public.charging_sessions.energy_added_kwh, 0), COALESCE(_charge_energy_added, 0)),
            charge_rate_kw = GREATEST(COALESCE(public.charging_sessions.charge_rate_kw, 0), _charge_power),
            latitude = COALESCE(public.charging_sessions.latitude, _lat),
            longitude = COALESCE(public.charging_sessions.longitude, _lon),
            charger_type = CASE
                WHEN public.charging_sessions.charger_type IS NULL OR public.charging_sessions.charger_type = 'other'
                    THEN _charging_type
                ELSE public.charging_sessions.charger_type
            END,
            is_complete = true
        WHERE id = _session_id;

        UPDATE public.vehicle_status
        SET current_charging_session_id = NULL
        WHERE vin = _vin;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."reconcile_stale_charging_sessions"("p_stale_after" interval DEFAULT '00:15:00'::interval) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    _closed_count integer := 0;
BEGIN
    WITH stale AS (
        SELECT
            cs.id,
            vs.vin,
            GREATEST(COALESCE(vs.updated_at, cs.start_time), cs.start_time) AS end_time,
            COALESCE(vs.battery_level, cs.end_battery_pct, cs.start_battery_pct) AS end_battery_pct,
            GREATEST(COALESCE(cs.energy_added_kwh, 0), COALESCE(vs.charge_energy_added, 0)) AS energy_added_kwh,
            GREATEST(COALESCE(cs.charge_rate_kw, 0), COALESCE(vs.charger_power, 0)) AS charge_rate_kw,
            COALESCE(cs.latitude, vs.lat) AS latitude,
            COALESCE(cs.longitude, vs.lon) AS longitude
        FROM public.charging_sessions cs
        JOIN public.vehicle_status vs
          ON vs.current_charging_session_id = cs.id
        WHERE cs.is_complete = false
          AND (
              COALESCE(vs.charge_state, '') NOT IN ('Charging', 'Starting')
              OR vs.updated_at <= NOW() - p_stale_after
          )
    ), updated AS (
        UPDATE public.charging_sessions cs
        SET
            end_time = stale.end_time,
            end_battery_pct = stale.end_battery_pct,
            energy_added_kwh = stale.energy_added_kwh,
            charge_rate_kw = stale.charge_rate_kw,
            latitude = stale.latitude,
            longitude = stale.longitude,
            is_complete = true
        FROM stale
        WHERE cs.id = stale.id
        RETURNING stale.vin
    )
    UPDATE public.vehicle_status vs
    SET current_charging_session_id = NULL
    FROM updated
    WHERE vs.vin = updated.vin;

    GET DIAGNOSTICS _closed_count = ROW_COUNT;
    RETURN _closed_count;
END;
$$;

COMMENT ON FUNCTION "public"."reconcile_stale_charging_sessions"("p_stale_after" interval) IS 'Closes open charging_sessions when telemetry indicates charging stopped or the latest vehicle_status becomes stale.';

CREATE OR REPLACE FUNCTION "public"."sync_trip_speed_metrics_on_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NEW.is_complete IS TRUE
       AND (
           COALESCE(OLD.is_complete, false) IS DISTINCT FROM true
           OR OLD.end_time IS DISTINCT FROM NEW.end_time
       ) THEN
        SELECT metrics.max_speed_mph, metrics.avg_speed_mph
        INTO NEW.max_speed_mph, NEW.avg_speed_mph
        FROM public.get_trip_speed_metrics(NEW.id) AS metrics;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sync_vehicle_charge_limit_from_telemetry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    _entry jsonb;
    _value_obj jsonb;
    _charge_limit_soc integer;
BEGIN
    IF NEW.payload->'data' IS NULL THEN
        RETURN NEW;
    END IF;

    FOR _entry IN SELECT * FROM jsonb_array_elements(NEW.payload->'data')
    LOOP
        IF _entry->>'key' = 'ChargeLimitSoc' THEN
            _value_obj := _entry->'value';
            _charge_limit_soc := COALESCE(
                (_value_obj->>'intValue')::numeric,
                (_value_obj->>'doubleValue')::numeric,
                NULLIF(_value_obj->>'stringValue', '')::numeric
            )::integer;

            UPDATE public.vehicle_status
            SET charge_limit_soc = _charge_limit_soc
            WHERE vin = NEW.vin;

            EXIT;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sync_vehicle_state_from_telemetry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    _charge_state text;
    _shift_state text;
    _speed numeric;
    _state text;
BEGIN
    SELECT charge_state, shift_state, speed
    INTO _charge_state, _shift_state, _speed
    FROM public.vehicle_status
    WHERE vin = NEW.vin;

    _state := CASE
        WHEN _shift_state IN ('D', 'R') OR COALESCE(_speed, 0) > 0 THEN 'driving'
        WHEN _charge_state IN ('Charging', 'Starting') THEN 'charging'
        ELSE 'parked'
    END;

    UPDATE public.vehicle_status
    SET state = _state
    WHERE vin = NEW.vin;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "charging_complete_notification" AFTER UPDATE ON "public"."charging_sessions" FOR EACH ROW WHEN ((("new"."is_complete" = true) AND (COALESCE("old"."is_complete", false) = false))) EXECUTE FUNCTION "public"."create_charging_complete_notification"();

CREATE OR REPLACE TRIGGER "enqueue_supercharger_tesla_sync_job" AFTER INSERT OR UPDATE OF "is_complete", "charger_type", "tesla_charge_event_id" ON "public"."charging_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_supercharger_tesla_sync_job"();

CREATE OR REPLACE TRIGGER "trigger_process_telemetry" AFTER INSERT ON "public"."telemetry_raw" FOR EACH ROW EXECUTE FUNCTION "public"."process_telemetry"();

CREATE OR REPLACE TRIGGER "trigger_sync_trip_speed_metrics_on_completion" BEFORE UPDATE ON "public"."trips" FOR EACH ROW WHEN (("new"."is_complete" IS TRUE)) EXECUTE FUNCTION "public"."sync_trip_speed_metrics_on_completion"();

CREATE OR REPLACE TRIGGER "trigger_sync_vehicle_charge_limit_from_telemetry" AFTER INSERT ON "public"."telemetry_raw" FOR EACH ROW EXECUTE FUNCTION "public"."sync_vehicle_charge_limit_from_telemetry"();

CREATE OR REPLACE TRIGGER "trigger_sync_vehicle_state_from_telemetry" AFTER INSERT ON "public"."telemetry_raw" FOR EACH ROW EXECUTE FUNCTION "public"."sync_vehicle_state_from_telemetry"();

CREATE OR REPLACE TRIGGER "update_charging_session_tesla_sync_jobs_updated_at" BEFORE UPDATE ON "public"."charging_session_tesla_sync_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_maintenance_records_updated_at" BEFORE UPDATE ON "public"."maintenance_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_tyre_sets_updated_at" BEFORE UPDATE ON "public"."tyre_sets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE POLICY "Service role can manage charging sync jobs" ON "public"."charging_session_tesla_sync_jobs" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage maintenance records" ON "public"."maintenance_records" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage notifications" ON "public"."notifications" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage telemetry raw" ON "public"."telemetry_raw" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage tesla sessions" ON "public"."tesla_sessions" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage trips" ON "public"."trips" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage tyre sets" ON "public"."tyre_sets" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage vehicle status" ON "public"."vehicle_status" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete own vehicles" ON "public"."vehicles" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "Users can insert own settings" ON "public"."user_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert own vehicles" ON "public"."vehicles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can manage own charging sessions" ON "public"."charging_sessions" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE (("vehicles"."id" = "charging_sessions"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can manage own maintenance records" ON "public"."maintenance_records" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can manage own trips" ON "public"."trips" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE (("vehicles"."id" = "trips"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE (("vehicles"."id" = "trips"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can manage own tyre sets" ON "public"."tyre_sets" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can manage own waypoints" ON "public"."trip_waypoints" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."trips"
     JOIN "public"."vehicles" ON ((("vehicles"."id" = "trips"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"()))))
  WHERE ("trips"."id" = "trip_waypoints"."trip_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trips"
     JOIN "public"."vehicles" ON ((("vehicles"."id" = "trips"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"()))))
  WHERE ("trips"."id" = "trip_waypoints"."trip_id"))));

CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE (("vehicles"."id" = "notifications"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE (("vehicles"."id" = "notifications"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));

CREATE POLICY "Users can update own settings" ON "public"."user_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update own vehicles" ON "public"."vehicles" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view own charging sessions" ON "public"."charging_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE (("vehicles"."id" = "charging_sessions"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles" "vehicles"
  WHERE (("vehicles"."id" = "notifications"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));

CREATE POLICY "Users can view own settings" ON "public"."user_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view own trips" ON "public"."trips" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles" "vehicles"
  WHERE (("vehicles"."id" = "trips"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view own vehicle status" ON "public"."vehicle_status" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles" "vehicles"
  WHERE (("vehicles"."user_id" = "auth"."uid"()) AND ("vehicles"."vin" = "replace"("vehicle_status"."vin", 'vehicle_device.'::"text", ''::"text"))))));

CREATE POLICY "Users can view own vehicles" ON "public"."vehicles" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view own waypoints" ON "public"."trip_waypoints" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."trips"
     JOIN "public"."vehicles" ON ((("vehicles"."id" = "trips"."vehicle_id") AND ("vehicles"."user_id" = "auth"."uid"()))))
  WHERE ("trips"."id" = "trip_waypoints"."trip_id"))));

ALTER TABLE "public"."charging_session_tesla_sync_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."charging_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."maintenance_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."telemetry_raw" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tesla_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."trip_waypoints" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tyre_sets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."vehicle_status" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."backfill_trip_waypoints"() TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_trip_waypoints"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_trip_waypoints"() TO "service_role";

GRANT ALL ON TABLE "public"."charging_session_tesla_sync_jobs" TO "anon";
GRANT ALL ON TABLE "public"."charging_session_tesla_sync_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."charging_session_tesla_sync_jobs" TO "service_role";

GRANT ALL ON FUNCTION "public"."claim_pending_tesla_charging_sync_jobs"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_pending_tesla_charging_sync_jobs"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_pending_tesla_charging_sync_jobs"("p_limit" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."create_charging_complete_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_charging_complete_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_charging_complete_notification"() TO "service_role";

GRANT ALL ON FUNCTION "public"."enqueue_supercharger_tesla_sync_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_supercharger_tesla_sync_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_supercharger_tesla_sync_job"() TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_daily_trip_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_daily_trip_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_daily_trip_summary"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_charging_analytics_daily"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_charging_analytics_daily"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_charging_analytics_daily"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_charging_analytics_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_charging_analytics_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_charging_analytics_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_charging_list_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_vehicle_id" "uuid", "p_preferred_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_charging_list_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_vehicle_id" "uuid", "p_preferred_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_charging_list_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_vehicle_id" "uuid", "p_preferred_currency" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_maintenance_summary"("p_from_date" "date", "p_to_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_maintenance_summary"("p_from_date" "date", "p_to_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_maintenance_summary"("p_from_date" "date", "p_to_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_trip_list_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_vehicle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_trip_list_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_vehicle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trip_list_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_vehicle_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_trip_speed_metrics"("p_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_trip_speed_metrics"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trip_speed_metrics"("p_trip_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."process_telemetry"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_telemetry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_telemetry"() TO "service_role";

GRANT ALL ON FUNCTION "public"."reconcile_stale_charging_sessions"("p_stale_after" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_stale_charging_sessions"("p_stale_after" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_stale_charging_sessions"("p_stale_after" interval) TO "service_role";

GRANT ALL ON FUNCTION "public"."sync_trip_speed_metrics_on_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_trip_speed_metrics_on_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_trip_speed_metrics_on_completion"() TO "service_role";

GRANT ALL ON FUNCTION "public"."sync_vehicle_charge_limit_from_telemetry"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_vehicle_charge_limit_from_telemetry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_vehicle_charge_limit_from_telemetry"() TO "service_role";

GRANT ALL ON FUNCTION "public"."sync_vehicle_state_from_telemetry"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_vehicle_state_from_telemetry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_vehicle_state_from_telemetry"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT ALL ON TABLE "public"."charging_sessions" TO "anon";
GRANT ALL ON TABLE "public"."charging_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."charging_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."maintenance_records" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_records" TO "service_role";

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON TABLE "public"."telemetry_raw" TO "anon";
GRANT ALL ON TABLE "public"."telemetry_raw" TO "authenticated";
GRANT ALL ON TABLE "public"."telemetry_raw" TO "service_role";

GRANT ALL ON TABLE "public"."tesla_sessions" TO "anon";
GRANT ALL ON TABLE "public"."tesla_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."tesla_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."trip_waypoints" TO "anon";
GRANT ALL ON TABLE "public"."trip_waypoints" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_waypoints" TO "service_role";

GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";

GRANT ALL ON TABLE "public"."tyre_sets" TO "anon";
GRANT ALL ON TABLE "public"."tyre_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."tyre_sets" TO "service_role";

GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";

GRANT ALL ON TABLE "public"."vehicle_status" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_status" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_status" TO "service_role";

GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Keep auth bootstrap behavior that lives outside the public schema dump.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
