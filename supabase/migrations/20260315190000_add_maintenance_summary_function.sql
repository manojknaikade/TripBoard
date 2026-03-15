do $$
begin
    if to_regclass('public.maintenance_records') is null or to_regclass('public.tyre_sets') is null then
        raise notice 'Skipping get_maintenance_summary() creation because maintenance tables do not exist yet.';
        return;
    end if;

    execute $fn$
        create or replace function public.get_maintenance_summary(
            p_from_date date default null,
            p_to_date date default null
        )
        returns table (
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
        language sql
        security definer
        set search_path = public
        as $inner$
        with filtered_records as (
            select
                service_type,
                cost_amount,
                coalesce(cost_currency, 'CHF') as cost_currency
            from public.maintenance_records
            where (p_from_date is null or start_date >= p_from_date)
              and (p_to_date is null or start_date <= p_to_date)
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
            from public.maintenance_records
            where odometer_km is not null
            order by odometer_km desc
            limit 1
        ),
        active_tyre_sets as (
            select count(*) as active_tyre_sets
            from public.tyre_sets
            where status = 'active'
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
        $inner$;
    $fn$;

    execute 'grant execute on function public.get_maintenance_summary(date, date) to authenticated, service_role';
end
$$;
