create or replace function public.get_trip_list_summary(
    p_from timestamp with time zone default null,
    p_to timestamp with time zone default null,
    p_vehicle_id text default null
)
returns table (
    total_trips bigint,
    total_distance numeric,
    total_energy numeric,
    avg_efficiency numeric
)
language sql
security definer
set search_path = public
as $$
with filtered_trips as (
    select
        greatest(
            coalesce(
                distance_miles,
                case
                    when start_odometer is not null and end_odometer is not null
                        then end_odometer - start_odometer
                    else null
                end,
                0
            ),
            0
        ) as distance_miles,
        case
            when energy_used_kwh is not null then energy_used_kwh
            when start_battery_pct is not null
                and end_battery_pct is not null
                and start_battery_pct > end_battery_pct
                then ((start_battery_pct - end_battery_pct) / 100.0) * 75
            else 0
        end as energy_kwh
    from public.trips
    where (p_from is null or start_time >= p_from)
      and (p_to is null or start_time <= p_to)
      and (p_vehicle_id is null or vehicle_id = p_vehicle_id)
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

grant execute on function public.get_trip_list_summary(timestamp with time zone, timestamp with time zone, text) to authenticated, service_role;

create or replace function public.get_charging_list_summary(
    p_from timestamp with time zone default null,
    p_to timestamp with time zone default null,
    p_vehicle_id uuid default null,
    p_preferred_currency text default null
)
returns table (
    total_sessions bigint,
    total_battery_energy numeric,
    total_delivered_energy numeric,
    max_charge_rate numeric,
    total_cost numeric
)
language sql
security definer
set search_path = public
as $$
with filtered_sessions as (
    select
        energy_added_kwh,
        energy_delivered_kwh,
        charge_rate_kw,
        currency,
        case
            when lower(coalesce(charger_type, '')) like '%supercharger%'
                then case
                    when cost_estimate is not null then cost_estimate
                    else cost_user_entered
                end
            else coalesce(cost_user_entered, cost_estimate)
        end as display_cost
    from public.charging_sessions
    where (p_from is null or start_time >= p_from)
      and (p_to is null or start_time <= p_to)
      and (p_vehicle_id is null or vehicle_id = p_vehicle_id)
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

grant execute on function public.get_charging_list_summary(timestamp with time zone, timestamp with time zone, uuid, text) to authenticated, service_role;
