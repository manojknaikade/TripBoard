ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CHF';

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'DD/MM';

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS home_latitude double precision;

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS home_longitude double precision;

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS home_address text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_settings_date_format_check'
          AND conrelid = 'public.user_settings'::regclass
    ) THEN
        ALTER TABLE public.user_settings
            ADD CONSTRAINT user_settings_date_format_check
            CHECK (date_format IN ('DD/MM', 'MM/DD'));
    END IF;
END;
$$;

INSERT INTO public.user_settings (
    user_id,
    polling_driving,
    polling_charging,
    polling_parked,
    polling_sleeping,
    region,
    units,
    notifications_enabled,
    data_source,
    map_style,
    currency,
    date_format,
    home_latitude,
    home_longitude,
    home_address
)
SELECT
    profiles.id,
    app_settings.polling_driving,
    app_settings.polling_charging,
    app_settings.polling_parked,
    app_settings.polling_sleeping,
    app_settings.region,
    app_settings.units,
    app_settings.notifications_enabled,
    app_settings.data_source,
    app_settings.map_style,
    app_settings.currency,
    app_settings.date_format,
    app_settings.home_latitude,
    app_settings.home_longitude,
    app_settings.home_address
FROM public.profiles
CROSS JOIN public.app_settings
ON CONFLICT (user_id) DO UPDATE
SET
    currency = COALESCE(public.user_settings.currency, EXCLUDED.currency),
    date_format = COALESCE(public.user_settings.date_format, EXCLUDED.date_format),
    home_latitude = COALESCE(public.user_settings.home_latitude, EXCLUDED.home_latitude),
    home_longitude = COALESCE(public.user_settings.home_longitude, EXCLUDED.home_longitude),
    home_address = COALESCE(public.user_settings.home_address, EXCLUDED.home_address);

ALTER TABLE public.tyre_sets
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.maintenance_records
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tyre_sets_user_id_created_at
    ON public.tyre_sets (user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_records_user_id_start_date
    ON public.maintenance_records (user_id, start_date DESC)
    WHERE user_id IS NOT NULL;

DO $$
DECLARE
    _only_user_id uuid;
    _vehicle_user_count integer := 0;
    _profile_count integer := 0;
BEGIN
    UPDATE public.maintenance_records maintenance_record
    SET user_id = tyre_set.user_id
    FROM public.tyre_sets tyre_set
    WHERE maintenance_record.tyre_set_id = tyre_set.id
      AND maintenance_record.user_id IS NULL
      AND tyre_set.user_id IS NOT NULL;

    SELECT COUNT(DISTINCT user_id)
    INTO _vehicle_user_count
    FROM public.vehicles
    WHERE user_id IS NOT NULL;

    SELECT COUNT(*)
    INTO _profile_count
    FROM public.profiles;

    IF _vehicle_user_count = 1 THEN
        SELECT user_id
        INTO _only_user_id
        FROM public.vehicles
        WHERE user_id IS NOT NULL
        LIMIT 1;
    ELSIF _profile_count = 1 THEN
        SELECT id
        INTO _only_user_id
        FROM public.profiles
        LIMIT 1;
    END IF;

    IF _only_user_id IS NOT NULL THEN
        UPDATE public.tyre_sets
        SET user_id = _only_user_id
        WHERE user_id IS NULL;

        UPDATE public.maintenance_records
        SET user_id = _only_user_id
        WHERE user_id IS NULL;
    END IF;
END;
$$;

DROP POLICY IF EXISTS "Users can manage own trips" ON public.trips;
CREATE POLICY "Users can manage own trips"
    ON public.trips
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.vehicles
            WHERE public.vehicles.user_id = auth.uid()
              AND (
                  public.vehicles.vin = replace(public.trips.vin, 'vehicle_device.', '')
                  OR public.vehicles.vin = public.trips.vehicle_id
                  OR public.vehicles.tesla_id = public.trips.vehicle_id
                  OR public.vehicles.id::text = public.trips.vehicle_id
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.vehicles
            WHERE public.vehicles.user_id = auth.uid()
              AND (
                  public.vehicles.vin = replace(public.trips.vin, 'vehicle_device.', '')
                  OR public.vehicles.vin = public.trips.vehicle_id
                  OR public.vehicles.tesla_id = public.trips.vehicle_id
                  OR public.vehicles.id::text = public.trips.vehicle_id
              )
        )
    );

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.vehicles
            WHERE public.vehicles.id = public.notifications.vehicle_id
              AND public.vehicles.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.vehicles
            WHERE public.vehicles.id = public.notifications.vehicle_id
              AND public.vehicles.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage own tyre sets" ON public.tyre_sets;
