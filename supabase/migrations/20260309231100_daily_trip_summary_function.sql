-- Function to generate daily trip summary notifications
-- Run via pg_cron: SELECT cron.schedule('daily-trip-summary', '0 6 * * *', 'SELECT generate_daily_trip_summary()');
-- Requires pg_cron extension enabled in Supabase Dashboard → Database → Extensions

create or replace function generate_daily_trip_summary()
returns void
language plpgsql
as $$
declare
    v_record record;
    v_trip_count integer;
    v_total_distance double precision;
    v_total_energy double precision;
    v_avg_efficiency double precision;
    v_message text;
    v_yesterday_start timestamptz;
    v_yesterday_end timestamptz;
begin
    -- Calculate yesterday's time range (UTC)
    v_yesterday_start := (current_date - interval '1 day')::timestamptz;
    v_yesterday_end := current_date::timestamptz;

    -- Loop through each vehicle that had trips yesterday
    for v_record in
        select
            vehicle_id,
            count(*) as trip_count,
            coalesce(sum(distance_miles), 0) as total_distance,
            coalesce(sum(energy_used_kwh), 0) as total_energy
        from trips
        where start_time >= v_yesterday_start
          and start_time < v_yesterday_end
          and status = 'completed'
        group by vehicle_id
    loop
        v_trip_count := v_record.trip_count;
        v_total_distance := round(v_record.total_distance::numeric, 1);
        v_total_energy := round(v_record.total_energy::numeric, 1);

        -- Calculate efficiency (Wh/mi)
        if v_total_distance > 0 then
            v_avg_efficiency := round(((v_total_energy * 1000) / v_total_distance)::numeric, 0);
        else
            v_avg_efficiency := 0;
        end if;

        v_message := format(
            '%s trip%s yesterday: %s mi, %s kWh used, %s Wh/mi avg',
            v_trip_count,
            case when v_trip_count = 1 then '' else 's' end,
            v_total_distance,
            v_total_energy,
            v_avg_efficiency
        );

        insert into notifications (vehicle_id, type, title, message, data)
        values (
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
    end loop;
end;
$$;
