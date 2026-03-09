-- Create notifications table for in-app notifications
create table public.notifications (
  id uuid not null default extensions.uuid_generate_v4(),
  vehicle_id uuid not null,
  type text not null,
  title text not null,
  message text not null,
  data jsonb null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_vehicle_id_fkey foreign key (vehicle_id) references vehicles (id) on delete cascade
);

-- Index for fast unread queries
create index idx_notifications_unread on public.notifications (vehicle_id, is_read, created_at desc);

-- Index for type-based queries
create index idx_notifications_type on public.notifications (type, created_at desc);
