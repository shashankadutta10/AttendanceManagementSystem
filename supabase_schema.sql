-- ==========================================================
-- SecureAttendance Cloud Database Schema for Supabase
-- Paste and run this script in your Supabase SQL Editor
-- ==========================================================

-- 1. Create Institutional Geofence & Schedule Configuration Table
create table if not exists public.attendance_config (
  id text primary key default 'default',
  name text not null default 'SHASHANKA''S HOME',
  latitude numeric not null default 27.459316,
  longitude numeric not null default 94.552332,
  radius integer not null default 300,
  start_time text not null default '00:00',
  end_time text not null default '23:59',
  strict_accuracy boolean not null default false,
  admin_pin text not null default '0310',
  updated_at timestamptz default timezone('utc'::text, now())
);

-- Insert default configuration row if not present
insert into public.attendance_config (id, name, latitude, longitude, radius, start_time, end_time, strict_accuracy, admin_pin)
values ('default', 'SHASHANKA''S HOME', 27.459316, 94.552332, 300, '00:00', '23:59', false, '0310')
on conflict (id) do nothing;

-- 2. Create Attendance Master Audit Records Table
create table if not exists public.attendance_records (
  id text primary key,
  student_name text not null,
  student_id text,
  timestamp text,
  date_str text,
  time_str text,
  location_name text,
  distance_meters numeric,
  gps_accuracy numeric,
  student_lat numeric,
  student_lng numeric,
  selfie_data_url text,
  liveness_verified boolean default true,
  liveness_type text,
  ai_confidence numeric,
  status text default 'Verified',
  submitted_at timestamptz default timezone('utc'::text, now()),
  device_type text,
  offline_recorded boolean default false
);

-- 3. Enable Row Level Security (RLS) & Allow Anonymous Student Check-ins
alter table public.attendance_config enable row level security;
alter table public.attendance_records enable row level security;

-- Public can read geofence settings
drop policy if exists "Allow public read config" on public.attendance_config;
create policy "Allow public read config" on public.attendance_config for select using (true);

-- Public can update geofence settings (admin checks PIN in UI)
drop policy if exists "Allow public update config" on public.attendance_config;
create policy "Allow public update config" on public.attendance_config for all using (true);

-- Students can read records (for admin logs viewer)
drop policy if exists "Allow public select records" on public.attendance_records;
create policy "Allow public select records" on public.attendance_records for select using (true);

-- Students can insert verified attendance records
drop policy if exists "Allow public insert records" on public.attendance_records;
create policy "Allow public insert records" on public.attendance_records for insert with check (true);

-- Allow public upsert for offline bulk syncing
drop policy if exists "Allow public update records" on public.attendance_records;
create policy "Allow public update records" on public.attendance_records for update using (true);

-- Allow admin to delete records
drop policy if exists "Allow public delete records" on public.attendance_records;
create policy "Allow public delete records" on public.attendance_records for delete using (true);
