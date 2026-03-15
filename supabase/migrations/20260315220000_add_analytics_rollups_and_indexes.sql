do $$
begin
    if to_regclass('public.trips') is null or to_regclass('public.charging_sessions') is null then
        raise notice 'Skipping analytics rollup migration because required tables do not exist yet.';
        return;
    end if;

    execute 'create index if not exists idx_trips_complete_start_time on public.trips(start_time desc) where is_complete = true';
    execute 'create index if not exists idx_charging_sessions_complete_start_time on public.charging_sessions(start_time desc) where is_complete = true';

    execute $sql$
        create or replace function public.get_charging_analytics_summary(
            p_from timestamptz,
            p_to timestamptz
        )
        returns table (
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
        language sql
        security definer
        set search_path = public
        as $function$
        with filtered as (
            select
                lower(coalesce(charger_type, 'other')) as charger_type_key,
                greatest(coalesce(energy_added_kwh, 0), 0) as battery_energy,
                greatest(coalesce(energy_delivered_kwh, energy_added_kwh, 0), 0) as delivered_energy,
                greatest(
                    coalesce(cost_user_entered, cost_estimate, coalesce(energy_delivered_kwh, energy_added_kwh, 0) * charger_price_per_kwh, 0),
                    0
                ) as total_cost
            from public.charging_sessions
            where is_complete = true
              and start_time >= p_from
              and start_time <= p_to
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
        $function$;
    $sql$;

    execute $sql$
        create or replace function public.get_charging_analytics_daily(
            p_from timestamptz,
            p_to timestamptz
        )
        returns table (
            day date,
            battery_energy numeric,
            delivered_energy numeric,
            loss_energy numeric,
            cost numeric,
            sessions bigint
        )
        language sql
        security definer
        set search_path = public
        as $function$
        with filtered as (
            select
                start_time::date as day,
                greatest(coalesce(energy_added_kwh, 0), 0) as battery_energy,
                greatest(coalesce(energy_delivered_kwh, energy_added_kwh, 0), 0) as delivered_energy,
                greatest(
                    coalesce(cost_user_entered, cost_estimate, coalesce(energy_delivered_kwh, energy_added_kwh, 0) * charger_price_per_kwh, 0),
                    0
                ) as total_cost
            from public.charging_sessions
            where is_complete = true
              and start_time >= p_from
              and start_time <= p_to
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
        $function$;
    $sql$;

    execute 'grant execute on function public.get_charging_analytics_summary(timestamptz, timestamptz) to authenticated, service_role';
    execute 'grant execute on function public.get_charging_analytics_daily(timestamptz, timestamptz) to authenticated, service_role';
end
$$;