CREATE POLICY "Users can manage own tyre sets"
    ON public.tyre_sets
    FOR ALL
    TO authenticated
    USING (public.tyre_sets.user_id = auth.uid())
    WITH CHECK (public.tyre_sets.user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own maintenance records" ON public.maintenance_records;
CREATE POLICY "Users can manage own maintenance records"
    ON public.maintenance_records
    FOR ALL
    TO authenticated
    USING (public.maintenance_records.user_id = auth.uid())
    WITH CHECK (public.maintenance_records.user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_charging_analytics_daily(
    p_from timestamp with time zone,
    p_to timestamp with time zone
)
RETURNS TABLE (
    day date,
    battery_energy numeric,
    delivered_energy numeric,
    loss_energy numeric,
    cost numeric,
    sessions bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.get_charging_analytics_summary(
    p_from timestamp with time zone,
    p_to timestamp with time zone
)
RETURNS TABLE (
    total_sessions bigint,
    total_battery_energy numeric,
    total_delivered_energy numeric,
    total_loss_energy numeric,
    total_loss_cost numeric,
    total_cost numeric,
    home_energy numeric,
    supercharger_energy numeric,
    third_party_fast_energy numeric,
    destination_energy numeric,
    other_energy numeric,
    home_cost numeric,
    supercharger_cost numeric,
    third_party_fast_cost numeric,
    destination_cost numeric,
    other_cost numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.get_charging_list_summary(
    p_from timestamp with time zone DEFAULT NULL,
    p_to timestamp with time zone DEFAULT NULL,
    p_vehicle_id uuid DEFAULT NULL,
    p_preferred_currency text DEFAULT NULL
)
RETURNS TABLE (
    total_sessions bigint,
    total_battery_energy numeric,
    total_delivered_energy numeric,
    max_charge_rate numeric,
    total_cost numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.get_maintenance_summary(
    p_from_date date DEFAULT NULL,
    p_to_date date DEFAULT NULL
)
RETURNS TABLE (
    total_records bigint,
    tyre_records bigint,
    other_records bigint,
    latest_logged_odometer_km integer,
    paid_records bigint,
    total_spend numeric,
    average_paid_cost numeric,
    spend_currency text,
    mixed_currencies boolean,
    season_changes bigint,
    rotations bigint,
    tyre_work_records bigint,
    active_tyre_sets bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.get_trip_list_summary(
    p_from timestamp with time zone DEFAULT NULL,
    p_to timestamp with time zone DEFAULT NULL,
    p_vehicle_id text DEFAULT NULL
)
RETURNS TABLE (
    total_trips bigint,
    total_distance numeric,
    total_energy numeric,
    avg_efficiency numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
with filtered_trips as (
    select
        greatest(
            coalesce(
                trip.distance_miles,
                case
                    when trip.start_odometer is not null and trip.end_odometer is not null
                        then trip.end_odometer - trip.start_odometer
                    else null
                end,
                0
            ),
            0
        ) as distance_miles,
        case
            when trip.energy_used_kwh is not null then trip.energy_used_kwh
            when trip.start_battery_pct is not null
                and trip.end_battery_pct is not null
                and trip.start_battery_pct > trip.end_battery_pct
                then ((trip.start_battery_pct - trip.end_battery_pct) / 100.0) * 75
            else 0
        end as energy_kwh
    from public.trips trip
    join public.vehicles vehicle
      on vehicle.user_id = auth.uid()
     and (
         vehicle.vin = replace(trip.vin, 'vehicle_device.', '')
         or vehicle.vin = trip.vehicle_id
         or vehicle.tesla_id = trip.vehicle_id
         or vehicle.id::text = trip.vehicle_id
     )
    where (p_from is null or trip.start_time >= p_from)
      and (p_to is null or trip.start_time <= p_to)
      and (p_vehicle_id is null or trip.vehicle_id = p_vehicle_id)
),
qualifying_trips as (
    select *
    from filtered_trips
    where distance_miles >= 0.3
)
select
    count(*)::bigint as total_trips,
    round(coalesce(sum(distance_miles), 0)::numeric, 3) as total_distance,
    round(coalesce(sum(energy_kwh), 0)::numeric, 3) as total_energy,
    case
        when coalesce(sum(distance_miles), 0) > 0
            then round((sum(energy_kwh) * 1000 / sum(distance_miles))::numeric, 2)
        else 0
    end as avg_efficiency
from qualifying_trips;
$$;

GRANT EXECUTE ON FUNCTION public.get_charging_analytics_daily(timestamp with time zone, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_charging_analytics_summary(timestamp with time zone, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_charging_list_summary(timestamp with time zone, timestamp with time zone, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_maintenance_summary(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_trip_list_summary(timestamp with time zone, timestamp with time zone, text) TO authenticated, service_role;
